import { DELTA_FLUSH_MS, HermesEventNormalizer } from "@console/core/lib/hermes-events";
import { toProductEvents } from "@/lib/product-events";
import type { Usage } from "@/db/schema";
import type { ResolvedRuntimeConfig } from "@/modules/runtime/config";
import {
  assertRuntimeWorkspaceReady,
  resolveHermesRuntimeConfig,
} from "@/modules/runtime/config";
import {
  HermesRuntimeError,
  createHermesAgentRun,
  ensureHermesSession,
  getHermesRun,
  iterateHermesAgentEvents,
  listHermesSessionMessages,
  stopHermesAgentRun,
  streamHermesAgentRun,
  streamHermesResponse,
} from "@/modules/runtime/hermes-adapter";
import { parseServerSentEvents } from "@/modules/runtime/sse";
import { publishThreadEvent } from "./event-bus";
import { resolveHermesProtocol } from "./protocol";
import {
  appendRunEvents,
  applyToolOutputs,
  completeRun,
  failRun,
  getRunCancelTarget,
  getRunContext,
  markRunAwaitingApproval,
  markRunStarted,
  markRunStarting,
  nextRunSequence,
  setHermesResponseId,
} from "./repository";
import { HermesResponsesNormalizer } from "./responses-normalizer";
import type { ProductEventInput } from "@console/core/modules/runs/types";
import {
  augmentInstructionsWithArtifacts,
  augmentPromptWithArtifacts,
} from "@/modules/artifacts/prompt";
import { resolveRunRoot } from "@/modules/artifacts/remote-paths";
import type { SiteScope } from "@/modules/auth/service";
import { persistApprovalRequest } from "./approval-requests";
import { assertRuntimeMutationIdle } from "./active-runtime-guard";
import { describeError, log } from "@/observability/log";

type ActiveRun = {
  siteId: string;
  source: "fresh" | "reconciled";
  controller: AbortController;
  hermesRunId: string | null;
  runtime: ResolvedRuntimeConfig | null;
  promise: Promise<void>;
};

const globalRunner = globalThis as typeof globalThis & {
  hermesConsoleActiveRuns?: Map<string, ActiveRun>;
};

const activeRuns =
  globalRunner.hermesConsoleActiveRuns ??
  (globalRunner.hermesConsoleActiveRuns = new Map<string, ActiveRun>());

export function startRun(scope: SiteScope, runId: string) {
  assertRuntimeMutationIdle();
  if (activeRuns.has(runId)) return;
  const controller = new AbortController();
  const promise = executeRun(scope, runId, controller)
    .catch(() => {
      // executeRun persiste toujours son erreur. Éviter une rejection orpheline.
    })
    .finally(() => activeRuns.delete(runId));
  activeRuns.set(runId, { siteId: scope.siteId, source: "fresh", controller, hermesRunId: null, runtime: null, promise });
}

/**
 * Reprend le flux SSE d’une mission Hermes encore active après redémarrage process.
 * Ne recrée pas de run côté runtime.
 */
export function resumeAgentRun(
  scope: SiteScope,
  runId: string,
  hermesRunId: string,
  runtime: ResolvedRuntimeConfig,
  options: { force?: boolean } = {},
) {
  assertRuntimeMutationIdle();
  const previous = activeRuns.get(runId);
  if (previous) {
    if (!options.force) return;
    // A boot reconciliation may still be listening to the pre-decision stream
    // when the human answers. Reconnect that local reader without stopping the
    // remote Hermes run; its abort reason must not become a user cancellation.
    previous.controller.abort("reconnect");
    activeRuns.delete(runId);
  }
  const controller = new AbortController();
  const active: ActiveRun = {
    siteId: scope.siteId,
    source: "reconciled",
    controller,
    hermesRunId,
    runtime,
    promise: Promise.resolve(),
  };
  const promise = resumeAgentStream(scope, runId, hermesRunId, runtime, controller)
    .catch(() => {
      // erreur déjà persistée
    })
    .finally(() => {
      if (activeRuns.get(runId) === active) activeRuns.delete(runId);
    });
  active.promise = promise;
  activeRuns.set(runId, active);
}

