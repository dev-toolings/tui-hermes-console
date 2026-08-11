/**
 * Progressive web app plumbing: install prompt plus safe, automatic updates.
 * The worker is registered in production builds only; caching Vite's unbundled
 * development modules would break hot reload.
 */

export type InstallOutcome = "accepted" | "dismissed" | "unavailable";

export type PwaUpdateState = {
  /** A draft that has not yet been persisted. */
  dirty?: boolean;
  /** A long-running UI action that must not be interrupted. */
  busy?: boolean;
};

/**
 * UI contract: call `setPwaUpdateState({ dirty: true })`, or dispatch this
 * event with the same detail, while a draft must survive a page reload.
 */
export const PWA_UPDATE_STATE_EVENT = "hermes:pwa-update-state";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type VersionPayload = { buildId?: unknown };

export type PwaReloadSnapshot = {
  dirty: boolean;
  busy: boolean;
  visibilityState: DocumentVisibilityState;
  activeElement: Element | null;
};

const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;
const DEFERRED_RECHECK_MS = 15 * 1000;
const MAX_DEFERRED_RECHECKS = 20;
const RELOAD_LOOP_GUARD_MS = 15 * 1000;
const RELOAD_LOOP_GUARD_KEY = "hermes:pwa-last-reload";
const HERMES_CACHE_PREFIX = "hermes-console-";
const NON_TEXT_INPUT_TYPES = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let waitingWorker: ServiceWorker | null = null;
let registration: ServiceWorkerRegistration | null = null;
let activatingWorker: ServiceWorker | null = null;
let updateState: Required<PwaUpdateState> = { dirty: false, busy: false };
let reloadPending = false;
let reloading = false;
let deferredRecheckCount = 0;
let deferredRecheckTimer: number | null = null;
let pwaSetup = false;
const installListeners = new Set<(available: boolean) => void>();
const updateListeners = new Set<() => void>();

function announceInstall() {
  for (const listener of installListeners) listener(deferredPrompt !== null);
}

function announceUpdate() {
  for (const listener of updateListeners) listener();
}

export function onInstallAvailability(listener: (available: boolean) => void) {
  installListeners.add(listener);
  listener(deferredPrompt !== null);
  return () => {
    installListeners.delete(listener);
  };
}

/** Kept for existing UI consumers; updates are activated automatically. */
export function onUpdateReady(listener: () => void) {
  updateListeners.add(listener);
  if (waitingWorker || reloadPending) listener();
  return () => {
    updateListeners.delete(listener);
  };
}

export async function promptInstall(): Promise<InstallOutcome> {
  if (!deferredPrompt) return "unavailable";
  const event = deferredPrompt;
  deferredPrompt = null;
  announceInstall();
  await event.prompt();
  const { outcome } = await event.userChoice;
  return outcome;
}

/** Text inputs and editable regions are never interrupted by an automatic reload. */
export function isPwaEditingElement(element: Element | null) {
  if (!element) return false;
  const tagName = element.tagName.toLowerCase();
  if (tagName === "textarea") return true;
  if (tagName === "input") {
    return !NON_TEXT_INPUT_TYPES.has(
      (element.getAttribute("type") ?? "text").toLowerCase(),
    );
  }
  const contentEditable = element.getAttribute("contenteditable");
  return contentEditable !== null && contentEditable.toLowerCase() !== "false";
}

/** Pure safety decision, intentionally exported for deterministic tests. */
export function shouldDeferPwaReload(snapshot: PwaReloadSnapshot) {
  return (
    snapshot.dirty ||
    snapshot.busy ||
    snapshot.visibilityState !== "visible" ||
    isPwaEditingElement(snapshot.activeElement)
  );
}

/** Draft markers protect unsaved data even after its input has lost focus. */
export function hasPwaDirtyMarker(
  root: Pick<Document, "querySelector"> = document,
) {
  return root.querySelector('[data-pwa-dirty="true"]') !== null;
}

/**
 * App-level API for routes/components which track draft or busy state.
 * Partial updates preserve the other signal, so independent UI areas coexist.
 */
export function setPwaUpdateState(next: PwaUpdateState) {
  updateState = { ...updateState, ...next };
  requestReloadWhenSafe();
}

function setDeferredRecheck() {
  if (deferredRecheckTimer !== null || deferredRecheckCount >= MAX_DEFERRED_RECHECKS) {
    return;
  }
  deferredRecheckCount += 1;
  deferredRecheckTimer = window.setTimeout(() => {
    deferredRecheckTimer = null;
    requestReloadWhenSafe();
  }, DEFERRED_RECHECK_MS);
}

function recentlyReloaded() {
  try {
    const previous = Number(sessionStorage.getItem(RELOAD_LOOP_GUARD_KEY));
    if (Number.isFinite(previous) && Date.now() - previous < RELOAD_LOOP_GUARD_MS) {
      return true;
    }
    sessionStorage.setItem(RELOAD_LOOP_GUARD_KEY, String(Date.now()));
  } catch {
    // Private browsing can deny storage; the in-memory guard still applies.
  }
  return false;
}

