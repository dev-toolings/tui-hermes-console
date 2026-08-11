import {
  DEFAULT_REASONING_EFFORT,
  isHermesReasoningEffort,
  type HermesReasoningEffort,
} from "@console/core/lib/runtime/reasoning-effort";
import { resolveHermesRuntimeConfig } from "./config";
import {
  HermesRuntimeError,
  listHermesModelOptions,
  type HermesModelCatalog,
} from "./hermes-adapter";
import {
  getRuntimeModelSelection,
  saveRuntimeModelSelection,
  type RuntimeModelSelection,
} from "./model-settings";

export type ConcreteRuntimeModelSelection = {
  provider: string;
  model: string;
  reasoningEffort: HermesReasoningEffort | null;
};

export type AvailableRuntimeModelSelection = ConcreteRuntimeModelSelection & {
  catalog: HermesModelCatalog;
  persisted: RuntimeModelSelection;
};

/**
 * Choisit un couple provider/modèle réellement exploitable par Hermes.
 *
 * La sélection persistée reste prioritaire tant qu'elle est authentifiée et
 * que le modèle existe encore. Lorsqu'elle est périmée, un provider préféré
 * (OAuth fraîchement connecté par exemple), puis le provider courant Hermes,
 * puis le premier provider authentifié prennent le relais.
 */
export function pickAvailableRuntimeModelSelection(
  catalog: HermesModelCatalog,
  persisted: RuntimeModelSelection,
  options: { preferredProvider?: string | null } = {},
): ConcreteRuntimeModelSelection {
  const findAvailable = (
    providerSlug: string | null | undefined,
    modelId?: string | null,
    allowVirtual = true,
  ) => {
    if (!providerSlug) return null;
    const provider = catalog.providers.find((item) => item.slug === providerSlug);
    if (!provider?.authenticated || provider.models.length === 0) return null;
    if (!allowVirtual && (provider.authType === "virtual" || provider.source === "virtual")) {
      return null;
    }
    const model =
      (modelId ? provider.models.find((item) => item.id === modelId) : undefined) ??
      provider.models[0];
    if (!model) return null;
    return { provider, model };
  };

  const persistedChoice = findAvailable(persisted.provider, persisted.model);
  const preferredChoice = findAvailable(options.preferredProvider);
  const currentChoice = findAvailable(
    catalog.currentProvider,
    catalog.runtimeDefaultModel,
    false,
  );
  const firstConcreteChoice = catalog.providers.find(
    (provider) =>
      provider.authenticated &&
      provider.models.length > 0 &&
      provider.authType !== "virtual" &&
      provider.source !== "virtual",
  );
  const firstChoice = firstConcreteChoice ?? catalog.providers.find(
    (provider) => provider.authenticated && provider.models.length > 0,
  );
  const choice =
    persistedChoice ??
    preferredChoice ??
    currentChoice ??
    (firstChoice ? { provider: firstChoice, model: firstChoice.models[0]! } : null);

  if (!choice) {
    throw new HermesRuntimeError(
      "Aucun provider Hermes authentifié ne propose de modèle.",
      503,
      "HERMES_MODEL_PROVIDER_UNAVAILABLE",
    );
  }

  const reasoningEffort: HermesReasoningEffort | null = choice.model.reasoning
    ? isHermesReasoningEffort(persisted.reasoningEffort)
      ? persisted.reasoningEffort
      : DEFAULT_REASONING_EFFORT
    : null;

  return {
    provider: choice.provider.slug,
    model: choice.model.id,
    reasoningEffort,
  };
}

export async function resolveAvailableRuntimeModelSelection(options?: {
  preferredProvider?: string | null;
  repairPersisted?: boolean;
}): Promise<AvailableRuntimeModelSelection> {
  const persisted = await getRuntimeModelSelection();
  const config = await resolveHermesRuntimeConfig();
  const catalog = await listHermesModelOptions(config);
  const selection = pickAvailableRuntimeModelSelection(catalog, persisted, options);
  if (
    options?.repairPersisted &&
    (selection.provider !== persisted.provider ||
      selection.model !== persisted.model ||
      selection.reasoningEffort !== persisted.reasoningEffort)
  ) {
    await saveRuntimeModelSelection(selection);
  }
  return {
    ...selection,
    catalog,
    persisted,
  };
}
