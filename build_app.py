"""Construit la version installable (PWA) de Vingt Indices à partir de vingt-indices.html."""
import json, re, time, pathlib

ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT / "source" / "vingt-indices.html"
OUT = ROOT
src = SRC.read_text()
version = time.strftime("%Y%m%d%H%M%S")

# <title> + liens de police déjà en tête du fichier source : on les remonte dans <head>
title = re.search(r"<title>.*?</title>\n?", src).group(0)
fonts = re.search(r'<link rel="stylesheet" href="https://fonts\.googleapis\.com[^>]*>\n?', src).group(0)
body = src.replace(title, "", 1).replace(fonts, "", 1)

head = f"""<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
{title.strip()}
<meta name="theme-color" content="#d8c29c">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="20 Indices">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<link rel="apple-touch-icon" href="icon-180.png">
<link rel="icon" type="image/png" sizes="192x192" href="icon-192.png">
<link rel="manifest" href="manifest.webmanifest">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
{fonts.strip()}
<style>
:root{{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}}
*,*::before,*::after{{box-sizing:border-box}}
body{{margin:0;-webkit-tap-highlight-color:transparent;overscroll-behavior-y:none}}
img{{max-width:100%}}
[hidden]{{display:none!important}}
</style>
</head>
<body>
"""
tail = f"""
<script>
/* Mise à jour : la nouvelle version s'installe en arrière-plan, puis le bandeau propose de l'appliquer. */
if("serviceWorker" in navigator){{
  let reloading=false;
  navigator.serviceWorker.addEventListener("controllerchange",()=>{{if(reloading)return;reloading=true;location.reload()}});
  window.addEventListener("load",()=>{{
    navigator.serviceWorker.register("sw.js").then(reg=>{{
      const ask=w=>{{if(w&&navigator.serviceWorker.controller&&window.VI_showUpdate)window.VI_showUpdate(()=>w.postMessage("skipWaiting"))}};
      if(reg.waiting)ask(reg.waiting);
      reg.addEventListener("updatefound",()=>{{const w=reg.installing;if(w)w.addEventListener("statechange",()=>{{if(w.state==="installed")ask(w)}})}});
      document.addEventListener("visibilitychange",()=>{{if(document.visibilityState==="visible")reg.update().catch(()=>{{}})}});
    }}).catch(()=>{{}});
  }});
}}
</script>
</body>
</html>
"""
(OUT / "index.html").write_text(head + body + tail)

manifest = {
    "name": "Vingt Indices",
    "short_name": "20 Indices",
    "description": "Jeu de devinettes à 20 indices",
    "lang": "fr",
    "start_url": "./",
    "scope": "./",
    "display": "standalone",
    "orientation": "portrait",
    "background_color": "#d8c29c",
    "theme_color": "#d8c29c",
    "icons": [
        {"src": "icon-192.png", "sizes": "192x192", "type": "image/png"},
        {"src": "icon-512.png", "sizes": "512x512", "type": "image/png"},
        {"src": "icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
    ],
}
(OUT / "manifest.webmanifest").write_text(json.dumps(manifest, ensure_ascii=False, indent=1))

sw = f"""// Hors connexion : l'appli est gardée en local. Une nouvelle version s'installe en arrière-plan
// et attend que le joueur touche « Mettre à jour » (ou que l'appli soit fermée complètement).
const CACHE="vingt-indices-{version}";
const SHELL=["./","index.html","manifest.webmanifest","icon-180.png","icon-192.png","icon-512.png"];
self.addEventListener("install",e=>{{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL.map(u=>new Request(u,{{cache:"reload"}})))))}});
self.addEventListener("message",e=>{{if(e.data==="skipWaiting")self.skipWaiting()}});
self.addEventListener("activate",e=>{{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith("vingt-indices-")&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))}});
self.addEventListener("fetch",e=>{{
  const req=e.request;if(req.method!=="GET")return;
  const url=new URL(req.url);
  if(url.origin===location.origin){{
    // Fichiers de l'appli : toujours la version installée, pour que la mise à jour soit nette.
    e.respondWith(caches.open(CACHE).then(async c=>{{
      const hit=req.mode==="navigate"?await c.match("index.html"):await c.match(req,{{ignoreSearch:true}});
      return hit||fetch(req);
    }}));
    return;
  }}
  // Polices : copie locale, rafraîchie en arrière-plan.
  e.respondWith(caches.open("vingt-indices-fonts").then(async c=>{{
    const hit=await c.match(req);
    const net=fetch(req).then(r=>{{if(r&&(r.ok||r.type==="opaque"))c.put(req,r.clone());return r}}).catch(()=>hit);
    return hit||net;
  }}));
}});
"""
(OUT / "sw.js").write_text(sw)
print("built", version)
