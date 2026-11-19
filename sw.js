// Ganjdan PWA offline shell: the app opens without internet once it has been opened online.
// Built files (hashed names under _expo/, assets/) are cached on first use; the page itself opens from the cache at once and is
// refreshed in the background (Dara, 2026-10-25: opening waited on the network and showed a black screen). Poet packs live in their own cache (src/data/pack-store.web.ts) and are not touched.
const SHELL = 'ganjdan-shell-v3'; // v3: drops shells stuck on a deleted build (2026-11-03)
const scope = self.registration.scope; // e.g. https://dadaist-studio.github.io/ganjdan-web/
// Only the app page is kept as the page: opening a file in the tab (an icon, manifest.json) is a navigation too,
// and it replaced the cached page, so the next open showed that file.
const isPage = (res) => (res.ok || res.status === 404) && (res.headers.get('content-type') ?? '').includes('text/html');

// Keeps the page and fetches the script and font files it names. The first visit loads those before this worker
// controls the page, so they never passed through `fetch` below: the second open, and the first one after every
// deploy, downloaded all 3 MB again behind the boot screen (Dara, 2026-11-12: starts of 10 s to minutes).
// `shown` = the page this open is running. When it already is the newest, scripts of older builds are dropped:
// every deploy left its 3 to 8 MB in the cache for good, and a full cache can make the phone clear the whole site,
// downloaded poets included. build.json (tools/deploy-web.sh) lists the newest build's scripts.
async function keep(res, shown) {
  const html = await res.clone().text();
  const c = await caches.open(SHELL);
  await c.put(scope, res);
  const files = [...html.matchAll(/(?:src|href)="([^"]*\/(?:_expo|assets)\/[^"]+)"/g)].map((m) => new URL(m[1], scope).href);
  await Promise.all(files.map(async (u) => (await c.match(u)) || c.add(u).catch(() => {})));
  if (!shown || (await shown.text()) !== html) return;
  const list = await (await fetch(scope + 'build.json', { cache: 'no-store' })).json();
  const live = new Set(list.map((f) => new URL(f, scope).href));
  // The page can be up to 10 min older than build.json (HTTP cache): never drop the scripts this page itself names.
  if (!files.every((u) => !u.includes('/_expo/') || live.has(u))) return;
  for (const k of await c.keys()) if (k.url.includes('/_expo/static/js/') && !live.has(k.url)) await c.delete(k);
}

self.addEventListener('install', (e) => {
  e.waitUntil(fetch(scope).then((res) => (res.ok && isPage(res) ? keep(res) : Promise.reject(res.status))).then(() => self.skipWaiting()));
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
      // Pages serves deep links (/search) as 404.html, which is the same app page: keep it too, or a phone that opens
      // the app at a deep link keeps an old page whose deleted bundles never load.
      // A new deploy is fetched whole here, behind the app already open from the cache, so the next open is instant too.
      if (isPage(res)) {
        const copy = res.clone();
        e.waitUntil(caches.match(scope).then((shown) => keep(copy, shown)).catch(() => {}));
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
