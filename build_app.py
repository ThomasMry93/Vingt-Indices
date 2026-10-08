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
<meta name="theme-color" content="#1f3a8a">
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
if("serviceWorker" in navigator){{window.addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(()=>{{}}))}}
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
    "background_color": "#1f3a8a",
    "theme_color": "#1f3a8a",
    "icons": [
        {"src": "icon-192.png", "sizes": "192x192", "type": "image/png"},
        {"src": "icon-512.png", "sizes": "512x512", "type": "image/png"},
        {"src": "icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
    ],
}
(OUT / "manifest.webmanifest").write_text(json.dumps(manifest, ensure_ascii=False, indent=1))

sw = f"""// Hors connexion : copie locale de l'appli, mise à jour en arrière-plan à chaque ouverture.
const CACHE="vingt-indices-{version}";
const SHELL=["./","index.html","manifest.webmanifest","icon-180.png","icon-192.png","icon-512.png"];
self.addEventListener("install",e=>{{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))}});
self.addEventListener("activate",e=>{{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))}});
self.addEventListener("fetch",e=>{{
  if(e.request.method!=="GET")return;
  e.respondWith(caches.open(CACHE).then(async c=>{{
    const hit=await c.match(e.request,{{ignoreSearch:true}});
    const net=fetch(e.request).then(r=>{{if(r&&(r.ok||r.type==="opaque"))c.put(e.request,r.clone());return r}}).catch(()=>hit);
    return hit||net;
  }}));
}});
"""
(OUT / "sw.js").write_text(sw)
print("built", version)
