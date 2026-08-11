/*
 * Hermes Console service worker.
 * Bump CACHE_VERSION on every release: activation removes stale Hermes Console
 * caches while leaving caches owned by other same-origin applications alone.
 */
const CACHE_VERSION = "v3";
const CACHE_PREFIX = "hermes-console-";
const CACHE_NAME = `${CACHE_PREFIX}${CACHE_VERSION}`;
const OFFLINE_URL = "/offline.html";
const APP_SHELL = [
  "/",
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/favicon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const manifestResponse = await fetch("/precache-manifest.json", {
        cache: "no-store",
      });
      if (!manifestResponse.ok) throw new Error("Precache manifest unavailable");
      const payload = await manifestResponse.json();
      const assets = Array.isArray(payload.assets)
        ? payload.assets.filter(
            (asset) => typeof asset === "string" && asset.startsWith("/assets/"),
          )
        : [];
      if (!assets.length) throw new Error("Precache manifest is empty");
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll([...APP_SHELL, "/precache-manifest.json", ...assets]);
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      );
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable();
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

/** Navigations stay network-first so a new build is picked up as soon as it ships. */
async function handleNavigation(event) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const preloaded = await event.preloadResponse;
    const response = preloaded || (await fetch(event.request));
    cache.put("/", response.clone());
    return response;
  } catch {
    return (await cache.match("/")) ?? (await cache.match(OFFLINE_URL)) ?? Response.error();
  }
}

/** Vite emits content-hashed file names, so a hit in /assets/ is always the right bytes. */
async function handleAsset(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

/** Icons, manifest and the rest of /public: serve fast, refresh in the background. */
async function handleStatic(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached ?? network;
}

/** Build identity is always fetched fresh; it drives updates when sw.js is unchanged. */
async function handleVersion(request) {
  try {
    return await fetch(request, { cache: "no-store" });
  } catch {
    return new Response(null, { status: 503, statusText: "Version unavailable" });
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname === "/version.json") {
    event.respondWith(handleVersion(request));
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(event));
    return;
  }
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(handleAsset(request));
    return;
  }
  event.respondWith(handleStatic(request));
});
