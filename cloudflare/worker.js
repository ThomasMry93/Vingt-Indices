/**
 * Vingt Indices – collection commune de cartes (Cloudflare Worker + KV)
 *
 * - GET  /cards        : les cartes validées (pour tous les téléphones)
 * - POST /cards        : envoyer des cartes { key, cards:[{ id, cat, answer, author, clues[20] }] } (ou { key, card })
 *                        (refusé sans clé d'accès valable)
 * - GET  /admin        : page d'administration (mot de passe ADMIN_PASSWORD)
 *
 * Réglages (Settings → Variables and Secrets du Worker) :
 * - ADMIN_PASSWORD (secret, obligatoire) : mot de passe de la page /admin
 * - AUTO_VALIDATE  (texte, facultatif)   : "false" pour valider les cartes à la main (par défaut : visibles tout de suite)
 * Liaison KV : un espace de noms KV relié sous le nom de variable CARDS.
 */

// Empreintes des clés d'accès (mêmes que dans le jeu). Les clés elles-mêmes ne sont pas ici.
const KEY_SALT = "vingt-indices/2026";
const KEY_HASHES = [
  "1fffe36f253a6c0226c37817a5ec4231720cf3280835b36cc135493f2f4fd072",
  "4d7170cdc93206c77a9603b6a9e57f9e28d417ec27c5bceacd66a54d381c7e55",
  "2bc6fa46259fc8d59aad198b1873be32d2b179180cf153897f1ae24cc46781e3",
  "00ed92af62d591fa7a8a812468bb63fd83759e31283145902aac9694192b2f34",
  "30f874a5fc10a0f6610c8d1dcdb8aff258a327c8a0350ea716c5ef418e539309",
  "e412ddf4483fecbe592daf248138c9e40f125803bb08bb1a14cda868b4c89bc5",
  "187a163c20d5f36a918e1b5e2318696cf9e904bb0854b8ceff92a606702e6b6b",
];

const CATS = ["Personnage", "Lieu", "Chose"];
const STORE_KEY = "cards"; // toute la collection tient dans une seule entrée KV (lecture en un coup)
const MAX_CARDS = 2000;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    try {
      if (url.pathname === "/cards" && request.method === "GET") return await listPublic(env);
      if (url.pathname === "/cards" && request.method === "POST") return await addCard(request, env);
      if (url.pathname === "/admin" && request.method === "GET") return new Response(ADMIN_PAGE, { headers: { "Content-Type": "text/html; charset=utf-8" } });
      if (url.pathname.startsWith("/admin/api/")) return await admin(request, env, url.pathname.slice(11));
      if (url.pathname === "/") return json({ ok: true, service: "Vingt Indices – cartes partagées", stockage: env.CARDS ? "relié" : "NON RELIÉ (binding KV CARDS manquant)", admin: env.ADMIN_PASSWORD ? "mot de passe défini" : "ADMIN_PASSWORD manquant" });
      return json({ ok: false, error: "introuvable" }, 404);
    } catch (e) {
      return json({ ok: false, error: env.CARDS ? "erreur du serveur : " + (e && e.message) : "stockage non relié (binding KV CARDS manquant)" }, 500);
    }
  },
};

// ---- Public -------------------------------------------------------------------

async function listPublic(env) {
  const cards = (await load(env)).filter(c => c.status === "validée")
    .map(({ id, cat, answer, clues, author, updated }) => ({ id, cat, answer, clues, author, updated }));
  return json({ ok: true, cards });
}

async function addCard(request, env) {
  let body;
  try { body = JSON.parse(await request.text()); } catch (e) { return json({ ok: false, error: "requête illisible" }, 400); }
  if (!(await keyOk(body.key))) return json({ ok: false, error: "clé d'accès non valable" }, 403);

  // Une carte { card } ou plusieurs { cards: [...] } en un seul envoi (une seule écriture KV).
  const list = Array.isArray(body.cards) ? body.cards.slice(0, 500) : [body.card || {}];
  const auto = String(env.AUTO_VALIDATE ?? "true").toLowerCase() !== "false";
  const cards = await load(env);
  const now = new Date().toISOString();
  let added = 0, updated = 0, bad = 0, full = 0;
  for (const c of list) {
    const id = String(c.id || "").replace(/[^\w-]/g, "").slice(0, 60);
    const answer = String(c.answer || "").trim().slice(0, 120);
    const cat = CATS.includes(c.cat) ? c.cat : "Chose";
    const clues = Array.isArray(c.clues) ? c.clues.map(t => String(t).trim().slice(0, 200)) : [];
    if (!id || !answer || clues.length !== 20 || clues.some(t => !t)) { bad++; continue; }
    const author = String(c.author || body.author || "").trim().slice(0, 40);
    const at = cards.findIndex(x => x.id === id);
    if (at >= 0) {
      // Même carte renvoyée (modifiée) : mise à jour, statut conservé.
      cards[at] = { ...cards[at], cat, answer, clues, author: author || cards[at].author, updated: now };
      updated++;
    } else if (cards.length >= MAX_CARDS) {
      full++;
    } else {
      cards.push({ id, cat, answer, clues, author, status: auto ? "validée" : "en attente", created: now, updated: now });
      added++;
    }
  }
  if (added || updated) await save(env, cards);
  if (!added && !updated) return json({ ok: false, error: full ? "collection pleine" : "carte incomplète (une réponse et 20 indices)", bad, full }, full ? 507 : 400);
  return json({ ok: true, added, updated, bad, full, status: auto ? "validée" : "en attente" });
}

