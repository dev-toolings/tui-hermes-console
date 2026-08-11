export const HERMES_TOAST_HEADER = "X-Hermes-Toast";

export type MutationToastIntent = "created" | "updated" | "deleted" | "silent";

const INTENTS = new Set<MutationToastIntent>([
  "created",
  "updated",
  "deleted",
  "silent",
]);

/**
 * Reads the explicit toast contract carried by a mutating request.
 * Missing or unknown values intentionally return null: an unclassified
 * mutation must not guess that it created a resource.
 */
export function parseMutationToastIntent(
  value: string | null | undefined,
): MutationToastIntent | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "0" || normalized === "false") return "silent";
  return INTENTS.has(normalized as MutationToastIntent)
    ? (normalized as MutationToastIntent)
    : null;
}

export function mutationToastTitle(
  intent: Exclude<MutationToastIntent, "silent">,
  ok: boolean,
): string {
  if (intent === "created") return ok ? "Créé" : "Création échouée";
  if (intent === "updated") return ok ? "Mis à jour" : "Mise à jour échouée";
  return ok ? "Supprimé" : "Suppression échouée";
}
