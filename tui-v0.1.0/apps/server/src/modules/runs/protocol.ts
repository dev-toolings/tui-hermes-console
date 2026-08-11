export type HermesProtocol = "agent" | "responses";

/** Protocole d’exécution Hermes. Défaut : agent (`/v1/runs`) — réconciliable / stoppable. */
export function resolveHermesProtocol(
  env: Record<string, string | undefined> = process.env,
): HermesProtocol {
  const value = env.HERMES_PROTOCOL?.trim().toLowerCase();
  return value === "responses" ? "responses" : "agent";
}
