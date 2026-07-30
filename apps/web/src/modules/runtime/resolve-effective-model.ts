import { eq } from "drizzle-orm";
import { getDatabase } from "@/db/client";
import { agents } from "@/db/schema";
import {
  isHermesReasoningEffort,
  type HermesReasoningEffort,
} from "@/lib/runtime/reasoning-effort";
import { ensureHermesSeededAgent } from "@/modules/agents/seed";

const LEGACY_MODEL_ALIASES = new Set(["", "hermes-agent"]);

function isConcreteModel(model: string | null | undefined): model is string {
  const value = model?.trim();
  return Boolean(value && !LEGACY_MODEL_ALIASES.has(value));
}

function normalizeEffort(value: string | null | undefined): HermesReasoningEffort | null {
  return isHermesReasoningEffort(value) ? value : null;
}

/**
 * Résout le modèle réellement envoyé à Hermes.
 * Les settings Console mettent à jour l’agent seedé ; les threads historiques
 * peuvent encore porter l’alias `hermes-agent`.
 */
export async function resolveEffectiveModel(input: {
  threadModel: string;
  agentId: string | null;
}): Promise<string> {
  return (await resolveEffectiveInference({
    threadProvider: null,
    threadModel: input.threadModel,
    threadReasoningEffort: null,
    agentId: input.agentId,
  })).model;
}

export async function resolveEffectiveInference(input: {
  threadProvider: string | null;
  threadModel: string;
  threadReasoningEffort?: string | null;
  agentId: string | null;
}): Promise<{
  provider: string | null;
  model: string;
  reasoningEffort: HermesReasoningEffort | null;
}> {
  const hermesAgent = await ensureHermesSeededAgent();
  const consoleModel = hermesAgent?.model ?? null;
  const consoleDefault = isConcreteModel(consoleModel) ? consoleModel : null;
  const consoleProvider = hermesAgent?.provider?.trim() || null;
  const consoleEffort = normalizeEffort(hermesAgent?.reasoningEffort);
  const threadModel = input.threadModel.trim();
  const threadEffort = normalizeEffort(input.threadReasoningEffort);

  if (threadModel && !LEGACY_MODEL_ALIASES.has(threadModel)) {
    return {
      provider: input.threadProvider?.trim() || consoleProvider,
      model: threadModel,
      reasoningEffort: threadEffort ?? consoleEffort,
    };
  }

  if (input.agentId) {
    const [agent] = await getDatabase()
      .select({
        provider: agents.provider,
        model: agents.model,
        reasoningEffort: agents.reasoningEffort,
      })
      .from(agents)
      .where(eq(agents.id, input.agentId))
      .limit(1);

    const agentModel = agent?.model ?? null;
    if (isConcreteModel(agentModel)) {
      return {
        provider: agent?.provider?.trim() || input.threadProvider?.trim() || consoleProvider,
        model: agentModel,
        reasoningEffort: threadEffort ?? normalizeEffort(agent?.reasoningEffort) ?? consoleEffort,
      };
    }
  }

  return {
    provider: consoleProvider ?? input.threadProvider?.trim() ?? null,
    model: consoleDefault ?? (threadModel || "hermes-agent"),
    reasoningEffort: threadEffort ?? consoleEffort,
  };
}
