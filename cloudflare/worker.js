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
:root{--bg:#ffd94a;--paper:#fffdf6;--ink:#141414;--soft:#555;--ok:#14b85a;--ko:#ff3b3b;--wait:#e9a400;--blue:#1f5eff}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.4 system-ui,-apple-system,sans-serif;padding:16px}
main{max-width:680px;margin:0 auto;display:flex;flex-direction:column;gap:12px}
h1{margin:0;font-size:1.5rem}.box{background:var(--paper);border:2.5px solid var(--ink);border-radius:12px;padding:12px;box-shadow:3px 3px 0 var(--ink)}
input,button,select{font:inherit}input,select{width:100%;padding:.55em;border:2px solid var(--ink);border-radius:8px;background:#fff}
button{padding:.4em .75em;border:2px solid var(--ink);border-radius:8px;background:#fff;font-weight:700;cursor:pointer}
button.on{background:var(--blue);color:#fff}button.danger{color:var(--ko);border-color:var(--ko)}
.row{display:flex;gap:6px;flex-wrap:wrap;align-items:center}.muted{color:var(--soft);font-size:.9rem}
.pill{font-size:.72rem;font-weight:800;padding:.15em .55em;border-radius:99px;color:#fff;white-space:nowrap}
.s-validée{background:var(--ok)}.s-refusée{background:var(--ko)}.s-attente{background:var(--wait);color:var(--ink)}
.folder{padding:0;overflow:hidden}.folder>summary{list-style:none;cursor:pointer;padding:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.folder>summary::-webkit-details-marker{display:none}.folder>summary .ico{font-size:1.3rem}.folder[open]>summary .ico.c{display:none}.folder:not([open])>summary .ico.o{display:none}
.folder>summary b{font-size:1.05rem}.folder[open]>summary{border-bottom:2px dashed #0003}
.inner{padding:10px 12px;display:flex;flex-direction:column;gap:10px}
.card{border:2px solid var(--ink);border-radius:10px;padding:10px;background:#fff}
details.clues summary{cursor:pointer;font-weight:700}ol{margin:.4em 0;padding-left:1.4em}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}@media(max-width:480px){.grid{grid-template-columns:1fr}}
</style></head><body><main>
<h1>Cartes partagées</h1>
<div class="box" id="login"><p>Mot de passe d’administration</p><div class="row"><input id="pw" type="password" autocomplete="current-password" style="flex:1"><button id="go">Ouvrir</button></div><p class="muted" id="msg"></p></div>
<div class="box" id="tools" hidden>
 <div class="row" id="stchips"></div>
 <div class="grid" style="margin-top:8px"><input id="q" type="search" placeholder="Rechercher une carte ou un créateur…"><select id="sort"><option value="recent">Plus récentes d’abord</option><option value="az">Ordre alphabétique</option><option value="cat">Par catégorie</option></select></div>
 <div class="row" style="margin-top:8px;justify-content:space-between"><span class="muted" id="count"></span><span class="row"><button id="openall">Tout ouvrir</button><button id="closeall">Tout fermer</button></span></div>
</div>
<div id="list" style="display:flex;flex-direction:column;gap:12px"></div>
</main><script>
var PW=sessionStorage.getItem("pw")||"",CARDS=[],ST="",OPEN=JSON.parse(sessionStorage.getItem("open")||"[]");
var NONE="(sans nom)";
function api(p,o){o=o||{};return fetch("/admin/api/"+p,{method:o.method||"GET",body:o.body,headers:{Authorization:"Bearer "+PW,"Content-Type":"text/plain"}}).then(function(r){return r.json()})}
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]})}
function norm(s){return String(s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"")}
function who(c){return (c.author||"").trim()||NONE}
function pill(s){return '<span class="pill s-'+(s==="en attente"?"attente":s)+'">'+s+'</span>'}
function saveOpen(){sessionStorage.setItem("open",JSON.stringify(OPEN))}
async function refresh(){var r=await api("cards");if(!r.ok){document.getElementById("msg").textContent=r.error;return}
 sessionStorage.setItem("pw",PW);document.getElementById("login").hidden=true;document.getElementById("tools").hidden=false;CARDS=r.cards;draw()}
function draw(){
 var q=norm(document.getElementById("q").value),sort=document.getElementById("sort").value;
 var n={"":CARDS.length,"en attente":0,"validée":0,"refusée":0};CARDS.forEach(function(c){n[c.status]=(n[c.status]||0)+1});
 document.getElementById("stchips").innerHTML=[["","Toutes"],["en attente","En attente"],["validée","Validées"],["refusée","Refusées"]].map(function(x){return '<button class="'+(ST===x[0]?"on":"")+'" data-st="'+x[0]+'">'+x[1]+' ('+(n[x[0]]||0)+')</button>'}).join("");
 var list=CARDS.filter(function(c){return (!ST||c.status===ST)&&(!q||norm(c.answer).indexOf(q)>=0||norm(who(c)).indexOf(q)>=0)});
 var cmp={recent:function(a,b){return String(b.updated).localeCompare(String(a.updated))},az:function(a,b){return a.answer.localeCompare(b.answer,"fr",{sensitivity:"base"})},cat:function(a,b){return a.cat.localeCompare(b.cat)||a.answer.localeCompare(b.answer,"fr",{sensitivity:"base"})}}[sort];
 var groups={};list.forEach(function(c){(groups[who(c)]=groups[who(c)]||[]).push(c)});
 var names=Object.keys(groups).sort(function(a,b){return a===NONE?1:b===NONE?-1:a.localeCompare(b,"fr",{sensitivity:"base"})});
 document.getElementById("count").textContent=list.length+" carte"+(list.length>1?"s":"")+" · "+names.length+" créateur"+(names.length>1?"s":"");
 if(!CARDS.length){document.getElementById("list").innerHTML='<div class="box">Aucune carte partagée pour l’instant.</div>';return}
 if(!list.length){document.getElementById("list").innerHTML='<div class="box">Aucune carte ne correspond.</div>';return}
 document.getElementById("list").innerHTML=names.map(function(a){var cs=groups[a].sort(cmp),w=cs.filter(function(c){return c.status==="en attente"}).length;
  return '<details class="box folder" data-folder="'+esc(a)+'"'+(OPEN.indexOf(a)>=0||q?" open":"")+'><summary><span class="ico c">📁</span><span class="ico o">📂</span><b>'+esc(a)+'</b><span class="muted">'+cs.length+' carte'+(cs.length>1?"s":"")+'</span>'+(w?pill("en attente").replace("en attente",w+" en attente"):"")+'</summary><div class="inner">'
  +'<div class="row"><span class="muted" style="flex:1">Tout le dossier :</span>'+(w?'<button data-all="validée" data-who="'+esc(a)+'">Tout valider</button>':"")+'<button class="danger" data-alldel="'+esc(a)+'">Tout supprimer</button></div>'
  +cs.map(function(c){return '<div class="card"><div class="row" style="justify-content:space-between"><b>'+esc(c.answer)+'</b>'+pill(c.status)+'</div>'
   +'<p class="muted" style="margin:.2em 0">'+esc(c.cat)+' · '+new Date(c.updated).toLocaleString("fr-FR")+'</p>'
   +'<details class="clues"><summary>Les 20 indices</summary><ol>'+c.clues.map(function(t){return '<li>'+esc(t)+'</li>'}).join("")+'</ol></details>'
   +'<div class="row" style="margin-top:8px">'+(c.status!=="validée"?'<button data-s="validée" data-id="'+c.id+'">Valider</button>':"")+(c.status!=="refusée"?'<button data-s="refusée" data-id="'+c.id+'">Refuser</button>':"")+'<button class="danger" data-del="'+c.id+'">Supprimer</button></div></div>'}).join("")
  +'</div></details>'}).join("")}
document.getElementById("go").onclick=function(){PW=document.getElementById("pw").value;refresh()};
document.getElementById("pw").onkeydown=function(e){if(e.key==="Enter")document.getElementById("go").click()};
document.getElementById("q").oninput=draw;document.getElementById("sort").onchange=draw;
document.getElementById("stchips").onclick=function(e){var b=e.target.closest("button");if(b){ST=b.dataset.st;draw()}};
document.getElementById("openall").onclick=function(){OPEN=Object.keys(CARDS.reduce(function(o,c){o[who(c)]=1;return o},{}));saveOpen();draw()};
document.getElementById("closeall").onclick=function(){OPEN=[];saveOpen();draw()};
document.getElementById("list").addEventListener("toggle",function(e){var f=e.target.closest&&e.target.closest("[data-folder]");if(!f||e.target!==f)return;var a=f.dataset.folder;OPEN=OPEN.filter(function(x){return x!==a});if(f.open)OPEN.push(a);saveOpen()},true);
document.getElementById("list").onclick=async function(e){var b=e.target.closest("button");if(!b)return;
 if(b.dataset.s)await api("status",{method:"POST",body:JSON.stringify({id:b.dataset.id,status:b.dataset.s})});
 if(b.dataset.del&&confirm("Supprimer cette carte du partage ?"))await api("delete",{method:"POST",body:JSON.stringify({id:b.dataset.del})});
 if(b.dataset.all){var cs=CARDS.filter(function(c){return who(c)===b.dataset.who&&c.status==="en attente"});for(var i=0;i<cs.length;i++)await api("status",{method:"POST",body:JSON.stringify({id:cs[i].id,status:"validée"})})}
 if(b.dataset.alldel){var ds=CARDS.filter(function(c){return who(c)===b.dataset.alldel});if(confirm("Supprimer les "+ds.length+" cartes de « "+b.dataset.alldel+" » du partage ?"))for(var j=0;j<ds.length;j++)await api("delete",{method:"POST",body:JSON.stringify({id:ds[j].id})})}
 refresh()};
if(PW)refresh();
</script></body></html>`;
