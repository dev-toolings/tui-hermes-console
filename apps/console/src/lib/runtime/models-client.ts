export type ModelSettingsDto = {
  catalog: {
    providers: Array<{
      slug: string;
      name: string;
      isCurrent: boolean;
      authenticated: boolean;
      acceptsApiKey: boolean;
      authType: string | null;
      warning: string | null;
      source: string | null;
      models: Array<{ id: string; fast: boolean; reasoning: boolean }>;
    }>;
    currentProvider: string;
    runtimeDefaultModel: string;
  };
  selectedProvider: string;
  selectedModel: string;
  selectedReasoningEffort: string | null;
  availableReasoningEfforts: string[];
  persistence: {
    source: "console_database" | "hermes_runtime";
    appliesTo: "new_threads";
    envOverride: boolean;
    reason: string;
  };
};

let cached: ModelSettingsDto | null = null;
let inflight: Promise<ModelSettingsDto> | null = null;

async function fetchModelSettings(refresh = false): Promise<ModelSettingsDto> {
  const response = await fetch(`/api/runtime/models${refresh ? "?refresh=1" : ""}`, {
    cache: "no-store",
  });
  const body = (await response.json()) as ModelSettingsDto & {
    error?: { message?: string };
  };
  if (!response.ok || !body.catalog) {
    throw new Error(body.error?.message ?? "Impossible de charger les modèles Hermes.");
  }
  return body;
}

/** Charge le catalogue modèles — une seule requête réseau partagée entre consommateurs. */
export async function getModelSettingsClient(options?: {
  refresh?: boolean;
}): Promise<ModelSettingsDto> {
  if (!options?.refresh && cached) return cached;
  if (!options?.refresh && inflight) return inflight;

  inflight = fetchModelSettings(Boolean(options?.refresh))
    .then((data) => {
      cached = data;
      return data;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

export function invalidateModelSettingsClient() {
  cached = null;
}

export function peekModelSettingsClient(): ModelSettingsDto | null {
  return cached;
}

export function patchModelSettingsClient(patch: Partial<ModelSettingsDto>) {
  if (!cached) return;
  cached = { ...cached, ...patch };
}

export function setModelSettingsClient(data: ModelSettingsDto) {
  cached = data;
}