export function cancelActiveRun(scope: SiteScope, runId: string) {
  const active = activeRuns.get(runId);
  if (!active || active.siteId !== scope.siteId) return false;

  if (
    resolveHermesProtocol() === "agent" &&
    active.hermesRunId &&
    active.runtime
  ) {
    void stopHermesAgentRun({
      hermesRunId: active.hermesRunId,
      baseUrl: active.runtime.baseUrl,
      token: active.runtime.token,
    }).catch(() => {
      // L’abort local + failRun gèrent l’état produit même si Hermes ne répond pas.
    });
  }

  active.controller.abort();
  return true;
}

export function isRunActive(runId: string) {
  return activeRuns.has(runId);
}

export function isRunReconciled(runId: string) {
  return activeRuns.get(runId)?.source === "reconciled";
}

async function executeRun(scope: SiteScope, runId: string, controller: AbortController) {
  const protocol = resolveHermesProtocol();
  if (protocol === "responses") {
    await executeResponsesRun(scope, runId, controller);
    return;
  }
  await executeAgentRun(scope, runId, controller);
}

async function executeAgentRun(scope: SiteScope, runId: string, controller: AbortController) {
  const normalizer = new HermesEventNormalizer();
  let context: Awaited<ReturnType<typeof getRunContext>> | null = null;

  try {
    context = await getRunContext(scope, runId);
    await assertRuntimeWorkspaceReady();
    await markRunStarting(scope, runId);

    const runtime = await resolveHermesRuntimeConfig();
    const active = activeRuns.get(runId);
    if (active) active.runtime = runtime;

    // Runtime distant : les pièces jointes doivent exister sur SA machine avant le run.
    const { root: remoteRoot } = await resolveRunRoot();

    const prompt = augmentPromptWithArtifacts({
      prompt: context.input,
      inputArtifacts: context.inputArtifacts,
      runId,
      remoteRoot,
    });
    const instructions = augmentInstructionsWithArtifacts({
      instructions: context.instructions,
      runId,
      remoteRoot,
    });

    // La session Hermes du thread doit exister AVANT le run : c'est elle qui
    // rend `/api/sessions/:id/messages` interrogeable, donc le backfill des
    // sorties d'outils possible. Échec silencieux : on perd le backfill, pas
    // la mission.
    const sessionReady = await ensureHermesSession(
      runtime,
      context.hermesConversation,
      context.input,
    );

    const { hermesRunId } = await createHermesAgentRun({
      input: prompt,
      instructions,
      provider: context.provider,
      model: context.model,
      reasoningEffort: context.reasoningEffort,
      sessionId: context.hermesConversation,
      conversationHistory: context.conversationHistory,
      baseUrl: runtime.baseUrl,
      token: runtime.token,
      signal: controller.signal,
    });
    await setHermesResponseId(scope, runId, hermesRunId);
    if (active) active.hermesRunId = hermesRunId;

    const stream = await streamHermesAgentRun({
      hermesRunId,
      input: prompt,
      instructions,
      provider: context.provider,
      model: context.model,
      reasoningEffort: context.reasoningEffort,
      baseUrl: runtime.baseUrl,
      token: runtime.token,
      signal: controller.signal,
    });
    await markRunStarted(scope, runId);
    await consumeAgentStream(scope, runId, context.threadId, stream.body, normalizer, controller);

    if (sessionReady) {
      await backfillToolOutputs(scope, runId, context.threadId, context.hermesConversation, runtime);
    }
  } catch (error) {
    await handleAgentRunError(
      runId,
      context,
      normalizer,
      controller,
      error,
      activeRuns.get(runId)?.runtime ?? null,
      activeRuns.get(runId)?.hermesRunId ?? null,
    );
  }
}

async function resumeAgentStream(
  scope: SiteScope,
  runId: string,
  hermesRunId: string,
  runtime: ResolvedRuntimeConfig,
  controller: AbortController,
) {
  // Reprise d'une mission qui a deja des evenements en base : la sequence doit
  // continuer la serie existante, pas la recommencer.
  const normalizer = new HermesEventNormalizer(await nextRunSequence(scope, runId));
  let context: Awaited<ReturnType<typeof getRunContext>> | null = null;

  try {
    context = await getRunContext(scope, runId);
    // Après un redémarrage, Hermes peut encore être suspendu sur une demande
    // d'autorisation. Ne pas raconter un passage à `running` avant la décision
    // humaine : un flux vide de reprise doit conserver `awaiting_approval`.
    const persistedRun = await getRunCancelTarget(scope, runId);
    if (persistedRun?.status !== "awaiting_approval") {
      await markRunStarted(scope, runId);
    }

    const stream = await streamHermesAgentRun({
      hermesRunId,
      input: context.input,
      instructions: context.instructions,
      provider: context.provider,
      model: context.model,
      reasoningEffort: context.reasoningEffort,
      baseUrl: runtime.baseUrl,
      token: runtime.token,
      signal: controller.signal,
    });
    await consumeAgentStream(scope, runId, context.threadId, stream.body, normalizer, controller);
  } catch (error) {
    await handleAgentRunError(runId, context, normalizer, controller, error, runtime, hermesRunId);
  }
}

