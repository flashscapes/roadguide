const CACHE = 'roadguide-v1';
const CORE = ['/skyGuide/', '/skyGuide/index.html', '/skyGuide/landmarks.js', '/skyGuide/icon-192.png', '/skyGuide/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => {
      if(cached) return cached;
      return fetch(e.request).then(res => {
        if(res && res.status===200){ const c=res.clone(); caches.open(CACHE).then(cache=>cache.put(e.request,c)); }
        return res;
      }).catch(()=>cached);
    })
  );
});
