// Shaberi service worker: network-first with an offline cache (from Kanji Nexus / Reibun).
//
// * Online: every same-origin GET goes to the network (so deploys are picked up
//   immediately) and the response refreshes the cache.
// * Offline / network failing: the cached copy is served.
// * Install: the whole app is precached so it works offline after one visit.
//
// CI replaces VERSION and PRECACHE at deploy time (see tools/stamp-deploy.sh).
// Locally they stay as below and pages are cached as they are visited.
// Cross-origin requests are never touched.

const VERSION = 'dev';
const PRECACHE = [];
const CACHE = `shaberi-${VERSION}`;
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('shaberi-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  const isPage = request.mode === 'navigate';
  // Pages are cached without their query so one entry serves every deep link.
  const key = isPage ? new URL(request.url).origin + new URL(request.url).pathname : request;
  const fromCache = async () =>
    (await cache.match(key)) ||
    (isPage ? (await cache.match(new URL('./index.html', self.location).href)) || (await cache.match(new URL('./', self.location).href)) : undefined);

  // Pages always revalidate (bypassing the HTTP cache), so a new deploy's HTML, which
  // points at new ?v= asset URLs, is picked up immediately.
  const network = (isPage ? fetch(request.url, { cache: 'no-cache', credentials: 'same-origin' }) : fetch(request)).then((response) => {
    if (response.ok) cache.put(key, response.clone());
    return response;
  });
  try {
    const winner = await Promise.race([network, new Promise((r) => setTimeout(r, NETWORK_TIMEOUT_MS, 'timeout'))]);
    if (winner !== 'timeout') return winner;
    return (await fromCache()) || (await network);
  } catch (err) {
    const cached = await fromCache();
    if (cached) return cached;
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith(networkFirst(request));
});