async function consumeAgentStream(
  scope: SiteScope,
  runId: string,
  threadId: string,
  body: ReadableStream<Uint8Array>,
  normalizer: HermesEventNormalizer,
  controller: AbortController,
) {
  let terminal = false;

  const flushBuffered = async () => {
    const flushed = toProductEvents(normalizer.flush());
    if (flushed.length > 0) {
      await persistEvents(scope, threadId, runId, flushed);
    }
  };

  const flushTimer = setInterval(() => {
    void flushBuffered();
  }, DELTA_FLUSH_MS);

  try {
    for await (const raw of iterateHermesAgentEvents(body)) {
      if (controller.signal.aborted) break;
      const productEvents = toProductEvents(normalizer.push(raw));
      if (productEvents.length === 0) continue;
      for (const event of productEvents) {
        if (event.type !== "approval.requested") continue;
        await persistApprovalRequest(scope, {
          runId,
          hermesRunId: raw.run_id,
          approvalRequestId: String(event.payload.approvalRequestId ?? `approval_${event.sequence}`),
        });
      }
      await persistEvents(scope, threadId, runId, productEvents);
      for (const event of productEvents) {
        if (event.type === "approval.requested") {
          await markRunAwaitingApproval(scope, runId);
        }
        if (event.type === "run.completed") {
          terminal = true;
          await completeRun(
            scope,
            runId,
            String(event.payload.output ?? ""),
            (event.payload.usage as Usage | null) ?? null,
          );
        }
        if (event.type === "run.error") {
          terminal = true;
          await failRun(scope, runId, String(event.payload.message ?? "Erreur Hermes."));
        }
        if (event.type === "system.notice" && event.payload.kind === "cancelled") {
          terminal = true;
          await failRun(scope, runId, "", "cancelled");
        }
      }
    }
  } finally {
    clearInterval(flushTimer);
  }

  await flushBuffered();

  if (!terminal && !controller.signal.aborted) {
    if (await isAwaitingApproval(scope, runId)) {
      // La mission attend un humain : le flux peut tomber (tunnel, veille,
      // socket fermée par Hermes) sans que rien ne soit perdu. `respondRunApproval`
      // se rebranchera au moment de la réponse — PRD §9.4, la perte du temps réel
      // ne transforme pas un run en échec.
      log.warn("[runner] flux fermé pendant une demande d’autorisation", { runId });
      return;
    }
    const event = toProductEvents([
      normalizer.error("Le flux Hermes s’est fermé sans événement terminal."),
    ])[0]!;
    await persistEvents(scope, threadId, runId, [event]);
    await failRun(scope, runId, String(event.payload.message));
  }
}

/** Le statut vit en base : le flux, lui, a pu mourir entre-temps. */
async function isAwaitingApproval(scope: SiteScope, runId: string) {
  try {
    const run = await getRunCancelTarget(scope, runId);
    return run?.status === "awaiting_approval";
  } catch {
    return false;
  }
}

/**
 * Rapatrie les sorties d'outils depuis la session Hermes une fois la mission
 * terminée, puis republie les événements corrigés vers l'UI live.
 *
 * Best-effort de bout en bout : une mission réussie ne doit jamais être
 * dégradée parce que le transcript de session est indisponible. En cas
 * d'échec, l'UI garde « Sortie non transmise par le runtime » — la vérité.
 */
