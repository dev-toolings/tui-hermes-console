import { and, eq } from "drizzle-orm";
import { getDatabase } from "@/db/client";
import { agents } from "@/db/schema";
import {
  isHermesReasoningEffort,
  type HermesReasoningEffort,
} from "@console/core/lib/runtime/reasoning-effort";
import { resolveAvailableRuntimeModelSelection } from "./available-model-selection";
import { getRuntimeModelSelection } from "@/modules/runtime/model-settings";
import type { SiteScope } from "@/modules/auth/service";

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
 * Les settings Console conservent une sélection globale ; les threads historiques
 * peuvent encore porter l’alias `hermes-agent`.
 */
export async function resolveEffectiveModel(scope: SiteScope, input: {
  threadModel: string;
  agentId: string | null;
}): Promise<string> {
  return (await resolveEffectiveInference(scope, {
    threadProvider: null,
    threadModel: input.threadModel,
    threadReasoningEffort: null,
    agentId: input.agentId,
  })).model;
}

export async function resolveEffectiveInference(scope: SiteScope, input: {
  threadProvider: string | null;
  threadModel: string;
  threadReasoningEffort?: string | null;
  agentId: string | null;
}): Promise<{
  provider: string | null;
  model: string;
  reasoningEffort: HermesReasoningEffort | null;
}> {
  const selection = await getRuntimeModelSelection();
  const consoleModel = selection.model;
  const consoleDefault = isConcreteModel(consoleModel) ? consoleModel : null;
  const consoleProvider = selection.provider;
  const consoleEffort = selection.reasoningEffort;
  const threadModel = input.threadModel.trim();
  const threadEffort = normalizeEffort(input.threadReasoningEffort);

  let availableSelectionPromise:
    | Promise<Awaited<ReturnType<typeof resolveAvailableRuntimeModelSelection>> | null>
    | null = null;
  const getAvailableSelection = async () => {
    availableSelectionPromise ??= resolveAvailableRuntimeModelSelection({
      repairPersisted: true,
    }).catch(() => null);
    return availableSelectionPromise;
  };

  if (threadModel && !LEGACY_MODEL_ALIASES.has(threadModel)) {
    if (input.threadProvider?.trim()) {
      const available = await getAvailableSelection();
      const provider = available?.catalog.providers.find(
        (item) => item.slug === input.threadProvider?.trim(),
      );
      const modelStillAvailable =
        provider?.authenticated === true && provider.models.some((item) => item.id === threadModel);
      if (available && !modelStillAvailable) {
        return {
          provider: available.provider,
          model: available.model,
          reasoningEffort: available.reasoningEffort,
        };
      }
    }
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
      .where(and(eq(agents.siteId, scope.siteId), eq(agents.id, input.agentId)))
      .limit(1);

    const agentModel = agent?.model ?? null;
    if (isConcreteModel(agentModel)) {
      if (agent?.provider?.trim()) {
        const available = await getAvailableSelection();
        const provider = available?.catalog.providers.find(
          (item) => item.slug === agent.provider?.trim(),
        );
        const modelStillAvailable =
          provider?.authenticated === true && provider.models.some((item) => item.id === agentModel);
        if (available && !modelStillAvailable) {
          return {
            provider: available.provider,
            model: available.model,
            reasoningEffort: available.reasoningEffort,
          };
        }
      }
      return {
        provider: agent?.provider?.trim() || input.threadProvider?.trim() || consoleProvider,
        model: agentModel,
        reasoningEffort: threadEffort ?? normalizeEffort(agent?.reasoningEffort) ?? consoleEffort,
      };
    }
  }

  const available = await getAvailableSelection();
  if (available) {
    return {
      provider: available.provider,
      model: available.model,
      reasoningEffort: available.reasoningEffort,
    };
  }

  return {
    provider: consoleProvider ?? input.threadProvider?.trim() ?? null,
    model: consoleDefault ?? (threadModel || "hermes-agent"),
    reasoningEffort: threadEffort ?? consoleEffort,
  };
}
