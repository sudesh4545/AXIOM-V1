const CACHE_NAME = 'axiom-static-v2';
const MAX_ASSETS = 100;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('axiom-static-') && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const immutable = url.pathname.startsWith('/_next/static/') || /^\/assets\/[^/]+-[\w-]{8,}\.(js|css)$/.test(url.pathname);
  const isStaticAsset = immutable || url.pathname.startsWith('/brand/');
  if (!isStaticAsset) return;

  const update = async () => {
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') {
      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
        const keys = await cache.keys();
        await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_ASSETS)).map((key) => cache.delete(key)));
      } catch { /* Cache quotas must not block a successful response. */ }
    }
    return response;
  };
  const cached = caches.match(request).catch(() => undefined);
  if (immutable) event.respondWith(cached.then((hit) => hit || update()));
  else {
    const fresh = update();
    event.waitUntil(fresh.then(() => {}).catch(() => {}));
    event.respondWith(cached.then((hit) => hit || fresh));
  }
});
