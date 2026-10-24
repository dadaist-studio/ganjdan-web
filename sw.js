// Ganjdan PWA offline shell: the app opens without internet once it has been opened online.
// Built files (hashed names under _expo/, assets/) are cached on first use; the page itself is network-first with
// the cached copy as fallback. Poet packs live in their own cache (src/data/pack-store.web.ts) and are not touched.
const SHELL = 'ganjdan-shell-v1';
const scope = self.registration.scope; // e.g. https://dadaist-studio.github.io/ganjdan-web/

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.add(scope)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('ganjdan-shell-') && k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || !req.url.startsWith(scope) || req.url.includes('/packs/')) return;
  if (req.mode === 'navigate') {
    // Any page (deep links too) is the single app page: fresh when online, cached when not.
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put(scope, copy));
          return res;
        })
        .catch(() => caches.match(scope)),
    );
    return;
  }
  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(SHELL).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