async function backfillToolOutputs(
  scope: SiteScope,
  runId: string,
  threadId: string,
  sessionId: string,
  runtime: ResolvedRuntimeConfig,
) {
  try {
    const transcript = await listHermesSessionMessages(runtime, sessionId);
    const outputs = transcript
      .filter((message) => message.role === "tool")
      .map((message) => ({ toolName: message.toolName, content: message.content }));

    if (outputs.length === 0) {
      // Une mission sans outil est normale ; un transcript vide alors que la
      // mission en a appelé ne l'est pas. Le distinguer évite de reproduire
      // l'échec silencieux qui laissait « Sortie non transmise » sans trace.
      log.warn("[runner] aucune sortie d’outil dans le transcript", {
        runId,
        sessionId,
        transcriptMessages: transcript.length,
      });
      return;
    }

    const updated = await applyToolOutputs(scope, runId, outputs);
    for (const event of updated) publishThreadEvent(threadId, event);
  } catch (error) {
    log.error("[runner] tool output backfill failed", {
      runId,
      sessionId,
      ...describeError(error),
    });
  }
}

async function handleAgentRunError(
  runId: string,
  context: Awaited<ReturnType<typeof getRunContext>> | null,
  normalizer: HermesEventNormalizer,
  controller: AbortController,
  error: unknown,
  runtime: ResolvedRuntimeConfig | null,
  hermesRunId: string | null,
) {
  if (!context) return;

  if (controller.signal.aborted) {
    const events = toProductEvents([
      ...normalizer.flush(),
      normalizer.notice("Mission annulée par l’utilisateur.", "cancelled"),
    ]);
    await persistEventsBestEffort(context, context.threadId, runId, events);
    await failRun(context, runId, "", "cancelled");
    return;
  }

  // Hermes may close the historical SSE endpoint with 404 immediately after
  // the run reaches a terminal state. The canonical run endpoint is the
  // source of truth; do not turn that transport race into a false Console
  // failure after an approval response.
  if (
    runtime &&
    hermesRunId &&
    error instanceof HermesRuntimeError &&
    error.status === 404
  ) {
    try {
      const hermes = await readHermesAfterStreamFailure(runtime, hermesRunId);
      if (hermes?.status === "completed") {
        await completeRun(context, runId, hermes.output ?? "", hermes.usage);
        return;
      }
      if (hermes?.status === "failed") {
        await failRun(context, runId, hermes.output ?? "Erreur Hermes.");
        return;
      }
      if (hermes?.status === "cancelled") {
        await failRun(context, runId, "", "cancelled");
        return;
      }
    } catch {
      // Fall through to the existing awaiting/error handling when the
      // canonical status cannot be read either.
    }
  }

  if (controller.signal.aborted && controller.signal.reason === "reconnect") {
    return;
  }

  const message =
    error instanceof HermesRuntimeError
      ? error.message
      : error instanceof Error
        ? error.message
        : "Erreur inconnue pendant l’exécution.";

  // Même règle qu'à la fermeture propre du flux : une mission qui attend une
  // autorisation ne meurt pas d'une socket coupée pendant que l'humain lit.
  if (await isAwaitingApproval(context, runId)) {
    log.warn("[runner] flux interrompu pendant une demande d’autorisation", {
      runId,
      message,
    });
    await persistEventsBestEffort(
      context,
      context.threadId,
      runId,
      toProductEvents(normalizer.flush()),
    );
    return;
  }

  const event = toProductEvents([normalizer.error(message)])[0]!;
  await persistEventsBestEffort(context, context.threadId, runId, [
    ...toProductEvents(normalizer.flush()),
    event,
  ]);
  await failRun(context, runId, message);
}

async function readHermesAfterStreamFailure(
  runtime: ResolvedRuntimeConfig,
  hermesRunId: string,
) {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const hermes = await getHermesRun(runtime, hermesRunId);
      if (hermes.status === "completed" || hermes.status === "failed" || hermes.status === "cancelled") {
        return hermes;
      }
      lastError = null;
    } catch (error) {
      lastError = error;
      if (!(error instanceof HermesRuntimeError && error.status === 404)) throw error;
    }
    await Bun.sleep(250);
  }
  if (lastError) throw lastError;
  return null;
}

