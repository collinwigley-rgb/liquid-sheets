/* Offline-first service worker. Caches the app shell so a draft survives dead
 * ballroom wifi (non-negotiable constraint #4). Bump CACHE on any shell change.
 * Same-origin shell files are served cache-first; everything else (the user's
 * own Sleeper/import fetches, and any self-host copilot server) goes to the
 * network and is never cached. */

const CACHE = "liquid-sheets-v83";
/* copilot.js is deliberately NOT precached: the hosted build (config.AI_ENDPOINT
 * null) never imports it, so shipping it in the shell would cache an AI module
 * the app never runs. A self-hoster who sets AI_ENDPOINT gets it via the runtime
 * dynamic import() in app.js, which the network handler below serves and caches
 * on demand. This keeps the hosted cache genuinely AI-free. */
const SHELL = [
  "/app/",
  "/app/index.html",
  "/app/app.js",
  "/app/config.js",
  "/app/plan.js",
  "/app/storage.js",
  "/app/importers.js",
  "/app/draft.js",
  "/app/sleeper.js",
  "/app/prior_2026.js",
  "/app/live_draft.js",
  "/app/player_history.js",
  "/app/money_talks_config.js",
  "/app/fantasyengine_projections.js",
  "/app/actual_stats.js",
  "/engine/engine.js",
];

/* GitHub Pages sits behind a CDN (Fastly) that can hand this install step
 * a stale cached copy of a shell file even right after a fresh deploy --
 * verified live 2026-09-03: CACHE had correctly bumped to a new name, but
 * the content stored under it was still the previous version, because
 * c.add(u)'s plain fetch(u) is exactly as vulnerable to edge staleness as
 * the Sleeper API calls fixed earlier today (see live_draft.js's
 * noCacheFetch). Same fix, same reasoning: a fetch with no unique query
 * param is a cache HIT at the edge, unique-per-deploy or not. CACHE
 * itself is already unique every time this file changes, so it doubles
 * as the cache-buster -- fetched with it, stored without it, so
 * caches.match(req) in the fetch handler below still finds it. */
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE)
    .then((c) => Promise.allSettled(SHELL.map((u) => {
      const bust = u.includes("?") ? "&" : "?";
      return fetch(`${u}${bust}_sw=${CACHE}`, { cache: "no-store" })
        .then((res) => { if (res.ok) return c.put(u, res); });
    })))
    .then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE)
      .map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // never cache cross-origin
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match("/app/index.html"))));
});
