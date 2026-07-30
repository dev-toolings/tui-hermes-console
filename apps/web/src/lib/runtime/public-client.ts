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

let cached: RuntimePublicDto | null = null;
let inflight: Promise<RuntimePublicDto> | null = null;

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

/** Charge le runtime public — une seule requête réseau partagée entre consommateurs. */
export async function getRuntimePublicClient(options?: { refresh?: boolean }): Promise<RuntimePublicDto> {
  if (!options?.refresh && cached) return cached;
  if (!options?.refresh && inflight) return inflight;

  inflight = fetchRuntimePublic()
    .then((runtime) => {
      cached = runtime;
      return runtime;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

export function invalidateRuntimePublicClient() {
  cached = null;
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