// ---- Administration -----------------------------------------------------------

async function admin(request, env, action) {
  const auth = request.headers.get("Authorization") || "";
  if (!env.ADMIN_PASSWORD || auth !== "Bearer " + env.ADMIN_PASSWORD) return json({ ok: false, error: "mot de passe incorrect" }, 401);
  const cards = await load(env);
  if (action === "cards" && request.method === "GET") return json({ ok: true, cards });
  if (request.method !== "POST") return json({ ok: false, error: "méthode non prise en charge" }, 405);
  const { id, status } = JSON.parse(await request.text());
  const at = cards.findIndex(c => c.id === id);
  if (at < 0) return json({ ok: false, error: "carte introuvable" }, 404);
  if (action === "status" && ["validée", "en attente", "refusée"].includes(status)) {
    cards[at].status = status;
  } else if (action === "delete") {
    cards.splice(at, 1);
  } else {
    return json({ ok: false, error: "action inconnue" }, 400);
  }
  await save(env, cards);
  return json({ ok: true });
}

// ---- Outils -------------------------------------------------------------------

async function load(env) {
  const raw = await env.CARDS.get(STORE_KEY);
  try { return raw ? JSON.parse(raw) : []; } catch (e) { return []; }
}
async function save(env, cards) { await env.CARDS.put(STORE_KEY, JSON.stringify(cards)); }

async function keyOk(key) {
  const norm = String(key || "").trim().toUpperCase().normalize("NFD").replace(/[̀-ͯ\s-]/g, "");
  if (!norm) return false;
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(KEY_SALT + norm));
  const hex = [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, "0")).join("");
  return KEY_HASHES.includes(hex);
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...CORS } });
}

const ADMIN_PAGE = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cartes partagées – Vingt Indices</title>
<style>
:root{--bg:#ffd94a;--paper:#fffdf6;--ink:#141414;--soft:#555;--ok:#14b85a;--ko:#ff3b3b;--wait:#e9a400}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.4 system-ui,-apple-system,sans-serif;padding:16px}
main{max-width:640px;margin:0 auto;display:flex;flex-direction:column;gap:12px}
h1{margin:0;font-size:1.5rem}.box{background:var(--paper);border:2.5px solid var(--ink);border-radius:12px;padding:12px;box-shadow:3px 3px 0 var(--ink)}
input,button{font:inherit}input{width:100%;padding:.6em;border:2px solid var(--ink);border-radius:8px}
button{padding:.45em .8em;border:2px solid var(--ink);border-radius:8px;background:#fff;font-weight:700;cursor:pointer}
.row{display:flex;gap:6px;flex-wrap:wrap;align-items:center}.muted{color:var(--soft);font-size:.9rem}
.pill{font-size:.75rem;font-weight:800;padding:.15em .6em;border-radius:99px;color:#fff}
.s-validée{background:var(--ok)}.s-refusée{background:var(--ko)}.s-attente{background:var(--wait);color:var(--ink)}
details summary{cursor:pointer;font-weight:700}ol{margin:.4em 0;padding-left:1.4em}
</style></head><body><main>
<h1>Cartes partagées</h1>
<div class="box" id="login"><p>Mot de passe d'administration</p><div class="row"><input id="pw" type="password" autocomplete="current-password"><button id="go">Ouvrir</button></div><p class="muted" id="msg"></p></div>
<div id="list"></div>
</main><script>
let PW=sessionStorage.getItem("pw")||"";
const api=(p,o={})=>fetch("/admin/api/"+p,{...o,headers:{Authorization:"Bearer "+PW,"Content-Type":"text/plain"}}).then(r=>r.json());
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
async function refresh(){const r=await api("cards");if(!r.ok){document.getElementById("msg").textContent=r.error;return}
 sessionStorage.setItem("pw",PW);document.getElementById("login").hidden=true;
 const order={"en attente":0,"validée":1,"refusée":2};
 const cards=r.cards.sort((a,b)=>order[a.status]-order[b.status]||String(b.updated).localeCompare(a.updated));
 document.getElementById("list").innerHTML=cards.length?cards.map(c=>'<div class="box"><div class="row" style="justify-content:space-between"><b>'+esc(c.answer)+'</b><span class="pill s-'+(c.status==="en attente"?"attente":c.status)+'">'+c.status+'</span></div>'
  +'<p class="muted">'+esc(c.cat)+(c.author?' · par '+esc(c.author):'')+' · '+new Date(c.updated).toLocaleString("fr-FR")+'</p>'
  +'<details><summary>Les 20 indices</summary><ol>'+c.clues.map(t=>'<li>'+esc(t)+'</li>').join("")+'</ol></details>'
  +'<div class="row" style="margin-top:8px"><button data-s="validée" data-id="'+c.id+'">Valider</button><button data-s="refusée" data-id="'+c.id+'">Refuser</button><button data-del="'+c.id+'">Supprimer</button></div></div>').join("")
  :'<div class="box">Aucune carte partagée pour l\\'instant.</div>'}
document.getElementById("go").onclick=()=>{PW=document.getElementById("pw").value;refresh()};
document.getElementById("list").onclick=async e=>{const b=e.target.closest("button");if(!b)return;
 if(b.dataset.s)await api("status",{method:"POST",body:JSON.stringify({id:b.dataset.id,status:b.dataset.s})});
 if(b.dataset.del&&confirm("Supprimer cette carte du partage ?"))await api("delete",{method:"POST",body:JSON.stringify({id:b.dataset.del})});
 refresh()};
if(PW)refresh();
</script></body></html>`;
