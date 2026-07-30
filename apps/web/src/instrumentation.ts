export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;

  const { reconcileOrphanRuns } = await import("@/modules/runs/reconciler");
  void reconcileOrphanRuns()
    .then((result) => {
      if (result.examined === 0 && result.skippedActive === 0) return;
      console.info("[hermes-console] reconcile", result);
    })
    .catch((error: unknown) => {
      console.error(
        "[hermes-console] reconcile failed",
        error instanceof Error ? error.message : error,
      );
    });
}
