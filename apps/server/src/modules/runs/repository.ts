import path from "node:path";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gt, inArray, max } from "drizzle-orm";
import { getDatabase } from "@/db/client";
import {
  artifacts,
  messages,
  runEvents,
  runs,
  threads,
  type MessageContent,
  type ThreadSource,
  type Usage,
} from "@/db/schema";
import type {
  ArtifactDto,
  ProductEventInput,
  ProductRunStatus,
  RunActivityPoint,
  RunDto,
  StoredProductEvent,
  ThreadMessageDto,
  ThreadSnapshot,
} from "@console/core/modules/runs/types";
import { resolveEffectiveInference } from "@/modules/runtime/resolve-effective-model";
import { ensureRunWorkdirs, runInputDir } from "@/modules/artifacts/paths";
import { listArtifactsForRun, scanOutputArtifacts } from "@/modules/artifacts/repository";
import { pullRunOutputs } from "@/modules/artifacts/remote-sync";

const ACTIVE_STATUSES: ProductRunStatus[] = [
  "pending",
  "starting",
  "running",
  "awaiting_approval",
];
const TERMINAL_STATUSES: ProductRunStatus[] = ["completed", "failed", "cancelled"];

export class ProductRepositoryError extends Error {
  constructor(
    readonly code:
      | "THREAD_NOT_FOUND"
      | "RUN_NOT_FOUND"
      | "RUN_ALREADY_ACTIVE"
      | "RUN_ALREADY_TERMINAL"
      | "RUN_NOT_AWAITING_APPROVAL"
      | "AGENT_IN_CHAT",
    message: string,
  ) {
    super(message);
    this.name = "ProductRepositoryError";
  }
}

export async function createThreadWithRun(input: {
  source: ThreadSource;
  agentId?: string | null;
  agentName: string;
  instructions: string;
  provider?: string | null;
  model: string;
  reasoningEffort?: string | null;
  message: string;
}) {
  // Un agent ne s'attache qu'à une mission : `/chat` reste du chat libre, et on
  // n'y accède à un agent que par une mention `@`, qui crée sa propre mission.
  if (input.source === "chat" && input.agentId) {
    throw new ProductRepositoryError(
      "AGENT_IN_CHAT",
      "Un agent ne peut pas être attaché à une session de chat.",
    );
  }

  const db = getDatabase();
  const threadId = makeId("thr");
  const runId = makeId("run");
  const messageId = makeId("msg");
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx.insert(threads).values({
      id: threadId,
      title: makeTitle(input.message),
      source: input.source,
      agentId: input.agentId ?? null,
      agentName: input.agentName,
      instructions: input.instructions,
      provider: input.provider?.trim() || null,
      model: input.model || "hermes-agent",
      reasoningEffort: input.reasoningEffort?.trim() || null,
      hermesConversation: `console:${threadId}`,
      createdAt: now,
      updatedAt: now,
    });
    await tx.insert(runs).values({
      id: runId,
      threadId,
      input: input.message,
      status: "pending",
      createdAt: now,
    });
    await tx.insert(messages).values({
      id: messageId,
      threadId,
      runId,
      role: "user",
      content: [{ type: "text", text: input.message }],
      createdAt: now,
    });
  });

  const workdir = await ensureRunWorkdirs(runId);
  await getDatabase().update(runs).set({ workdir }).where(eq(runs.id, runId));

  return { threadId, runId };
}

export async function createRunForThread(threadId: string, input: string) {
  const db = getDatabase();
  const runId = makeId("run");
  const now = new Date();

  await db.transaction(async (tx) => {
    // `FOR UPDATE` sérialise les créations concurrentes sur la même conversation.
    // Sans ce verrou, deux POST simultanés lisent tous les deux « aucun run
    // actif » (READ COMMITTED) et démarrent deux missions sur le même fil.
    const [thread] = await tx
      .select({ id: threads.id })
      .from(threads)
      .where(eq(threads.id, threadId))
      .for("update");
    if (!thread) {
      throw new ProductRepositoryError("THREAD_NOT_FOUND", "Conversation introuvable.");
    }

    const [active] = await tx
      .select({ id: runs.id })
      .from(runs)
      .where(and(eq(runs.threadId, threadId), inArray(runs.status, ACTIVE_STATUSES)))
      .limit(1);
    if (active) {
      throw new ProductRepositoryError(
        "RUN_ALREADY_ACTIVE",
        "Une réponse est déjà en cours pour cette conversation.",
      );
    }

    await tx.insert(runs).values({
      id: runId,
      threadId,
      input,
      status: "pending",
      createdAt: now,
    });
    await tx.insert(messages).values({
      id: makeId("msg"),
      threadId,
      runId,
      role: "user",
      content: [{ type: "text", text: input }],
      createdAt: now,
    });
    await tx.update(threads).set({ updatedAt: now }).where(eq(threads.id, threadId));
  });

  const workdir = await ensureRunWorkdirs(runId);
  await getDatabase().update(runs).set({ workdir }).where(eq(runs.id, runId));

  return { threadId, runId };
}

