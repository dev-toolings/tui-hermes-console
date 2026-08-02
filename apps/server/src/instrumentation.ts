/**
 * Rattrapage des runs orphelins au démarrage.
 *
 * Un run laissé « en cours » par un arrêt brutal du process ne se terminerait
 * jamais tout seul : la Console le réconcilie contre le runtime au boot. C'était
 * le rôle du hook `instrumentation` de Next ; c'est maintenant le serveur Hono
 * qui l'appelle explicitement.
 */
import { describeError, log } from "@/observability/log";

export async function register() {
  const { reconcileOrphanRuns } = await import("@/modules/runs/reconciler");
  void reconcileOrphanRuns()
    .then((result) => {
      if (result.examined === 0 && result.skippedActive === 0) return;
      log.info("[hermes-console] reconcile", { ...result });
    })
    .catch((error: unknown) => {
      log.error("[hermes-console] reconcile failed", describeError(error));
    });
}
