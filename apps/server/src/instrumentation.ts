/**
 * Réconciliation de démarrage.
 *
 * Le stockage est traité en premier et de manière bloquante : une coupure en
 * plein cutover ne doit jamais laisser démarrer une mission. Les runs orphelins
 * sont ensuite rattrapés en arrière-plan contre le runtime.
 */
import { describeError, log } from "@/observability/log";

export async function register() {
  const { reconcilePendingStorageMigrations } = await import(
    "@/modules/runtime/ssh/storage-migration"
  );
  const storage = await reconcilePendingStorageMigrations();
  if (storage.examined > 0) {
    log.info("[hermes-console] storage migration reconcile", { ...storage });
  }

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