/**
 * Historique du thread au format attendu par `POST /v1/runs`.
 *
 * MESURE (spike §11.3) : `/v1/runs` ne rejoue JAMAIS l'historique de la session
 * Hermes — passer un `session_id` seul laisse le modèle sans contexte. La
 * Console est donc la source de vérité et doit envoyer l'historique
 * explicitement. Corollaire rassurant : aucun risque de doublon entre les deux.
 *
 * Le message utilisateur du run courant est exclu : il part déjà comme `input`.
 */
async function getConversationHistory(
  threadId: string,
  currentRunId: string,
): Promise<Array<{ role: string; content: string }>> {
  const rows = await getDatabase()
    .select({ role: messages.role, content: messages.content, runId: messages.runId })
    .from(messages)
    .where(eq(messages.threadId, threadId))
    .orderBy(asc(messages.createdAt));

  const history: Array<{ role: string; content: string }> = [];
  for (const row of rows) {
    if (row.runId === currentRunId) continue;
    // Seul le texte fait sens ici : le raisonnement est du bruit et les appels
    // d'outils sont rejoués côté runtime, pas depuis notre transcript.
    const text = row.content
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("")
      .trim();
    if (!text) continue;
    history.push({ role: row.role, content: text });
  }
  return history;
}

/**
 * Activité par jour pour le graphique de l'Aperçu.
 *
 * Les jours sans mission sont émis à zéro : sans eux, une courbe relierait le
 * 12 au 28 comme s'il s'était passé quelque chose entre les deux.
 */
export async function getRunActivity(days = 30): Promise<RunActivityPoint[]> {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - (days - 1));

  const rows = await getDatabase()
    .select({ status: runs.status, usage: runs.usage, createdAt: runs.createdAt })
    .from(runs)
    .where(gt(runs.createdAt, since))
    .orderBy(asc(runs.createdAt));

  const buckets = new Map<string, RunActivityPoint>();
  for (let index = 0; index < days; index += 1) {
    const day = new Date(since);
    day.setDate(since.getDate() + index);
    const key = toDayKey(day);
    buckets.set(key, { date: key, completed: 0, failed: 0, tokens: 0 });
  }

  for (const row of rows) {
    const bucket = buckets.get(toDayKey(row.createdAt));
    if (!bucket) continue;
    if (row.status === "completed") bucket.completed += 1;
    if (row.status === "failed" || row.status === "cancelled") bucket.failed += 1;
    bucket.tokens += row.usage?.totalTokens ?? 0;
  }

  return [...buckets.values()];
}

function toDayKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function getRunContext(runId: string) {
  const db = getDatabase();
  const [row] = await db
    .select({
      runId: runs.id,
      threadId: runs.threadId,
      input: runs.input,
      status: runs.status,
      instructions: threads.instructions,
      threadProvider: threads.provider,
      threadModel: threads.model,
      threadReasoningEffort: threads.reasoningEffort,
      agentId: threads.agentId,
      hermesConversation: threads.hermesConversation,
    })
    .from(runs)
    .innerJoin(threads, eq(runs.threadId, threads.id))
    .where(eq(runs.id, runId))
    .limit(1);

  if (!row) throw new ProductRepositoryError("RUN_NOT_FOUND", "Mission introuvable.");

  const inference = await resolveEffectiveInference({
    threadProvider: row.threadProvider,
    threadModel: row.threadModel,
    threadReasoningEffort: row.threadReasoningEffort,
    agentId: row.agentId,
  });

  const inputDir = runInputDir(runId);
  const inputArtifacts = (await listArtifactsForRun(runId, "input")).map((item) => ({
    filename: item.filename,
    absolutePath: path.join(inputDir, item.filename),
  }));

  const conversationHistory = await getConversationHistory(row.threadId, row.runId);

  return {
    runId: row.runId,
    threadId: row.threadId,
    input: row.input,
    status: row.status,
    instructions: row.instructions,
    provider: inference.provider,
    model: inference.model,
    reasoningEffort: inference.reasoningEffort,
    hermesConversation: row.hermesConversation,
    conversationHistory,
    inputArtifacts,
  };
}

