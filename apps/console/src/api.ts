/**
 * Client de l'API Console.
 *
 * En dev, Vite proxifie `/api` vers `apps/server` (port 3170) ; empaqueté,
 * Tauri lance ce même serveur en sidecar sur 127.0.0.1. Le SPA n'a donc jamais
 * d'URL absolue à connaître.
 */

export type RuntimeDto = {
  configured: boolean;
  transport: "direct" | "ssh";
  baseUrl: string | null;
  sshHost: string | null;
  sshPort: number;
  sshUser: string | null;
  detectedVersion: string | null;
  lastHealthStatus: string;
};

export type ThreadDto = {
  id: string;
  title: string;
  agentName: string;
  updatedAt: string;
  latestRun: { status: string; usage?: { totalTokens?: number } | null } | null;
};

export type AgentDto = {
  id: string;
  name: string;
  description: string | null;
  runs: number;
};

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;
    throw new Error(body?.error?.message ?? `${path} a répondu HTTP ${response.status}.`);
  }
  return (await response.json()) as T;
}

export async function fetchOverview() {
  const [runtime, threads, agents] = await Promise.all([
    getJson<{ runtime: RuntimeDto }>("/api/runtime"),
    getJson<{ threads: ThreadDto[] }>("/api/threads"),
    getJson<{ agents: AgentDto[] }>("/api/agents"),
  ]);
  return {
    runtime: runtime.runtime,
    threads: threads.threads,
    agents: agents.agents,
  };
}

/** Reprise à l'identique de `apps/web/src/lib/runtime/target.ts` — en tunnel,
 *  `baseUrl` est l'URL vue depuis la machine distante et ne dit pas où l'agent
 *  s'exécute réellement. */
export function runtimeTargetLabel(runtime: RuntimeDto): string {
  let remote: string | null = null;
  if (runtime.baseUrl) {
    try {
      const url = new URL(runtime.baseUrl);
      remote = url.port ? `${url.hostname}:${url.port}` : url.hostname;
    } catch {
      remote = runtime.baseUrl;
    }
  }
  if (runtime.transport !== "ssh" || !runtime.sshHost) return remote ?? "Runtime Hermes";
  const user = runtime.sshUser ? `${runtime.sshUser}@` : "";
  const port = runtime.sshPort && runtime.sshPort !== 22 ? `:${runtime.sshPort}` : "";
  const ssh = `${user}${runtime.sshHost}${port}`;
  return remote ? `${ssh} → ${remote}` : ssh;
}
