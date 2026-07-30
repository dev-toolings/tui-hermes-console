import { randomUUID } from "node:crypto";
import { and, desc, eq, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { getDatabase } from "@/db/client";
import { agents, runs, threads } from "@/db/schema";
import { resolveHermesRuntimeConfig } from "@/modules/runtime/config";
import { deleteHermesSession, HermesRuntimeError } from "@/modules/runtime/hermes-adapter";
import { ensureHermesSeededAgent, HERMES_SEEDED_AGENT_ID } from "./seed";

export class AgentRepositoryError extends Error {
  constructor(
    readonly code: "AGENT_NOT_FOUND" | "AGENT_ARCHIVED" | "AGENT_PROTECTED" | "SLUG_CONFLICT",
    message: string,
  ) {
    super(message);
    this.name = "AgentRepositoryError";
  }
}

export type AgentDto = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  instructions: string;
  provider: string | null;
  model: string | null;
  reasoningEffort: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  runs: number;
  lastRunAt: string | null;
};

export async function listAgents(options?: { includeArchived?: boolean }): Promise<AgentDto[]> {
  await ensureHermesSeededAgent();

  const query = getDatabase().select().from(agents);
  const rows = await (
    options?.includeArchived
      ? query.orderBy(desc(agents.updatedAt))
      : query.where(isNull(agents.archivedAt)).orderBy(desc(agents.updatedAt))
  );

  return Promise.all(rows.map(toAgentDto));
}

export async function getAgent(agentId: string): Promise<AgentDto> {
  const [row] = await getDatabase().select().from(agents).where(eq(agents.id, agentId)).limit(1);
  if (!row) {
    throw new AgentRepositoryError("AGENT_NOT_FOUND", "Agent introuvable.");
  }
  return toAgentDto(row);
}

export async function createAgent(input: {
  name: string;
  description?: string | null;
  instructions: string;
  provider?: string | null;
  model?: string | null;
  reasoningEffort?: string | null;
}): Promise<AgentDto> {
  const db = getDatabase();
  const now = new Date();
  const id = makeId("agent");
  const slug = await uniqueSlug(slugify(input.name));

  await db.insert(agents).values({
    id,
    name: input.name,
    slug,
    description: input.description?.trim() || null,
    instructions: input.instructions,
    provider: input.provider?.trim() || null,
    model: input.model?.trim() || null,
    reasoningEffort: input.reasoningEffort?.trim() || null,
    createdAt: now,
    updatedAt: now,
  });

  return getAgent(id);
}

export async function updateAgent(
  agentId: string,
  input: {
    name?: string;
    description?: string | null;
    instructions?: string;
    provider?: string | null;
    model?: string | null;
    reasoningEffort?: string | null;
    archive?: boolean;
  },
): Promise<AgentDto> {
  const db = getDatabase();
  const [existing] = await db.select().from(agents).where(eq(agents.id, agentId)).limit(1);
  if (!existing) {
    throw new AgentRepositoryError("AGENT_NOT_FOUND", "Agent introuvable.");
  }

  const now = new Date();
  const name = input.name?.trim() ?? existing.name;
  let slug = existing.slug;
  if (input.name && input.name.trim() !== existing.name) {
    slug = await uniqueSlug(slugify(name), agentId);
  }

  await db
    .update(agents)
    .set({
      name,
      slug,
      description:
        input.description === undefined
          ? existing.description
          : input.description?.trim() || null,
      instructions: input.instructions ?? existing.instructions,
      provider:
        input.provider === undefined ? existing.provider : input.provider?.trim() || null,
      model:
        input.model === undefined ? existing.model : input.model?.trim() || null,
      reasoningEffort:
        input.reasoningEffort === undefined
          ? existing.reasoningEffort
          : input.reasoningEffort?.trim() || null,
      archivedAt: input.archive === true ? now : input.archive === false ? null : existing.archivedAt,
      updatedAt: now,
    })
    .where(eq(agents.id, agentId));

  return getAgent(agentId);
}

export async function requireActiveAgent(agentId: string) {
  const agent = await getAgent(agentId);
  if (agent.archivedAt) {
    throw new AgentRepositoryError("AGENT_ARCHIVED", "Cet agent est archivé.");
  }
  return agent;
}

export async function deleteAgent(agentId: string): Promise<void> {
  if (agentId === HERMES_SEEDED_AGENT_ID) {
    throw new AgentRepositoryError(
      "AGENT_PROTECTED",
      "L’agent miroir Hermes ne peut pas être supprimé.",
    );
  }

  const db = getDatabase();
  const [existing] = await db.select({ id: agents.id }).from(agents).where(eq(agents.id, agentId)).limit(1);
  if (!existing) {
    throw new AgentRepositoryError("AGENT_NOT_FOUND", "Agent introuvable.");
  }

  const sessionRows = await db
    .selectDistinct({ id: runs.hermesResponseId })
    .from(runs)
    .innerJoin(threads, eq(runs.threadId, threads.id))
    .where(and(eq(threads.agentId, agentId), isNotNull(runs.hermesResponseId)));

  try {
    const runtime = await resolveHermesRuntimeConfig();
    await Promise.all(
      sessionRows.map(async (row) => {
        if (!row.id) return;
        try {
          await deleteHermesSession(runtime, row.id);
        } catch (error) {
          if (error instanceof HermesRuntimeError && error.status === 404) return;
          console.warn("Hermes session cleanup skipped", { sessionId: row.id, error });
        }
      }),
    );
  } catch (error) {
    if (!(error instanceof HermesRuntimeError)) throw error;
    console.warn("Hermes unreachable during agent deletion", error);
  }

  await db.delete(agents).where(eq(agents.id, agentId));
}

async function toAgentDto(row: typeof agents.$inferSelect): Promise<AgentDto> {
  const db = getDatabase();
  const [stats] = await db
    .select({
      runs: sql<number>`count(*)::int`,
      lastRunAt: sql<Date | null>`max(${threads.updatedAt})`,
    })
    .from(threads)
    .where(and(eq(threads.agentId, row.id), eq(threads.source, "mission")));

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    instructions: row.instructions,
    provider: row.provider,
    model: row.model,
    reasoningEffort: row.reasoningEffort,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    runs: stats?.runs ?? 0,
    lastRunAt: stats?.lastRunAt ? new Date(stats.lastRunAt).toISOString() : null,
  };
}

async function uniqueSlug(base: string, excludeId?: string) {
  const db = getDatabase();
  let candidate = base || "agent";
  let attempt = 0;
  while (attempt < 50) {
    const [existing] = await db
      .select({ id: agents.id })
      .from(agents)
      .where(excludeId ? and(eq(agents.slug, candidate), ne(agents.id, excludeId)) : eq(agents.slug, candidate))
      .limit(1);
    if (!existing) return candidate;
    attempt += 1;
    candidate = `${base}-${attempt + 1}`;
  }
  throw new AgentRepositoryError("SLUG_CONFLICT", "Impossible de générer un identifiant unique.");
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function makeId(prefix: string) {
  return `${prefix}_${randomUUID().replaceAll("-", "")}`;
}
