import { resolveHermesRuntimeConfig } from "@/modules/runtime/config";
import {
  HermesRuntimeError,
  getHermesRun,
} from "@/modules/runtime/hermes-adapter";
import { HermesEventNormalizer } from "@/lib/hermes-events";
import { toProductEvents } from "@/lib/product-events";
import { publishThreadEvent } from "./event-bus";
import { decideReconcileAction } from "./reconcile-decision";
import { resolveHermesProtocol } from "./protocol";
import {
  appendRunEvents,
  completeRun,
  failRun,
  listNonTerminalRuns,
  nextRunSequence,
} from "./repository";
import { isRunActive, resumeAgentRun } from "./runner";

export type ReconcileResult = {
  examined: number;
  completed: number;
  failed: number;
  cancelled: number;
  resumed: number;
  skippedActive: number;
};

const globalReconcile = globalThis as typeof globalThis & {
  hermesConsoleReconcilePromise?: Promise<ReconcileResult>;
};

/**
 * Réconciliation au boot (PRD §15) : toute mission non terminale hors process
 * est repassée par `GET /v1/runs/:id` (protocole agent), sinon close avec une
 * cause explicite. Le protocole `/v1/responses` ne rejoue pas — on clôture.
 */
export async function reconcileOrphanRuns(): Promise<ReconcileResult> {
  if (globalReconcile.hermesConsoleReconcilePromise) {
    return globalReconcile.hermesConsoleReconcilePromise;
  }

  // Une passe qui échoue ne doit pas condamner le process : on retire le memo
  // pour qu'un prochain appel puisse réessayer. Seule une passe réussie
  // dédoublonne (boot once-per-process).
  const promise = runReconcile().catch((error) => {
    delete globalReconcile.hermesConsoleReconcilePromise;
    throw error;
  });
  globalReconcile.hermesConsoleReconcilePromise = promise;
  return promise;
}

/** Test / admin : force une nouvelle passe de réconciliation. */
export function resetReconcileGateForTests() {
  delete globalReconcile.hermesConsoleReconcilePromise;
}

async function runReconcile(): Promise<ReconcileResult> {
  const result: ReconcileResult = {
    examined: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    resumed: 0,
    skippedActive: 0,
  };

  const protocol = resolveHermesProtocol();

  let runtime: Awaited<ReturnType<typeof resolveHermesRuntimeConfig>> | null =
    null;
  try {
    runtime = await resolveHermesRuntimeConfig();
  } catch {
    runtime = null;
  }

  const orphans = await listNonTerminalRuns();
  for (const run of orphans) {
    if (isRunActive(run.id)) {
      result.skippedActive += 1;
      continue;
    }
    result.examined += 1;

    // Une mission qui résiste ne doit pas empêcher les suivantes d'être
    // réconciliées : chaque orphelin est isolé.
    try {
      await reconcileOne(run, runtime, protocol, result);
    } catch (error) {
      console.error("[reconcile] run skipped", { runId: run.id, error });
    }
  }

  return result;
}

type OrphanRun = Awaited<ReturnType<typeof listNonTerminalRuns>>[number];

async function reconcileOne(
  run: OrphanRun,
  runtime: Awaited<ReturnType<typeof resolveHermesRuntimeConfig>> | null,
  protocol: ReturnType<typeof resolveHermesProtocol>,
  result: ReconcileResult,
): Promise<void> {
  if (!run.hermesResponseId) {
    await closeAsFailed(
      run.threadId,
      run.id,
      "Processus Console redémarré avant la soumission au runtime Hermes.",
    );
    result.failed += 1;
    return;
  }

  if (!runtime) {
    // Runtime absent : on ne peut pas sonder Hermes — laisser en non-terminal
    // pour un prochain boot (sauf id manquant, déjà traité).
    return;
  }

  if (protocol === "responses") {
    await closeAsFailed(
      run.threadId,
      run.id,
      "Processus Console redémarré pendant une mission (/v1/responses) : reprise du flux impossible.",
    );
    result.failed += 1;
    return;
  }

  try {
    const hermes = await getHermesRun(runtime, run.hermesResponseId);
    const decision = decideReconcileAction({
      status: hermes.status,
      output: hermes.output,
      usage: hermes.usage,
    });

    switch (decision.action) {
      case "complete": {
        await completeRun(run.id, decision.output, decision.usage);
        result.completed += 1;
        break;
      }
      case "fail": {
        await closeAsFailed(run.threadId, run.id, decision.message);
        result.failed += 1;
        break;
      }
      case "cancel": {
        await failRun(run.id, "", "cancelled");
        result.cancelled += 1;
        break;
      }
      case "resume": {
        resumeAgentRun(run.id, run.hermesResponseId, runtime);
        result.resumed += 1;
        break;
      }
    }
  } catch (error) {
    if (error instanceof HermesRuntimeError && error.status === 404) {
      await closeAsFailed(
        run.threadId,
        run.id,
        "Le runtime Hermes ne connaît plus cette mission (expirée ou perdue après redémarrage).",
      );
      result.failed += 1;
      return;
    }

    const message =
      error instanceof Error
        ? error.message
        : "Réconciliation impossible après redémarrage.";
    await closeAsFailed(run.threadId, run.id, message);
    result.failed += 1;
  }
}

async function closeAsFailed(threadId: string, runId: string, message: string) {
  // La trace est un confort ; la transition d'état est le contrat (§29 : une
  // mission ne doit jamais rester `running`). Si l'écriture de l'événement
  // échoue, on clôture quand même.
  try {
    const normalizer = new HermesEventNormalizer(await nextRunSequence(runId));
    const event = toProductEvents([normalizer.error(message)])[0]!;
    const stored = await appendRunEvents(threadId, runId, [event]);
    for (const item of stored) publishThreadEvent(threadId, item);
  } catch (error) {
    console.error("[reconcile] event append failed", { runId, error });
  }
  await failRun(runId, message);
}
