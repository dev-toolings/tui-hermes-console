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

type RuntimeErrorBody = {
  error?: {
    code?: unknown;
    message?: unknown;
  };
  code?: unknown;
  message?: unknown;
};

export class RuntimeApiError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(input: { status: number; code?: string | null; message: string }) {
    super(input.message);
    this.name = "RuntimeApiError";
    this.status = input.status;
    this.code = input.code ?? null;
  }
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/** Lit les réponses runtime non-JSON sans perdre le statut HTTP de l'échec. */
export async function readRuntimeResponseBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/** Conserve le contrat d'erreur HTTP de la Console pour les surfaces runtime. */
export function runtimeApiErrorFromResponse(
  response: Pick<Response, "status">,
  body: unknown,
  fallbackMessage: string,
): RuntimeApiError {
  const payload = (body ?? {}) as RuntimeErrorBody;
  const error = payload.error ?? payload;
  return new RuntimeApiError({
    status: response.status,
    code: stringValue(error.code),
    message: stringValue(error.message) ?? fallbackMessage,
  });
}

let cached: ModelSettingsDto | null = null;
let inflight: Promise<ModelSettingsDto> | null = null;

async function fetchModelSettings(refresh = false): Promise<ModelSettingsDto> {
  const response = await fetch(`/api/runtime/models${refresh ? "?refresh=1" : ""}`, {
    cache: "no-store",
  });
  const body = (await readRuntimeResponseBody(response)) as ModelSettingsDto | null;
  if (!response.ok || !body?.catalog) {
    throw runtimeApiErrorFromResponse(
      response,
      body,
      "Impossible de charger les modèles Hermes.",
    );
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