async function executeResponsesRun(scope: SiteScope, runId: string, controller: AbortController) {
  const normalizer = new HermesResponsesNormalizer();
  let context: Awaited<ReturnType<typeof getRunContext>> | null = null;
  let terminal = false;

  try {
    context = await getRunContext(scope, runId);
    await assertRuntimeWorkspaceReady();
    await markRunStarting(scope, runId);

    const runtime = await resolveHermesRuntimeConfig();
    const active = activeRuns.get(runId);
    if (active) active.runtime = runtime;

    // Runtime distant : les pièces jointes doivent exister sur SA machine avant le run.
    const { root: remoteRoot } = await resolveRunRoot();

    const prompt = augmentPromptWithArtifacts({
      prompt: context.input,
      inputArtifacts: context.inputArtifacts,
      runId,
      remoteRoot,
    });

    const response = await streamHermesResponse({
      input: prompt,
      instructions: augmentInstructionsWithArtifacts({
        instructions: context.instructions,
        runId,
        remoteRoot,
      }),
      provider: context.provider,
      model: context.model,
      reasoningEffort: context.reasoningEffort,
      conversation: context.hermesConversation,
      baseUrl: runtime.baseUrl,
      token: runtime.token,
      signal: controller.signal,
    });
    await markRunStarted(scope, runId);

    const flushBuffered = async () => {
      const flushed = normalizer.flush();
      if (flushed.length > 0) {
        await persistEvents(scope, context!.threadId, runId, flushed);
        for (const event of flushed) {
          if (event.type === "run.completed") {
            terminal = true;
            await completeRun(
              scope,
              runId,
              String(event.payload.output ?? ""),
              (event.payload.usage as Usage | null) ?? null,
            );
          }
          if (event.type === "run.error") {
            terminal = true;
            await failRun(scope, runId, String(event.payload.message ?? "Erreur Hermes."));
          }
        }
      }
    };

    const flushTimer = setInterval(() => {
      void flushBuffered();
    }, DELTA_FLUSH_MS);

    try {
      for await (const raw of parseServerSentEvents(response.body)) {
        if (raw.event === "response.created") {
          const envelope = asRecord(raw.data.response);
          if (typeof envelope.id === "string") {
            await setHermesResponseId(scope, runId, envelope.id);
            const active = activeRuns.get(runId);
            if (active) active.hermesRunId = envelope.id;
          }
        }

        const events = normalizer.push(raw);
        if (events.length > 0) {
          await persistEvents(scope, context.threadId, runId, events);
          for (const event of events) {
            if (event.type === "run.completed") {
              terminal = true;
              await completeRun(
                scope,
                runId,
                String(event.payload.output ?? ""),
                (event.payload.usage as Usage | null) ?? null,
              );
            }
            if (event.type === "run.error") {
              terminal = true;
              await failRun(scope, runId, String(event.payload.message ?? "Erreur Hermes."));
            }
          }
        }
      }
    } finally {
      clearInterval(flushTimer);
    }

    await flushBuffered();
    if (!terminal) {
      const event = normalizer.error("Le flux Hermes s’est fermé sans événement terminal.");
      await persistEvents(scope, context.threadId, runId, [event]);
      await failRun(scope, runId, String(event.payload.message));
    }
  } catch (error) {
    if (!context) return;

    if (controller.signal.aborted) {
      const event = normalizer.notice("Mission annulée par l’utilisateur.", "cancelled");
      await persistEvents(scope, context.threadId, runId, [...normalizer.flush(), event]);
      await failRun(scope, runId, "", "cancelled");
      return;
    }

    const message =
      error instanceof HermesRuntimeError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Erreur inconnue pendant l’exécution.";
    const event = normalizer.error(message);
    await persistEvents(scope, context.threadId, runId, [...normalizer.flush(), event]);
    await failRun(scope, runId, message);
  }
}

async function persistEvents(
  scope: SiteScope,
  threadId: string,
  runId: string,
  events: ProductEventInput[],
) {
  const stored = await appendRunEvents(scope, threadId, runId, events);
  for (const event of stored) publishThreadEvent(threadId, event);
}

/**
 * Variante pour les chemins de cloture : la mission doit atteindre son etat
 * terminal meme si la trace ne peut pas etre ecrite. Sans cela une erreur de
 * persistance laisse le run `running` a vie (§29).
 */
async function persistEventsBestEffort(
  scope: SiteScope,
  threadId: string,
  runId: string,
  events: ProductEventInput[],
) {
  try {
    await persistEvents(scope, threadId, runId, events);
  } catch (error) {
    log.error("[runner] event append failed", { runId, ...describeError(error) });
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}