export async function markRunStarted(runId: string) {
  await getDatabase()
    .update(runs)
    .set({ status: "running", startedAt: new Date(), error: null })
    .where(eq(runs.id, runId));
}

export async function markRunStarting(runId: string) {
  await getDatabase()
    .update(runs)
    .set({ status: "starting", error: null })
    .where(eq(runs.id, runId));
}

export async function markRunAwaitingApproval(runId: string) {
  const db = getDatabase();
  const [run] = await db
    .select({ status: runs.status })
    .from(runs)
    .where(eq(runs.id, runId))
    .limit(1);
  if (!run) return;
  if (TERMINAL_STATUSES.includes(run.status as ProductRunStatus)) return;

  await db
    .update(runs)
    .set({ status: "awaiting_approval", error: null, lastEventAt: new Date() })
    .where(eq(runs.id, runId));
}

export async function setHermesResponseId(runId: string, responseId: string) {
  await getDatabase().update(runs).set({ hermesResponseId: responseId }).where(eq(runs.id, runId));
}

/**
 * Prochaine `sequence` libre pour une mission. A appeler avant de construire un
 * `HermesEventNormalizer` sur un run qui a deja des evenements en base.
 */
export async function nextRunSequence(runId: string): Promise<number> {
  const [row] = await getDatabase()
    .select({ max: max(runEvents.sequence) })
    .from(runEvents)
    .where(eq(runEvents.runId, runId));
  return (row?.max ?? -1) + 1;
}

export async function appendRunEvents(
  threadId: string,
  runId: string,
  incoming: ProductEventInput[],
): Promise<StoredProductEvent[]> {
  if (incoming.length === 0) return [];
  const db = getDatabase();
  const stored: StoredProductEvent[] = [];
  const lastAt = incoming.at(-1)?.occurredAt ?? new Date();

  await db.transaction(async (tx) => {
    for (const event of incoming) {
      const [row] = await tx
        .insert(runEvents)
        .values({
          runId,
          sequence: event.sequence,
          type: event.type,
          payload: event.payload,
          occurredAt: event.occurredAt,
        })
        .returning({ cursor: runEvents.id });
      stored.push({ ...event, runId, cursor: row.cursor });
    }
    await tx
      .update(runs)
      .set({ lastEventAt: lastAt })
      .where(eq(runs.id, runId));
    await tx.update(threads).set({ updatedAt: new Date() }).where(eq(threads.id, threadId));
  });

  return stored;
}

/**
 * Renseigne a posteriori les sorties d'outils d'une mission terminée.
 *
 * Le flux `/v1/runs` émet un `tool.completed` SANS résultat — mesuré dès la
 * passe 0b, d'où le `hasResultPayload: false` codé en dur dans
 * `lib/hermes-events.ts`. Les messages `role: "tool"` de la session Hermes,
 * eux, portent leur `content` complet (spike §11.4) : on les rapatrie une fois
 * la mission terminée et on complète les événements déjà persistés.
 *
 * Appariement FIFO par nom d'outil, faute d'identifiant d'appel dans le flux
 * SSE — exactement la règle qu'applique déjà `HermesEventNormalizer`. Deux
 * missions concurrentes sur un même thread mettraient cet appariement en
 * défaut ; le cas ne se présente pas (une mission active par thread).
 *
 * Renvoie les événements mis à jour, pour republication vers l'UI live.
 */
