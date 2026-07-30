type RuntimeTarget = {
  transport: "direct" | "ssh";
  baseUrl: string | null;
  sshHost: string | null;
  sshPort: number;
  sshUser: string | null;
};

/** `127.0.0.1:8642` — l'hôte et le port, sans le schéma qui n'apprend rien. */
function endpoint(baseUrl: string | null) {
  if (!baseUrl) return null;
  try {
    const url = new URL(baseUrl);
    return url.port ? `${url.hostname}:${url.port}` : url.hostname;
  } catch {
    return baseUrl;
  }
}

/** `kev@192.168.1.57` — avec le port SSH seulement s'il est non standard. */
export function sshTargetLabel(runtime: RuntimeTarget): string | null {
  if (runtime.transport !== "ssh" || !runtime.sshHost) return null;
  const user = runtime.sshUser ? `${runtime.sshUser}@` : "";
  const port = runtime.sshPort && runtime.sshPort !== 22 ? `:${runtime.sshPort}` : "";
  return `${user}${runtime.sshHost}${port}`;
}

/**
 * Où les missions s'exécutent RÉELLEMENT.
 *
 * En tunnel SSH, `baseUrl` est l'URL vue **depuis la machine distante** — elle
 * vaut typiquement `http://127.0.0.1:8642`. L'afficher telle quelle laisse
 * croire que l'agent tourne sur cette machine-ci, alors qu'il écrit ses
 * fichiers sur un autre host : c'est exactement le doute qu'a produit un
 * `/tmp/hermes-console-work/…/out/` introuvable en local.
 *
 * PRODUCT.md : « Montrer la vérité du runtime. »
 */
export function runtimeTargetLabel(runtime: RuntimeTarget): string {
  const remote = endpoint(runtime.baseUrl);
  const ssh = sshTargetLabel(runtime);
  if (!ssh) return remote ?? "Runtime Hermes";
  return remote ? `${ssh} → ${remote}` : ssh;
}

/** Nature du lien, pour une ligne secondaire ou un badge. */
export function runtimeTransportLabel(runtime: RuntimeTarget): string {
  return runtime.transport === "ssh" ? "Tunnel SSH" : "Accès direct";
}
