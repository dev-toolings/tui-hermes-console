export type AgentOption = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
};

let cached: AgentOption[] | null = null;
let inflight: Promise<AgentOption[]> | null = null;

async function fetchAgents(): Promise<AgentOption[]> {
  const response = await fetch("/api/agents", { cache: "no-store" });
  const body = (await response.json()) as {
    agents?: AgentOption[];
    error?: { message?: string };
  };
  if (!response.ok || !body.agents) {
    throw new Error(body.error?.message ?? "Impossible de charger les agents.");
  }
  return body.agents;
}

/** Charge les agents actifs — une seule requête réseau partagée entre consommateurs. */
export async function getAgentsClient(options?: { refresh?: boolean }): Promise<AgentOption[]> {
  if (!options?.refresh && cached) return cached;
  if (!options?.refresh && inflight) return inflight;

  inflight = fetchAgents()
    .then((agents) => {
      cached = agents;
      return agents;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

export function invalidateAgentsClient() {
  cached = null;
}