export async function applyToolOutputs(
  runId: string,
  outputs: Array<{ toolName: string | null; content: string }>,
): Promise<StoredProductEvent[]> {
  if (outputs.length === 0) return [];
  const db = getDatabase();

  const eventRows = await db
    .select({
      cursor: runEvents.id,
      sequence: runEvents.sequence,
      type: runEvents.type,
      payload: runEvents.payload,
      occurredAt: runEvents.occurredAt,
    })
    .from(runEvents)
    .where(eq(runEvents.runId, runId))
    .orderBy(asc(runEvents.sequence));

  const results = eventRows.filter(
    (row) => row.type === "tool.result" && row.payload.hasResultPayload !== true,
  );
  if (results.length === 0) return [];

  // La session accumule TOUS les tours du thread : seuls les derniers
  // correspondent à cette mission.
  const relevant = outputs.slice(-results.length);
  const queues = new Map<string, string[]>();
  for (const item of relevant) {
    const key = item.toolName ?? "";
    const queue = queues.get(key) ?? [];
    queue.push(item.content);
    queues.set(key, queue);
  }

  const updated: StoredProductEvent[] = [];
  for (const row of results) {
    const tool = String(row.payload.tool ?? "");
    const content = queues.get(tool)?.shift();
    if (content === undefined) continue;

    const payload = { ...row.payload, hasResultPayload: true, result: content };
    await db.update(runEvents).set({ payload }).where(eq(runEvents.id, row.cursor));
    updated.push({
      runId,
      cursor: row.cursor,
      sequence: row.sequence,
      type: row.type as StoredProductEvent["type"],
      payload,
      occurredAt: row.occurredAt,
    });
  }

  if (updated.length === 0) return [];

  // Le message assistant a été construit avant le backfill : le reconstruire
  // depuis les événements corrigés, sinon un rechargement de page reperd les
  // sorties que le flux live vient d'afficher.
  const patched = eventRows.map((row) => {
    const match = updated.find((item) => item.cursor === row.cursor);
    return match ? { type: row.type, payload: match.payload } : { type: row.type, payload: row.payload };
  });
  const [run] = await db
    .select({ output: runs.output })
    .from(runs)
    .where(eq(runs.id, runId))
    .limit(1);

  await db
    .update(messages)
    .set({ content: buildAssistantContent(patched, run?.output ?? "") })
    .where(and(eq(messages.runId, runId), eq(messages.role, "assistant")));

  return updated;
}

export async function completeRun(
  runId: string,
  output: string,
  usage: Usage | null,
) {
  const db = getDatabase();
  const now = new Date();

  await db.transaction(async (tx) => {
    const [run] = await tx
      .select({ threadId: runs.threadId, status: runs.status })
      .from(runs)
      .where(eq(runs.id, runId))
      .limit(1);
    if (!run) throw new ProductRepositoryError("RUN_NOT_FOUND", "Mission introuvable.");
    if (TERMINAL_STATUSES.includes(run.status as ProductRunStatus)) return;

    const eventRows = await tx
      .select({
        type: runEvents.type,
        payload: runEvents.payload,
      })
      .from(runEvents)
      .where(eq(runEvents.runId, runId))
      .orderBy(asc(runEvents.sequence));

    await tx
      .update(runs)
      .set({ status: "completed", output, usage, endedAt: now })
      .where(eq(runs.id, runId));

    const [existingAssistant] = await tx
      .select({ id: messages.id })
      .from(messages)
      .where(and(eq(messages.runId, runId), eq(messages.role, "assistant")))
      .limit(1);

    if (!existingAssistant) {
      await tx.insert(messages).values({
        id: makeId("msg"),
        threadId: run.threadId,
        runId,
        role: "assistant",
        content: buildAssistantContent(eventRows, output),
        createdAt: now,
      });
    }

    await tx.update(threads).set({ updatedAt: now }).where(eq(threads.id, run.threadId));
  });

  // Hors transaction : I/O filesystem (rapatriement puis scan out/).
  try {
    await pullRunOutputs(runId);
    await scanOutputArtifacts(runId);
  } catch (error) {
    console.error("[hermes-console] scan outputs failed", runId, error);
  }
}

export async function failRun(
  runId: string,
  error: string,
  status: "failed" | "cancelled" = "failed",
) {
  const db = getDatabase();
  const [run] = await db
    .select({ status: runs.status })
    .from(runs)
    .where(eq(runs.id, runId))
    .limit(1);
  if (!run) return;
  if (TERMINAL_STATUSES.includes(run.status as ProductRunStatus)) return;

  await db
    .update(runs)
    .set({ status, error: status === "failed" ? error : null, endedAt: new Date() })
    .where(eq(runs.id, runId));
}

export type ActiveRunRow = {
  id: string;
  threadId: string;
  status: ProductRunStatus;
  hermesResponseId: string | null;
  input: string;
};