function requestReloadWhenSafe() {
  if (!reloadPending || reloading) return;
  if (
    shouldDeferPwaReload({
      ...updateState,
      dirty: updateState.dirty || hasPwaDirtyMarker(),
      visibilityState: document.visibilityState,
      activeElement: document.activeElement,
    })
  ) {
    setDeferredRecheck();
    return;
  }
  if (recentlyReloaded()) return;
  reloading = true;
  if (deferredRecheckTimer !== null) window.clearTimeout(deferredRecheckTimer);
  deferredRecheckTimer = null;
  window.location.reload();
}

function scheduleSafeReload() {
  reloadPending = true;
  deferredRecheckCount = 0;
  announceUpdate();
  requestReloadWhenSafe();
}

function activateWaitingWorker(worker: ServiceWorker | null) {
  if (!worker || activatingWorker === worker) return;
  waitingWorker = worker;
  activatingWorker = worker;
  announceUpdate();
  worker.postMessage("SKIP_WAITING");
}

/** Existing manual controls now only accelerate the same safe automatic flow. */
export function applyUpdate() {
  if (waitingWorker) activateWaitingWorker(waitingWorker);
  else scheduleSafeReload();
}

export function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari keeps the legacy flag instead of the display-mode query.
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

async function checkForBuildUpdate() {
  const currentBuildId =
    typeof __HERMES_BUILD_ID__ === "string" ? __HERMES_BUILD_ID__ : null;
  if (!currentBuildId || !navigator.onLine) return;
  try {
    const response = await fetch(`/version.json?t=${Date.now()}`, {
      cache: "no-store",
    });
    if (!response.ok) return;
    const payload = (await response.json()) as VersionPayload;
    if (typeof payload.buildId !== "string" || payload.buildId === currentBuildId) return;
    await registration?.update();
    // A deployment can change only hashed app assets, leaving sw.js unchanged.
    scheduleSafeReload();
  } catch {
    // Offline or an unavailable version endpoint must not affect the running app.
  }
}

async function checkForUpdate() {
  if (!navigator.onLine) return;
  try {
    await registration?.update();
  } catch {
    // The next visibility/online/periodic check will retry.
  }
  await checkForBuildUpdate();
}

function trackInstallingWorker(worker: ServiceWorker | null) {
  if (!worker) return;
  worker.addEventListener("statechange", () => {
    if (worker.state === "installed" && navigator.serviceWorker.controller) {
      activateWaitingWorker(worker);
    }
  });
}

async function registerServiceWorker() {
  try {
    registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    if (registration.waiting && navigator.serviceWorker.controller) {
      activateWaitingWorker(registration.waiting);
    }
    trackInstallingWorker(registration.installing);
    registration.addEventListener("updatefound", () => trackInstallingWorker(registration?.installing ?? null));
    await checkForUpdate();
  } catch {
    // No offline support this session; the app still works online.
  }
}

/** A previous production preview must never keep controlling the Vite dev origin. */
async function cleanupDevelopmentPwa() {
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      registrations
        .filter((entry) =>
          [entry.active, entry.waiting, entry.installing].some((worker) =>
            worker?.scriptURL.endsWith("/sw.js"),
          ),
        )
        .map((entry) => entry.unregister()),
    );
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith(HERMES_CACHE_PREFIX))
          .map((key) => caches.delete(key)),
      );
    }
  } catch {
    // Dev still runs network-only if browser privacy settings deny these APIs.
  }
}

function applyExternalUpdateState(event: Event) {
  const detail = (event as CustomEvent<PwaUpdateState>).detail;
  if (!detail || typeof detail !== "object") return;
  setPwaUpdateState({
    ...(typeof detail.dirty === "boolean" ? { dirty: detail.dirty } : {}),
    ...(typeof detail.busy === "boolean" ? { busy: detail.busy } : {}),
  });
}

export function setupPwa() {
  if (pwaSetup) return;
  pwaSetup = true;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    announceInstall();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    announceInstall();
  });

  if (!import.meta.env.PROD) {
    if ("serviceWorker" in navigator) void cleanupDevelopmentPwa();
    return;
  }
  if (!("serviceWorker" in navigator)) return;

  document.addEventListener(PWA_UPDATE_STATE_EVENT, applyExternalUpdateState);
  window.addEventListener("blur", requestReloadWhenSafe);
  window.addEventListener("focus", () => {
    void checkForUpdate();
    requestReloadWhenSafe();
  });
  window.addEventListener("online", () => void checkForUpdate());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void checkForUpdate();
      requestReloadWhenSafe();
    }
  });
  let hasController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    // The first installation has no page to replace and must not cause a
    // surprise reload. Later controller changes are real upgrades.
    if (!hasController) {
      hasController = true;
      return;
    }
    scheduleSafeReload();
  });
  window.setInterval(() => void checkForUpdate(), UPDATE_CHECK_INTERVAL_MS);

  if (document.readyState === "complete") void registerServiceWorker();
  else window.addEventListener("load", () => void registerServiceWorker(), { once: true });
}
