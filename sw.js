// Hors connexion : l'appli est gardée en local. Une nouvelle version s'installe en arrière-plan
// et attend que le joueur touche « Mettre à jour » (ou que l'appli soit fermée complètement).
const CACHE="vingt-indices-20261009103138";
const SHELL=["./","index.html","manifest.webmanifest","icon-180.png","icon-192.png","icon-512.png"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL.map(u=>new Request(u,{cache:"reload"})))))});
self.addEventListener("message",e=>{if(e.data==="skipWaiting")self.skipWaiting()});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith("vingt-indices-")&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",e=>{
  const req=e.request;if(req.method!=="GET")return;
  const url=new URL(req.url);
  if(url.origin===location.origin){
    // Fichiers de l'appli : toujours la version installée, pour que la mise à jour soit nette.
    e.respondWith(caches.open(CACHE).then(async c=>{
      const hit=req.mode==="navigate"?await c.match("index.html"):await c.match(req,{ignoreSearch:true});
      return hit||fetch(req);
    }));
    return;
  }
  // Polices : copie locale, rafraîchie en arrière-plan.
  e.respondWith(caches.open("vingt-indices-fonts").then(async c=>{
    const hit=await c.match(req);
    const net=fetch(req).then(r=>{if(r&&(r.ok||r.type==="opaque"))c.put(req,r.clone());return r}).catch(()=>hit);
    return hit||net;
  }));
});