export type RunCancelTarget = {
  id: string;
  threadId: string;
  status: ProductRunStatus;
  hermesResponseId: string | null;
  input: string;
};

export async function getRunCancelTarget(runId: string): Promise<RunCancelTarget | null> {
  const [row] = await getDatabase()
    .select({
      id: runs.id,
      threadId: runs.threadId,
      status: runs.status,
      hermesResponseId: runs.hermesResponseId,
      input: runs.input,
    })
    .from(runs)
    .where(eq(runs.id, runId))
    .limit(1);

  if (!row) return null;
  return {
    ...row,
    status: row.status as ProductRunStatus,
  };
}

export function isTerminalRunStatus(status: ProductRunStatus) {
  return TERMINAL_STATUSES.includes(status);
}

export async function listNonTerminalRuns(): Promise<ActiveRunRow[]> {
  const rows = await getDatabase()
    .select({
      id: runs.id,
      threadId: runs.threadId,
      status: runs.status,
      hermesResponseId: runs.hermesResponseId,
      input: runs.input,
    })
    .from(runs)
    .where(inArray(runs.status, ACTIVE_STATUSES));

  return rows.map((row) => ({
    ...row,
    status: row.status as ProductRunStatus,
  }));
}

export async function getThreadSnapshot(threadId: string): Promise<ThreadSnapshot | null> {
  const db = getDatabase();
  const [thread] = await db.select().from(threads).where(eq(threads.id, threadId)).limit(1);
  if (!thread) return null;

  const [messageRows, runRows, eventRows, artifactRows] = await Promise.all([
    db.select().from(messages).where(eq(messages.threadId, threadId)).orderBy(asc(messages.createdAt)),
    db.select().from(runs).where(eq(runs.threadId, threadId)).orderBy(asc(runs.createdAt)),
    db
      .select({
        cursor: runEvents.id,
        runId: runEvents.runId,
        sequence: runEvents.sequence,
        type: runEvents.type,
        payload: runEvents.payload,
        occurredAt: runEvents.occurredAt,
      })
      .from(runEvents)
      .innerJoin(runs, eq(runEvents.runId, runs.id))
      .where(eq(runs.threadId, threadId))
      .orderBy(asc(runEvents.id)),
    db
      .select({
        id: artifacts.id,
        runId: artifacts.runId,
        direction: artifacts.direction,
        filename: artifacts.filename,
        mimeType: artifacts.mimeType,
        sizeBytes: artifacts.sizeBytes,
        checksumSha256: artifacts.checksumSha256,
        createdAt: artifacts.createdAt,
      })
      .from(artifacts)
      .innerJoin(runs, eq(artifacts.runId, runs.id))
      .where(eq(runs.threadId, threadId))
      .orderBy(desc(artifacts.createdAt)),
  ]);

  const inference = await resolveEffectiveInference({
    threadProvider: thread.provider,
    threadModel: thread.model,
    agentId: thread.agentId,
  });

  return {
    id: thread.id,
    title: thread.title,
    source: thread.source,
    agentName: thread.agentName,
    instructions: thread.instructions,
    provider: thread.provider,
    model: thread.model,
    effectiveProvider: inference.provider,
    effectiveModel: inference.model,
    createdAt: thread.createdAt.toISOString(),
    updatedAt: thread.updatedAt.toISOString(),
    messages: messageRows.map(
      (message): ThreadMessageDto => ({
        id: message.id,
        role: message.role === "assistant" ? "assistant" : "user",
        content: message.content,
        runId: message.runId,
        createdAt: message.createdAt.toISOString(),
      }),
    ),
    runs: runRows.map(toRunDto),
    events: eventRows.map((event) => ({
      ...event,
      type: event.type as StoredProductEvent["type"],
    })),
    artifacts: artifactRows.map(
      (row): ArtifactDto => ({
        id: row.id,
        runId: row.runId,
        direction: row.direction,
        filename: row.filename,
        mimeType: row.mimeType,
        sizeBytes: row.sizeBytes,
        checksumSha256: row.checksumSha256,
        createdAt: row.createdAt.toISOString(),
      }),
    ),
    cursor: eventRows.at(-1)?.cursor ?? 0,
  };
}

