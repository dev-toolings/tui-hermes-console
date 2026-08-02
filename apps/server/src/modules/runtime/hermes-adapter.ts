import { z } from "zod";
import { hermesModelOptionsForEffort } from "@console/core/lib/runtime/reasoning-effort";
import type { ApprovalChoice } from "@console/core/lib/thread-snapshot-mutations";
import { parseHermesAgentEvents } from "./sse";

const capabilitiesSchema = z
  .object({
    platform: z.string().optional(),
    model: z.string().optional(),
    features: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

const sessionSchema = z
  .object({
    object: z.string().optional(),
    session: z
      .object({
        id: z.string(),
        model: z.string().nullable().optional(),
        reasoning_tokens: z.number().nullable().optional(),
        tool_call_count: z.number().nullable().optional(),
      })
      .passthrough(),
  })
  .passthrough();

const modelCapabilitySchema = z
  .object({
    fast: z.boolean().optional(),
    reasoning: z.boolean().optional(),
  })
  .passthrough();

const modelProviderSchema = z
  .object({
    slug: z.string(),
    name: z.string(),
    is_current: z.boolean().optional(),
    authenticated: z.boolean().optional(),
    auth_type: z.string().nullable().optional(),
    warning: z.string().nullable().optional(),
    source: z.string().nullable().optional(),
    models: z.array(z.string()).optional(),
    capabilities: z.record(z.string(), modelCapabilitySchema).optional(),
  })
  .passthrough();

const modelOptionsSchema = z
  .object({
    providers: z.array(modelProviderSchema),
    model: z.string(),
    provider: z.string(),
  })
  .passthrough();

export type HermesCapabilities = z.infer<typeof capabilitiesSchema>;
export type HermesSessionDetails = {
  id: string;
  model: string | null;
  reasoningTokens: number | null;
  toolCallCount: number | null;
};

export type HermesModelCatalog = {
  providers: Array<{
    slug: string;
    name: string;
    isCurrent: boolean;
    authenticated: boolean;
    acceptsApiKey: boolean;
    authType: string | null;
    warning: string | null;
    source: string | null;
    models: Array<{
      id: string;
      fast: boolean;
      reasoning: boolean;
    }>;
  }>;
  currentProvider: string;
  runtimeDefaultModel: string;
};

const NON_API_KEY_PROVIDER_SLUGS = new Set([
  "bedrock",
  "copilot-acp",
  "minimax-oauth",
  "moa",
  "nous",
  "openai-codex",
  "qwen-oauth",
  "vertex",
  "xai-oauth",
]);

export function hermesProviderAcceptsApiKey(provider: {
  slug: string;
  authType: string | null;
  acceptsApiKey?: boolean;
  authenticated?: boolean;
}) {
  if (provider.acceptsApiKey === true || provider.authType === "api_key") return true;
  if (provider.authType !== null || provider.authenticated !== true) return false;

  // Hermes omet auth_type pour plusieurs providers dès qu'une clé est active.
  // Les providers à authentification non-API restent exclus explicitement.
  return (
    !NON_API_KEY_PROVIDER_SLUGS.has(provider.slug) &&
    !provider.slug.includes("oauth")
  );
}

export type HermesResponseRequest = {
  input: string;
  instructions: string;
  model: string;
  provider?: string | null;
  reasoningEffort?: string | null;
  conversation: string;
  signal: AbortSignal;
  baseUrl?: string;
  token?: string;
};

export type HermesResponseStream = {
  body: ReadableStream<Uint8Array>;
  hermesSessionId: string | null;
};

export class HermesRuntimeError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "HermesRuntimeError";
  }
}

export function getHermesRuntimeConfigFromEnv() {
  const baseUrl = (process.env.HERMES_BASE_URL ?? "http://127.0.0.1:8642")
    .trim()
    .replace(/\/+$/, "");
  const token = process.env.HERMES_RUNTIME_TOKEN?.trim();

  if (!token) {
    throw new HermesRuntimeError(
      "Le token Hermes n’est pas configuré côté serveur.",
      503,
      "HERMES_RUNTIME_TOKEN_MISSING",
    );
  }

  return { baseUrl, token };
}

