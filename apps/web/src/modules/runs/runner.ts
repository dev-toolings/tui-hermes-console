import { DELTA_FLUSH_MS, HermesEventNormalizer } from "@/lib/hermes-events";
import { toProductEvents } from "@/lib/product-events";
import type { Usage } from "@/db/schema";
import type { ResolvedRuntimeConfig } from "@/modules/runtime/config";
import { resolveHermesRuntimeConfig } from "@/modules/runtime/config";
import {
  HermesRuntimeError,
  createHermesAgentRun,
  iterateHermesAgentEvents,
  stopHermesAgentRun,
  streamHermesAgentRun,
  streamHermesResponse,
} from "@/modules/runtime/hermes-adapter";
import { parseServerSentEvents } from "@/modules/runtime/sse";
import { publishThreadEvent } from "./event-bus";
import { resolveHermesProtocol } from "./protocol";
import {
  appendRunEvents,
  completeRun,
  failRun,
  getRunContext,
  markRunAwaitingApproval,
  markRunStarted,
  markRunStarting,
  setHermesResponseId,
} from "./repository";
import { HermesResponsesNormalizer } from "./responses-normalizer";
import type { ProductEventInput } from "./types";
import { augmentPromptWithArtifacts } from "@/modules/artifacts/prompt";
import { pushRunInputs, resolveRunRoot } from "@/modules/artifacts/remote-sync";

type ActiveRun = {
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

export function startRun(runId: string) {
  if (activeRuns.has(runId)) return;
  const controller = new AbortController();
  const promise = executeRun(runId, controller)
    .catch(() => {
      // executeRun persiste toujours son erreur. Éviter une rejection orpheline.
    })
    .finally(() => activeRuns.delete(runId));
  activeRuns.set(runId, { controller, hermesRunId: null, runtime: null, promise });
}

/**
 * Reprend le flux SSE d’une mission Hermes encore active après redémarrage process.
 * Ne recrée pas de run côté runtime.
 */
export function resumeAgentRun(
  runId: string,
  hermesRunId: string,
  runtime: ResolvedRuntimeConfig,
) {
  if (activeRuns.has(runId)) return;
  const controller = new AbortController();
  const promise = resumeAgentStream(runId, hermesRunId, runtime, controller)
    .catch(() => {
      // erreur déjà persistée
    })
    .finally(() => activeRuns.delete(runId));
  activeRuns.set(runId, { controller, hermesRunId, runtime, promise });
}

export function cancelActiveRun(runId: string) {
  const active = activeRuns.get(runId);
  if (!active) return false;

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

async function executeRun(runId: string, controller: AbortController) {
  const protocol = resolveHermesProtocol();
  if (protocol === "responses") {
    await executeResponsesRun(runId, controller);
    return;
  }
  await executeAgentRun(runId, controller);
}

async function executeAgentRun(runId: string, controller: AbortController) {
  const normalizer = new HermesEventNormalizer();
  let context: Awaited<ReturnType<typeof getRunContext>> | null = null;

  try {
    context = await getRunContext(runId);
    await markRunStarting(runId);

    const runtime = await resolveHermesRuntimeConfig();
    const active = activeRuns.get(runId);
    if (active) active.runtime = runtime;

    // Runtime distant : les pièces jointes doivent exister sur SA machine avant le run.
    const { root: remoteRoot } = await resolveRunRoot();
    if (remoteRoot) await pushRunInputs(runId);

    const prompt = augmentPromptWithArtifacts({
      prompt: context.input,
      inputArtifacts: context.inputArtifacts,
      runId,
      remoteRoot,
    });

    const { hermesRunId } = await createHermesAgentRun({
      input: prompt,
      instructions: context.instructions,
      provider: context.provider,
      model: context.model,
      reasoningEffort: context.reasoningEffort,
      baseUrl: runtime.baseUrl,
      token: runtime.token,
      signal: controller.signal,
    });
    await setHermesResponseId(runId, hermesRunId);
    if (active) active.hermesRunId = hermesRunId;

    const stream = await streamHermesAgentRun({
      hermesRunId,
      input: prompt,
      instructions: context.instructions,
      provider: context.provider,
      model: context.model,
      reasoningEffort: context.reasoningEffort,
      baseUrl: runtime.baseUrl,
      token: runtime.token,
      signal: controller.signal,
    });
    await markRunStarted(runId);
    await consumeAgentStream(runId, context.threadId, stream.body, normalizer, controller);
  } catch (error) {
    await handleAgentRunError(runId, context, normalizer, controller, error);
  }
}

async function resumeAgentStream(
  runId: string,
  hermesRunId: string,
  runtime: ResolvedRuntimeConfig,
  controller: AbortController,
) {
  const normalizer = new HermesEventNormalizer();
  let context: Awaited<ReturnType<typeof getRunContext>> | null = null;

  try {
    context = await getRunContext(runId);
    await markRunStarted(runId);

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
    await consumeAgentStream(runId, context.threadId, stream.body, normalizer, controller);
  } catch (error) {
    await handleAgentRunError(runId, context, normalizer, controller, error);
  }
}

async function consumeAgentStream(
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
      await persistEvents(threadId, runId, flushed);
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
      await persistEvents(threadId, runId, productEvents);
      for (const event of productEvents) {
        if (event.type === "approval.requested") {
          await markRunAwaitingApproval(runId);
        }
        if (event.type === "run.completed") {
          terminal = true;
          await completeRun(
            runId,
            String(event.payload.output ?? ""),
            (event.payload.usage as Usage | null) ?? null,
          );
        }
        if (event.type === "run.error") {
          terminal = true;
          await failRun(runId, String(event.payload.message ?? "Erreur Hermes."));
        }
        if (event.type === "system.notice" && event.payload.kind === "cancelled") {
          terminal = true;
          await failRun(runId, "", "cancelled");
        }
      }
    }
  } finally {
    clearInterval(flushTimer);
  }

  await flushBuffered();

  if (!terminal && !controller.signal.aborted) {
    const event = toProductEvents([
      normalizer.error("Le flux Hermes s’est fermé sans événement terminal."),
    ])[0]!;
    await persistEvents(threadId, runId, [event]);
    await failRun(runId, String(event.payload.message));
  }
}

