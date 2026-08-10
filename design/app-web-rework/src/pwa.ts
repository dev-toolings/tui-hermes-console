/**
 * Progressive web app plumbing: service worker lifecycle and install prompt.
 * The worker is registered in production builds only. In dev it would cache
 * Vite's unbundled modules and break hot reload.
 */

export type InstallOutcome = "accepted" | "dismissed" | "unavailable";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let waitingWorker: ServiceWorker | null = null;
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

export function onUpdateReady(listener: () => void) {
  updateListeners.add(listener);
  if (waitingWorker) listener();
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

export function applyUpdate() {
  if (!waitingWorker) {
    window.location.reload();
    return;
  }
  waitingWorker.postMessage("SKIP_WAITING");
}

export function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari keeps the legacy flag instead of the display-mode query.
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function setupPwa() {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    announceInstall();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    announceInstall();
  });

  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;

  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
      });
      const track = (worker: ServiceWorker | null) => {
        if (!worker) return;
        worker.addEventListener("statechange", () => {
          // A worker parked in "installed" while one is already controlling the
          // page means a newer build is ready and waiting for a reload.
          if (worker.state === "installed" && navigator.serviceWorker.controller) {
            waitingWorker = worker;
            announceUpdate();
          }
        });
      };
      if (registration.waiting && navigator.serviceWorker.controller) {
        waitingWorker = registration.waiting;
        announceUpdate();
      }
      track(registration.installing);
      registration.addEventListener("updatefound", () =>
        track(registration.installing),
      );
    } catch {
      /* No offline support this session; the app still works online. */
    }
  });

  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });
}
