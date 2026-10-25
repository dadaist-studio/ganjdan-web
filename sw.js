// Ganjdan PWA offline shell: the app opens without internet once it has been opened online.
// Built files (hashed names under _expo/, assets/) are cached on first use; the page itself opens from the cache at once and is
// refreshed in the background (Dara, 2026-10-25: opening waited on the network and showed a black screen). Poet packs live in their own cache (src/data/pack-store.web.ts) and are not touched.
const SHELL = 'ganjdan-shell-v2';
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
    // Any page (deep links too) is the single app page: the cached copy opens instantly, a fresh one is fetched for
    // next time (so a new deploy shows on the second open). No cache yet: straight from the network.
    const fresh = fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(SHELL).then((c) => c.put(scope, copy));
      }
      return res;
    });
    e.waitUntil(fresh.catch(() => {}));
    e.respondWith(caches.match(scope).then((hit) => hit || fresh));
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