export async function testHermesRuntimeAgainst(config: {
  baseUrl: string;
  token: string;
}): Promise<{
  health: unknown;
  capabilities: HermesCapabilities;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);

  try {
    const [healthResponse, capabilitiesResponse] = await Promise.all([
      fetch(`${config.baseUrl}/health`, {
        headers: authHeaders(config.token),
        cache: "no-store",
        signal: controller.signal,
      }),
      fetch(`${config.baseUrl}/v1/capabilities`, {
        headers: authHeaders(config.token),
        cache: "no-store",
        signal: controller.signal,
      }),
    ]);

    if (!healthResponse.ok) await throwResponseError(healthResponse);
    if (!capabilitiesResponse.ok) await throwResponseError(capabilitiesResponse);

    const capabilities = capabilitiesSchema.parse(await capabilitiesResponse.json());
    return { health: await healthResponse.json(), capabilities };
  } catch (error) {
    if (error instanceof HermesRuntimeError) throw error;
    if (error instanceof z.ZodError) {
      throw new HermesRuntimeError(
        "Réponse /v1/capabilities inattendue.",
        502,
        "HERMES_CAPABILITIES_INVALID",
      );
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new HermesRuntimeError(
        "Hermes n’a pas répondu dans le délai imparti.",
        504,
        "HERMES_TIMEOUT",
      );
    }
    throw new HermesRuntimeError(
      error instanceof Error
        ? `Impossible de joindre le runtime Hermes (${error.message}).`
        : "Impossible de joindre le runtime Hermes.",
      502,
      "HERMES_UNREACHABLE",
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function listHermesModels(config: {
  baseUrl: string;
  token: string;
}): Promise<Array<{ id: string }>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(`${config.baseUrl}/v1/models`, {
      headers: authHeaders(config.token),
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) await throwResponseError(response);
    const body = (await response.json()) as { data?: Array<{ id?: string }> };
    return (body.data ?? [])
      .map((item) => ({ id: String(item.id ?? "") }))
      .filter((item) => item.id.length > 0);
  } catch (error) {
    if (error instanceof HermesRuntimeError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new HermesRuntimeError(
        "Hermes n’a pas répondu dans le délai imparti.",
        504,
        "HERMES_TIMEOUT",
      );
    }
    throw new HermesRuntimeError(
      "Impossible de lister les modèles Hermes.",
      502,
      "HERMES_UNREACHABLE",
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function listHermesModelOptions(config: {
  baseUrl: string;
  token: string;
}): Promise<HermesModelCatalog> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`${config.baseUrl}/api/model/options`, {
      headers: authHeaders(config.token),
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) await throwResponseError(response);
    return normalizeHermesModelOptions(await response.json());
  } catch (error) {
    if (error instanceof HermesRuntimeError) throw error;
    if (error instanceof z.ZodError) {
      throw new HermesRuntimeError(
        "Réponse /api/model/options inattendue.",
        502,
        "HERMES_MODEL_OPTIONS_INVALID",
      );
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new HermesRuntimeError(
        "Hermes n’a pas répondu pendant le chargement des modèles.",
        504,
        "HERMES_TIMEOUT",
      );
    }
    throw new HermesRuntimeError(
      "Impossible de charger les modèles disponibles dans Hermes.",
      502,
      "HERMES_UNREACHABLE",
    );
  } finally {
    clearTimeout(timeout);
  }
}

export function normalizeHermesModelOptions(input: unknown): HermesModelCatalog {
  const body = modelOptionsSchema.parse(input);
  const currentProvider =
    body.providers.find((item) => item.slug === body.provider)?.slug ??
    body.providers.find((item) => item.is_current)?.slug;

  if (!currentProvider) {
    throw new HermesRuntimeError(
      "Hermes n’a pas indiqué de provider LLM actif.",
      502,
      "HERMES_MODEL_PROVIDER_MISSING",
    );
  }

  const providers = body.providers.map((provider) => {
    const authenticated =
      provider.authenticated ?? (provider.models?.length ?? 0) > 0;
    const normalized = {
      slug: provider.slug,
      authType: provider.auth_type ?? null,
      authenticated,
    };
    return {
      slug: provider.slug,
      name: provider.name,
      isCurrent: provider.slug === currentProvider,
      authenticated,
      acceptsApiKey: hermesProviderAcceptsApiKey(normalized),
      authType: normalized.authType,
      warning: provider.warning ?? null,
      source: provider.source ?? null,
      models: [...new Set(provider.models ?? [])]
        .filter(Boolean)
        .map((id) => ({
          id,
          fast: provider.capabilities?.[id]?.fast === true,
          reasoning: provider.capabilities?.[id]?.reasoning === true,
        })),
    };
  });

  if (!providers.some((provider) => provider.models.length > 0)) {
    throw new HermesRuntimeError(
      "Hermes n’a retourné aucun modèle disponible.",
      502,
      "HERMES_MODELS_EMPTY",
    );
  }

  return {
    providers,
    currentProvider,
    runtimeDefaultModel: body.model,
  };
}

export async function deleteHermesSession(
  config: {
    baseUrl: string;
    token: string;
  },
  sessionId: string,
): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);

  try {
    const response = await fetch(
      `${config.baseUrl.replace(/\/+$/, "")}/api/sessions/${encodeURIComponent(sessionId)}`,
      {
        method: "DELETE",
        headers: authHeaders(config.token),
        cache: "no-store",
        signal: controller.signal,
      },
    );
    if (response.status === 404) return;
    if (!response.ok) await throwResponseError(response);
  } catch (error) {
    if (error instanceof HermesRuntimeError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new HermesRuntimeError(
        "Hermes n’a pas répondu dans le délai imparti.",
        504,
        "HERMES_TIMEOUT",
      );
    }
    throw new HermesRuntimeError(
      "Impossible de supprimer la session Hermes.",
      502,
      "HERMES_SESSION_DELETE_FAILED",
    );
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Crée la session Hermes du thread si elle n'existe pas.
 *
 * MESURÉ : un `id` fourni est accepté tel quel (`console:thr_…` passe), et une
 * seconde création renvoie 409 — l'appel est donc idempotent côté Console.
 * Sans cette session, `GET /api/sessions/:id/messages` répond 404 et le
 * backfill des sorties d'outils est impossible.
 *
 * Ne jette jamais : la mission doit partir même si le runtime refuse la
 * session. On perdrait le backfill, pas l'exécution.
 */
export async function ensureHermesSession(
  config: { baseUrl: string; token: string },
  sessionId: string,
  title: string,
): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(`${config.baseUrl.replace(/\/+$/, "")}/api/sessions`, {
      method: "POST",
      headers: { ...authHeaders(config.token), "Content-Type": "application/json" },
      body: JSON.stringify({ id: sessionId, title: title.slice(0, 200) }),
      cache: "no-store",
      signal: controller.signal,
    });
    return response.ok || response.status === 409;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export type HermesSessionMessage = {
  role: string;
  content: string;
  toolName: string | null;
  toolCallId: string | null;
};

/**
 * Transcript persisté d'une session Hermes.
 *
 * C'est la SEULE source des sorties d'outils : le flux `/v1/runs` émet un
 * `tool.completed` sans résultat (cf. §4.2 du spike), alors que les messages
 * `role: "tool"` de la session portent leur `content` complet (§11.4).
 */
export async function listHermesSessionMessages(
  config: { baseUrl: string; token: string },
  sessionId: string,
): Promise<HermesSessionMessage[]> {
  const controller = new AbortController();
  // Un transcript de mission longue dépasse facilement 250 Ko, et il transite
  // par le tunnel SSH pendant que le runtime travaille encore. Un délai de
  // quelques secondes le faisait expirer — et l'échec passait inaperçu.
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(
      `${config.baseUrl.replace(/\/+$/, "")}/api/sessions/${encodeURIComponent(sessionId)}/messages`,
      { headers: authHeaders(config.token), cache: "no-store", signal: controller.signal },
    );
    if (!response.ok) {
      throw new HermesRuntimeError(
        `Transcript de session indisponible (HTTP ${response.status}).`,
        response.status,
        "HERMES_SESSION_MESSAGES_FAILED",
      );
    }

    const body = (await response.json()) as { data?: unknown };
    if (!Array.isArray(body.data)) return [];

    return body.data.map((entry) => {
      const item = (entry ?? {}) as Record<string, unknown>;
      return {
        role: String(item.role ?? ""),
        content: typeof item.content === "string" ? item.content : "",
        toolName: typeof item.tool_name === "string" ? item.tool_name : null,
        toolCallId: typeof item.tool_call_id === "string" ? item.tool_call_id : null,
      };
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function getHermesSession(
  config: {
    baseUrl: string;
    token: string;
  },
  sessionId: string,
): Promise<HermesSessionDetails> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);

  try {
    const response = await fetch(
      `${config.baseUrl.replace(/\/+$/, "")}/api/sessions/${encodeURIComponent(sessionId)}`,
      {
        headers: authHeaders(config.token),
        cache: "no-store",
        signal: controller.signal,
      },
    );
    if (!response.ok) await throwResponseError(response);

    const body = sessionSchema.parse(await response.json());
    return {
      id: body.session.id,
      model: body.session.model ?? null,
      reasoningTokens: body.session.reasoning_tokens ?? null,
      toolCallCount: body.session.tool_call_count ?? null,
    };
  } catch (error) {
    if (error instanceof HermesRuntimeError) throw error;
    if (error instanceof z.ZodError) {
      throw new HermesRuntimeError(
        "Réponse /api/sessions/:id inattendue.",
        502,
        "HERMES_SESSION_INVALID",
      );
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new HermesRuntimeError(
        "Hermes n’a pas répondu dans le délai imparti.",
        504,
        "HERMES_TIMEOUT",
      );
    }
    throw new HermesRuntimeError(
      "Impossible de lire la session Hermes.",
      502,
      "HERMES_UNREACHABLE",
    );
  } finally {
    clearTimeout(timeout);
  }
}

export type HermesAgentRunRequest = {
  input: string;
  instructions: string;
  model?: string;
  provider?: string | null;
  reasoningEffort?: string | null;
  /** Session Hermes stable du thread. Portée persistance/mémoire uniquement :
   *  MESURÉ (spike §11.3), elle n'injecte AUCUN historique dans le prompt. */
  sessionId?: string | null;
  /** Historique du thread. Sans lui, chaque mission repart sans contexte —
   *  c'est le défaut qui faisait répondre « l'heure à Paris » à une question
   *  de suivi sur la météo (spike §11.1). */
  conversationHistory?: Array<{ role: string; content: string }>;
  signal?: AbortSignal;
  baseUrl?: string;
  token?: string;
};

export type HermesAgentRunStream = {
  hermesRunId: string;
  body: ReadableStream<Uint8Array>;
};

export async function createHermesAgentRun(
  request: HermesAgentRunRequest,
): Promise<{ hermesRunId: string }> {
  const config =
    request.baseUrl && request.token
      ? { baseUrl: request.baseUrl.replace(/\/+$/, ""), token: request.token }
      : getHermesRuntimeConfigFromEnv();

  let response: Response;
  try {
    const modelOptions = hermesModelOptionsForEffort(request.reasoningEffort);
    response = await fetch(`${config.baseUrl}/v1/runs`, {
      method: "POST",
      headers: {
        ...authHeaders(config.token),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: request.input,
        instructions: request.instructions,
        ...(request.model ? { model: request.model } : {}),
        ...(request.provider ? { provider: request.provider } : {}),
        ...(modelOptions ? { model_options: modelOptions } : {}),
        ...(request.sessionId ? { session_id: request.sessionId } : {}),
        ...(request.conversationHistory?.length
          ? { conversation_history: request.conversationHistory }
          : {}),
      }),
      cache: "no-store",
      signal: request.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new HermesRuntimeError(
      "Impossible de démarrer la mission Hermes.",
      502,
      "HERMES_UNREACHABLE",
    );
  }

  if (!response.ok) await throwResponseError(response);

  const body = (await response.json()) as { run_id?: string };
  const hermesRunId = body.run_id;
  if (!hermesRunId) {
    throw new HermesRuntimeError(
      "Hermes n’a pas renvoyé d’identifiant de mission.",
      502,
      "HERMES_RUN_ID_MISSING",
    );
  }

  return { hermesRunId };
}

export async function streamHermesAgentRun(
  request: HermesAgentRunRequest & { hermesRunId: string },
): Promise<HermesAgentRunStream> {
  const config =
    request.baseUrl && request.token
      ? { baseUrl: request.baseUrl.replace(/\/+$/, ""), token: request.token }
      : getHermesRuntimeConfigFromEnv();

  let response: Response;
  try {
    response = await fetch(
      `${config.baseUrl}/v1/runs/${encodeURIComponent(request.hermesRunId)}/events`,
      {
        headers: authHeaders(config.token),
        cache: "no-store",
        signal: request.signal,
      },
    );
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new HermesRuntimeError(
      "Impossible d’ouvrir le flux d’événements Hermes.",
      502,
      "HERMES_UNREACHABLE",
    );
  }

  if (!response.ok) await throwResponseError(response);
  if (!response.body) {
    throw new HermesRuntimeError(
      "Hermes a répondu sans flux d’événements.",
      502,
      "HERMES_EMPTY_STREAM",
    );
  }

  return { hermesRunId: request.hermesRunId, body: response.body };
}

export async function* iterateHermesAgentEvents(
  stream: ReadableStream<Uint8Array>,
) {
  yield* parseHermesAgentEvents(stream);
}

const hermesRunStatusSchema = z
  .object({
    object: z.string().optional(),
    run_id: z.string().optional(),
    status: z.enum([
      "started",
      "running",
      "stopping",
      "waiting_for_approval",
      "completed",
      "failed",
      "cancelled",
    ]),
    output: z.string().nullable().optional(),
    usage: z
      .object({
        input_tokens: z.number().optional(),
        output_tokens: z.number().optional(),
        total_tokens: z.number().optional(),
      })
      .nullable()
      .optional(),
  })
  .passthrough();

export type HermesRunDetails = {
  id: string;
  status: z.infer<typeof hermesRunStatusSchema>["status"];
  output: string | null;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  } | null;
};

export type HermesRunStatus = HermesRunDetails["status"];

/** GET /v1/runs/:id — source de vérité pour la réconciliation au boot. */
export async function getHermesRun(
  config: { baseUrl: string; token: string },
  hermesRunId: string,
): Promise<HermesRunDetails> {
  const baseUrl = config.baseUrl.replace(/\/+$/, "");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);

  try {
    const response = await fetch(
      `${baseUrl}/v1/runs/${encodeURIComponent(hermesRunId)}`,
      {
        headers: authHeaders(config.token),
        cache: "no-store",
        signal: controller.signal,
      },
    );
    if (!response.ok) await throwResponseError(response);

    const body = hermesRunStatusSchema.parse(await response.json());
    const usage = body.usage
      ? {
          inputTokens: body.usage.input_tokens ?? 0,
          outputTokens: body.usage.output_tokens ?? 0,
          totalTokens:
            body.usage.total_tokens ??
            (body.usage.input_tokens ?? 0) + (body.usage.output_tokens ?? 0),
        }
      : null;

    return {
      id: body.run_id ?? hermesRunId,
      status: body.status,
      output: body.output ?? null,
      usage,
    };
  } catch (error) {
    if (error instanceof HermesRuntimeError) throw error;
    if (error instanceof z.ZodError) {
      throw new HermesRuntimeError(
        "Réponse /v1/runs/:id inattendue.",
        502,
        "HERMES_RUN_INVALID",
      );
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new HermesRuntimeError(
        "Hermes n’a pas répondu dans le délai imparti.",
        504,
        "HERMES_TIMEOUT",
      );
    }
    throw new HermesRuntimeError(
      "Impossible de lire l’état de la mission Hermes.",
      502,
      "HERMES_UNREACHABLE",
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function stopHermesAgentRun(input: {
  hermesRunId: string;
  baseUrl: string;
  token: string;
}) {
  const baseUrl = input.baseUrl.replace(/\/+$/, "");
  try {
    const response = await fetch(
      `${baseUrl}/v1/runs/${encodeURIComponent(input.hermesRunId)}/stop`,
      {
        method: "POST",
        headers: authHeaders(input.token),
        cache: "no-store",
      },
    );
    if (!response.ok) await throwResponseError(response);
  } catch (error) {
    if (error instanceof HermesRuntimeError) throw error;
    throw new HermesRuntimeError(
      "Impossible d’arrêter la mission Hermes.",
      502,
      "HERMES_STOP_FAILED",
    );
  }
}

/**
 * POST /v1/runs/:id/approval — réponse à waiting_for_approval.
 *
 * Hermes valide `choice` (once | session | always | deny) ; `approved` est
 * conservé parce que le spike l'envoyait aux côtés du choix et qu'il ne coûte
 * rien à un runtime qui l'ignore.
 */
export async function respondHermesApproval(input: {
  hermesRunId: string;
  choice: ApprovalChoice;
  approved: boolean;
  baseUrl: string;
  token: string;
}) {
  const baseUrl = input.baseUrl.replace(/\/+$/, "");
  try {
    const response = await fetch(
      `${baseUrl}/v1/runs/${encodeURIComponent(input.hermesRunId)}/approval`,
      {
        method: "POST",
        headers: {
          ...authHeaders(input.token),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ choice: input.choice, approved: input.approved }),
        cache: "no-store",
      },
    );
    if (!response.ok) await throwResponseError(response);
  } catch (error) {
    if (error instanceof HermesRuntimeError) throw error;
    throw new HermesRuntimeError(
      "Impossible de répondre à la demande d’autorisation Hermes.",
      502,
      "HERMES_APPROVAL_FAILED",
    );
  }
}

export async function streamHermesResponse(
  request: HermesResponseRequest,
): Promise<HermesResponseStream> {
  const config =
    request.baseUrl && request.token
      ? { baseUrl: request.baseUrl.replace(/\/+$/, ""), token: request.token }
      : getHermesRuntimeConfigFromEnv();
  let response: Response;

  try {
    const modelOptions = hermesModelOptionsForEffort(request.reasoningEffort);
    response = await fetch(`${config.baseUrl}/v1/responses`, {
      method: "POST",
      headers: {
        ...authHeaders(config.token),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: request.model || "hermes-agent",
        ...(request.provider ? { provider: request.provider } : {}),
        ...(modelOptions ? { model_options: modelOptions } : {}),
        input: request.input,
        instructions: request.instructions,
        conversation: request.conversation,
        store: true,
        stream: true,
      }),
      cache: "no-store",
      signal: request.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new HermesRuntimeError(
      "Impossible d’ouvrir le flux avec Hermes.",
      502,
      "HERMES_UNREACHABLE",
    );
  }

  if (!response.ok) await throwResponseError(response);
  if (!response.body) {
    throw new HermesRuntimeError(
      "Hermes a répondu sans flux d’événements.",
      502,
      "HERMES_EMPTY_STREAM",
    );
  }

  return {
    body: response.body,
    hermesSessionId: response.headers.get("x-hermes-session-id"),
  };
}

function authHeaders(token: string) {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
  };
}

async function throwResponseError(response: Response): Promise<never> {
  const raw = await response.text();
  let message = `Hermes a répondu HTTP ${response.status}.`;
  try {
    const body = JSON.parse(raw) as { error?: { message?: string } | string; message?: string };
    message =
      (typeof body.error === "object" ? body.error?.message : body.error) ??
      body.message ??
      message;
  } catch {
    // Une réponse HTML ou texte ne doit jamais être renvoyée telle quelle au navigateur.
  }

  throw new HermesRuntimeError(message.slice(0, 500), response.status, "HERMES_HTTP_ERROR");
}
