import { z } from "zod";
import { apiErrorResponse } from "@/modules/api/errors";
import { updateAgent } from "@/modules/agents/repository";
import {
  ensureHermesSeededAgent,
  HERMES_SEEDED_AGENT_ID,
} from "@/modules/agents/seed";
import {
  DEFAULT_REASONING_EFFORT,
  HERMES_REASONING_EFFORTS,
  isHermesReasoningEffort,
  type HermesReasoningEffort,
} from "@console/core/lib/runtime/reasoning-effort";
import {
  resolveHermesRuntimeConfig,
  type ResolvedRuntimeConfig,
} from "@/modules/runtime/config";
import {
  HermesRuntimeError,
  listHermesModelOptions,
  type HermesModelCatalog,
} from "@/modules/runtime/hermes-adapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateModelSchema = z.object({
  provider: z.string().trim().min(1).max(80),
  model: z.string().trim().min(1).max(200),
  reasoningEffort: z.enum(HERMES_REASONING_EFFORTS).nullable().optional(),
});

const globalModelCatalog = globalThis as typeof globalThis & {
  hermesConsoleModelCatalog?: {
    baseUrl: string;
    value?: HermesModelCatalog;
    expiresAt: number;
    pending?: Promise<HermesModelCatalog>;
  };
};

export async function GET(request: Request) {
  try {
    const refresh = new URL(request.url).searchParams.get("refresh") === "1";
    return Response.json(await getModelSettings({ refresh }));
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const input = updateModelSchema.parse(await request.json());
    const config = await resolveHermesRuntimeConfig();
    const catalog = await getModelCatalog(config, true);

    const provider = catalog.providers.find((item) => item.slug === input.provider);
    if (!provider) {
      throw new HermesRuntimeError(
        "Ce provider n’est plus disponible dans le catalogue Hermes.",
        409,
        "HERMES_MODEL_PROVIDER_CHANGED",
      );
    }
    if (!provider.authenticated) {
      throw new HermesRuntimeError(
        `${provider.name} doit être connecté dans Hermes avant de pouvoir être sélectionné.`,
        409,
        "HERMES_MODEL_PROVIDER_UNAUTHENTICATED",
      );
    }
    const model = provider.models.find((item) => item.id === input.model);
    if (!model) {
      throw new HermesRuntimeError(
        "Ce modèle n’est plus disponible dans le catalogue Hermes.",
        409,
        "HERMES_MODEL_UNAVAILABLE",
      );
    }

    const reasoningEffort = resolvePersistedEffort({
      modelSupportsReasoning: model.reasoning,
      requested: input.reasoningEffort,
    });

    const agent = await ensureHermesSeededAgent();
    if (!agent) {
      throw new HermesRuntimeError(
        "L’agent Hermes n’est pas disponible.",
        503,
        "HERMES_AGENT_UNAVAILABLE",
      );
    }
    await updateAgent(HERMES_SEEDED_AGENT_ID, {
      provider: input.provider,
      model: input.model,
      reasoningEffort,
    });

    return Response.json({
      ...(await getModelSettings({ catalog })),
      saved: true,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

function resolvePersistedEffort(input: {
  modelSupportsReasoning: boolean;
  requested: HermesReasoningEffort | null | undefined;
}): HermesReasoningEffort | null {
  if (!input.modelSupportsReasoning) return null;
  if (input.requested === null) return null;
  if (input.requested) return input.requested;
  return DEFAULT_REASONING_EFFORT;
}

async function getModelSettings(options?: {
  catalog?: HermesModelCatalog;
  refresh?: boolean;
}) {
  const config = await resolveHermesRuntimeConfig();
  const catalog = options?.catalog ?? await getModelCatalog(config, options?.refresh === true);
  const agent = await ensureHermesSeededAgent();
  const selectedProvider =
    catalog.providers.find(
      (provider) =>
        provider.slug === agent?.provider &&
        provider.authenticated &&
        provider.models.some((model) => model.id === agent?.model),
    ) ??
    catalog.providers.find(
      (provider) =>
        provider.slug === catalog.currentProvider &&
        provider.models.some((model) => model.id === catalog.runtimeDefaultModel),
    ) ??
    catalog.providers.find((provider) => provider.authenticated && provider.models.length > 0);

  if (!selectedProvider) {
    throw new HermesRuntimeError(
      "Aucun provider Hermes authentifié ne propose de modèle.",
      503,
      "HERMES_MODEL_PROVIDER_UNAVAILABLE",
    );
  }

  const available = new Set(selectedProvider.models.map((model) => model.id));
  const selectedModel =
    (agent?.model && available.has(agent.model) ? agent.model : null) ??
    (available.has(catalog.runtimeDefaultModel) ? catalog.runtimeDefaultModel : null) ??
    selectedProvider.models[0]!.id;

  const selectedMeta = selectedProvider.models.find((model) => model.id === selectedModel);
  const selectedReasoningEffort = selectedMeta?.reasoning
    ? isHermesReasoningEffort(agent?.reasoningEffort)
      ? agent.reasoningEffort
      : DEFAULT_REASONING_EFFORT
    : null;

  return {
    catalog,
    selectedProvider: selectedProvider.slug,
    selectedModel,
    selectedReasoningEffort,
    availableReasoningEfforts: selectedMeta?.reasoning
      ? [...HERMES_REASONING_EFFORTS]
      : [],
    persistence: {
      source:
        agent?.provider === selectedProvider.slug &&
        agent?.model &&
        available.has(agent.model)
          ? "console_database"
          : "hermes_runtime",
      appliesTo: "new_threads",
      envOverride: false,
      reason:
        "Hermes expose le catalogue en lecture et accepte un modèle par mission. Le runtime n’autorise pas l’écriture de sa configuration.",
    },
  };
}

async function getModelCatalog(
  config: ResolvedRuntimeConfig,
  refresh: boolean,
): Promise<HermesModelCatalog> {
  const current = globalModelCatalog.hermesConsoleModelCatalog;
  if (
    !refresh &&
    current?.baseUrl === config.baseUrl &&
    current.value &&
    current.expiresAt > Date.now()
  ) {
    return current.value;
  }
  if (!refresh && current?.baseUrl === config.baseUrl && current.pending) {
    return current.pending;
  }

  const pending = listHermesModelOptions(config);
  globalModelCatalog.hermesConsoleModelCatalog = {
    baseUrl: config.baseUrl,
    expiresAt: 0,
    pending,
  };

  try {
    const value = await pending;
    globalModelCatalog.hermesConsoleModelCatalog = {
      baseUrl: config.baseUrl,
      value,
      expiresAt: Date.now() + 60_000,
    };
    return value;
  } catch (error) {
    delete globalModelCatalog.hermesConsoleModelCatalog;
    throw error;
  }
}
