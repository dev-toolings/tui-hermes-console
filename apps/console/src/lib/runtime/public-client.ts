export type RuntimePublicDto = {
  configured: boolean;
  source: "database" | "env" | "none";
  transport: "direct" | "ssh";
  baseUrl: string | null;
  tokenConfigured: boolean;
  sshHost: string | null;
  sshPort: number;
  sshUser: string | null;
  sshAuth: "agent" | "password";
  sshPasswordConfigured: boolean;
  remoteWorkdir: string | null;
  lastHealthStatus: string;
  detectedVersion: string | null;
};

const CHANGE_EVENT = "hermes-runtime-changed";

/**
 * La cible d'exécution survit au rechargement de l'onglet.
 *
 * C'est la donnée la plus stable de la Console — on ne change pas de VPS entre
 * deux F5 — et pourtant elle repartait de zéro à chaque fois, laissant le
 * panneau workspace afficher un squelette isolé au milieu d'une colonne déjà
 * peinte. La valeur est réaffichée puis revalidée : `notifyRuntimePublicChanged`
 * et le retour de focus corrigent tout écart.
 */
const STORAGE_KEY = "hermes-console:runtime-public";

function readStored(): RuntimePublicDto | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? (parsed as RuntimePublicDto) : null;
  } catch {
    return null;
  }
}

function writeStored(runtime: RuntimePublicDto | null) {
  if (typeof sessionStorage === "undefined") return;
  try {
    if (runtime) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(runtime));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Quota plein : on retombe sur le squelette, comportement d'avant.
  }
}

let cached: RuntimePublicDto | null = readStored();
let inflight: Promise<RuntimePublicDto> | null = null;
/** Valeur restaurée d'un rechargement : affichée tout de suite, confirmée une fois. */
let stale = cached !== null;

async function fetchRuntimePublic(): Promise<RuntimePublicDto> {
  const response = await fetch("/api/runtime", { cache: "no-store" });
  const body = (await response.json()) as {
    runtime?: RuntimePublicDto;
    error?: { message?: string };
  };
  if (!response.ok || !body.runtime) {
    throw new Error(body.error?.message ?? "Impossible de charger la config runtime.");
  }
  return body.runtime;
}

/**
 * Confirme en fond une valeur restaurée du stockage.
 *
 * Sans elle, le cache d'onglet aurait fait de la config runtime une donnée
 * jamais revérifiée après un F5. On ne notifie que si elle a réellement changé :
 * le cas courant — rien n'a bougé — ne coûte aucun rendu.
 */
async function confirmStored(): Promise<void> {
  stale = false;
  try {
    const runtime = await fetchRuntimePublic();
    const changed = JSON.stringify(runtime) !== JSON.stringify(cached);
    cached = runtime;
    writeStored(runtime);
    if (changed) window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // Sidecar encore en train de démarrer : la valeur restaurée reste la
    // meilleure information disponible.
  }
}

/** Charge le runtime public — une seule requête réseau partagée entre consommateurs. */
export async function getRuntimePublicClient(options?: { refresh?: boolean }): Promise<RuntimePublicDto> {
  if (!options?.refresh && cached) {
    if (stale) void confirmStored();
    return cached;
  }
  if (!options?.refresh && inflight) return inflight;

  inflight = fetchRuntimePublic()
    .then((runtime) => {
      cached = runtime;
      stale = false;
      writeStored(runtime);
      return runtime;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

export function invalidateRuntimePublicClient() {
  cached = null;
  stale = false;
  writeStored(null);
}

export function notifyRuntimePublicChanged() {
  invalidateRuntimePublicClient();
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function subscribeRuntimePublic(onStoreChange: () => void) {
  const onFocus = () => onStoreChange();
  window.addEventListener(CHANGE_EVENT, onStoreChange);
  window.addEventListener("focus", onFocus);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onStoreChange);
    window.removeEventListener("focus", onFocus);
  };
}