export async function listThreadEventsAfter(
  threadId: string,
  cursor: number,
): Promise<StoredProductEvent[]> {
  const rows = await getDatabase()
    .select({
      cursor: runEvents.id,
      runId: runEvents.runId,
      sequence: runEvents.sequence,
      type: runEvents.type,
      payload: runEvents.payload,
      occurredAt: runEvents.occurredAt,
    })
    .from(runEvents)
    .innerJoin(runs, eq(runEvents.runId, runs.id))
    .where(and(eq(runs.threadId, threadId), gt(runEvents.id, cursor)))
    .orderBy(asc(runEvents.id));

  return rows.map((event) => ({
    ...event,
    type: event.type as StoredProductEvent["type"],
  }));
}

export async function getLatestRun(threadId: string): Promise<RunDto | null> {
  const [run] = await getDatabase()
    .select()
    .from(runs)
    .where(eq(runs.threadId, threadId))
    .orderBy(desc(runs.createdAt))
    .limit(1);
  return run ? toRunDto(run) : null;
}

export async function listThreads(options?: { source?: ThreadSource }) {
  const db = getDatabase();
  const threadQuery = options?.source
    ? db.select().from(threads).where(eq(threads.source, options.source)).orderBy(desc(threads.updatedAt))
    : db.select().from(threads).orderBy(desc(threads.updatedAt));
  const [threadRows, runRows] = await Promise.all([
    threadQuery,
    db.select().from(runs).orderBy(desc(runs.createdAt)),
  ]);
  const latestByThread = new Map<string, RunDto>();
  for (const run of runRows) {
    if (!latestByThread.has(run.threadId)) latestByThread.set(run.threadId, toRunDto(run));
  }
  return threadRows.map((thread) => ({
    id: thread.id,
    title: thread.title,
    agentName: thread.agentName,
    provider: thread.provider,
    model: thread.model,
    updatedAt: thread.updatedAt.toISOString(),
    latestRun: latestByThread.get(thread.id) ?? null,
  }));
}

function toRunDto(run: typeof runs.$inferSelect): RunDto {
  return {
    id: run.id,
    status: run.status as ProductRunStatus,
    input: run.input,
    output: run.output,
    usage: run.usage ?? null,
    error: run.error,
    hermesResponseId: run.hermesResponseId,
    runtimeSession: null,
    createdAt: run.createdAt.toISOString(),
    startedAt: run.startedAt?.toISOString() ?? null,
    endedAt: run.endedAt?.toISOString() ?? null,
    lastEventAt: run.lastEventAt?.toISOString() ?? null,
  };
}

function buildAssistantContent(
  events: Array<{ type: string; payload: Record<string, unknown> }>,
  output: string,
): MessageContent {
  const content: MessageContent = [];
  const toolParts = new Map<string, number>();

  for (const event of events) {
    if (event.type === "agent.message") {
      const text = String(event.payload.text ?? "");
      const last = content.at(-1);
      if (last?.type === "text") last.text += text;
      else content.push({ type: "text", text });
    }

    if (event.type === "agent.reasoning") {
      const text = String(event.payload.text ?? "");
      const last = content.at(-1);
      if (last?.type === "reasoning") last.text += text;
      else content.push({ type: "reasoning", text });
    }

    if (event.type === "tool.call") {
      const toolCallId = String(event.payload.toolCallId ?? makeId("call"));
      toolParts.set(toolCallId, content.length);
      content.push({
        type: "tool-call",
        toolCallId,
        toolName: "hermes_tool",
        args: {
          tool: String(event.payload.tool ?? "outil"),
          preview: event.payload.preview ?? null,
          arguments: event.payload.arguments ?? null,
        },
      });
    }

    if (event.type === "tool.result") {
      const toolCallId = String(event.payload.toolCallId ?? "");
      const index = toolParts.get(toolCallId);
      const part = index == null ? null : content[index];
      if (part?.type === "tool-call") {
        part.result = {
          durationMs:
            typeof event.payload.durationMs === "number" ? event.payload.durationMs : null,
          error: event.payload.error === true,
          hasResultPayload: event.payload.hasResultPayload === true,
          output: event.payload.result ?? null,
        };
      }
    }
  }

  if (!content.some((part) => part.type === "text") && output) {
    content.push({ type: "text", text: output });
  }

  return content;
}

function makeTitle(input: string) {
  const normalized = input.replace(/\s+/g, " ").trim();
  return normalized.length > 80 ? `${normalized.slice(0, 77)}…` : normalized;
}

function makeId(prefix: string) {
  return `${prefix}_${randomUUID().replaceAll("-", "")}`;
}