async function handleAgentRunError(
  runId: string,
  context: Awaited<ReturnType<typeof getRunContext>> | null,
  normalizer: HermesEventNormalizer,
  controller: AbortController,
  error: unknown,
) {
  if (!context) return;

  if (controller.signal.aborted) {
    const events = toProductEvents([
      ...normalizer.flush(),
      normalizer.notice("Mission annulée par l’utilisateur.", "cancelled"),
    ]);
    await persistEvents(context.threadId, runId, events);
    await failRun(runId, "", "cancelled");
    return;
  }

  const message =
    error instanceof HermesRuntimeError
      ? error.message
      : error instanceof Error
        ? error.message
        : "Erreur inconnue pendant l’exécution.";
  const event = toProductEvents([normalizer.error(message)])[0]!;
  await persistEvents(context.threadId, runId, [
    ...toProductEvents(normalizer.flush()),
    event,
  ]);
  await failRun(runId, message);
}

async function executeResponsesRun(runId: string, controller: AbortController) {
  const normalizer = new HermesResponsesNormalizer();
  let context: Awaited<ReturnType<typeof getRunContext>> | null = null;
  let terminal = false;

  try {
    context = await getRunContext(runId);
    await markRunStarting(runId);

    const runtime = await resolveHermesRuntimeConfig();
    const active = activeRuns.get(runId);
    if (active) active.runtime = runtime;

    // Runtime distant : les pièces jointes doivent exister sur SA machine avant le run.
    const { root: remoteRoot } = await resolveRunRoot();
    if (remoteRoot) await pushRunInputs(runId);

    const prompt = augmentPromptWithArtifacts({
      prompt: context.input,
      inputArtifacts: context.inputArtifacts,
      runId,
      remoteRoot,
    });

    const response = await streamHermesResponse({
      input: prompt,
      instructions: context.instructions,
      provider: context.provider,
      model: context.model,
      reasoningEffort: context.reasoningEffort,
      conversation: context.hermesConversation,
      baseUrl: runtime.baseUrl,
      token: runtime.token,
      signal: controller.signal,
    });
    await markRunStarted(runId);

    const flushBuffered = async () => {
      const flushed = normalizer.flush();
      if (flushed.length > 0) {
        await persistEvents(context!.threadId, runId, flushed);
        for (const event of flushed) {
          if (event.type === "run.completed") {
            terminal = true;
            await completeRun(
              runId,
              String(event.payload.output ?? ""),
              (event.payload.usage as Usage | null) ?? null,
            );
          }
          if (event.type === "run.error") {
            terminal = true;
            await failRun(runId, String(event.payload.message ?? "Erreur Hermes."));
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
            await setHermesResponseId(runId, envelope.id);
            const active = activeRuns.get(runId);
            if (active) active.hermesRunId = envelope.id;
          }
        }

        const events = normalizer.push(raw);
        if (events.length > 0) {
          await persistEvents(context.threadId, runId, events);
          for (const event of events) {
            if (event.type === "run.completed") {
              terminal = true;
              await completeRun(
                runId,
                String(event.payload.output ?? ""),
                (event.payload.usage as Usage | null) ?? null,
              );
            }
            if (event.type === "run.error") {
              terminal = true;
              await failRun(runId, String(event.payload.message ?? "Erreur Hermes."));
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
      await persistEvents(context.threadId, runId, [event]);
      await failRun(runId, String(event.payload.message));
    }
  } catch (error) {
    if (!context) return;

    if (controller.signal.aborted) {
      const event = normalizer.notice("Mission annulée par l’utilisateur.", "cancelled");
      await persistEvents(context.threadId, runId, [...normalizer.flush(), event]);
      await failRun(runId, "", "cancelled");
      return;
    }

    const message =
      error instanceof HermesRuntimeError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Erreur inconnue pendant l’exécution.";
    const event = normalizer.error(message);
    await persistEvents(context.threadId, runId, [...normalizer.flush(), event]);
    await failRun(runId, message);
  }
}

async function persistEvents(
  threadId: string,
  runId: string,
  events: ProductEventInput[],
) {
  const stored = await appendRunEvents(threadId, runId, events);
  for (const event of stored) publishThreadEvent(threadId, event);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}
