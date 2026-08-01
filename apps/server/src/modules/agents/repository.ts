import { randomUUID } from "node:crypto";
import { and, desc, eq, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { getDatabase } from "@/db/client";
import { agents, runs, threads } from "@/db/schema";
import { resolveHermesRuntimeConfig } from "@/modules/runtime/config";
import { deleteHermesSession, HermesRuntimeError } from "@/modules/runtime/hermes-adapter";
import type { SiteRequestContext } from "@/modules/auth/service";
import { auditScopedMiss } from "@/modules/auth/site-access";
import { auditOwnershipCreation } from "@/modules/ownership/audit";

export class AgentRepositoryError extends Error {
  constructor(
    readonly code: "AGENT_NOT_FOUND" | "AGENT_ARCHIVED" | "SLUG_CONFLICT",
    message: string,
  ) {
    super(message);
    this.name = "AgentRepositoryError";
  }
}

export type { AgentDto } from "@console/core/types/api";
import type { AgentDto } from "@console/core/types/api";

export async function listAgents(context: SiteRequestContext, options?: { includeArchived?: boolean }): Promise<AgentDto[]> {
  const query = getDatabase().select().from(agents);
  const owner = context.role === "requester" ? eq(agents.ownerUserId, context.userId) : undefined;
  const rows = await (
    options?.includeArchived
      ? query.where(and(eq(agents.siteId, context.siteId), owner)).orderBy(desc(agents.updatedAt))
      : query.where(and(eq(agents.siteId, context.siteId), owner, isNull(agents.archivedAt))).orderBy(desc(agents.updatedAt))
  );

  return Promise.all(rows.map(toAgentDto));
}

export async function getAgent(context: SiteRequestContext, agentId: string): Promise<AgentDto> {
  const [row] = await getDatabase().select().from(agents).where(and(
    eq(agents.siteId, context.siteId),
    eq(agents.id, agentId),
    context.role === "requester" ? eq(agents.ownerUserId, context.userId) : undefined,
  )).limit(1);
  if (!row) {
    await auditScopedMiss(context, { action: "agent.read", resourceType: "agent", resourceId: agentId });
    throw new AgentRepositoryError("AGENT_NOT_FOUND", "Agent introuvable.");
  }
  return toAgentDto(row);
}

export async function createAgent(context: SiteRequestContext, input: {
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
  const slug = await uniqueSlug(context.siteId, slugify(input.name));

  await db.transaction(async (tx) => {
    await tx.insert(agents).values({
      id,
      siteId: context.siteId,
      ownerUserId: context.userId,
      authorUserId: context.userId,
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
    await auditOwnershipCreation(tx, context, {
      resourceType: "agent",
      resourceId: id,
      projectId: null,
      ownerUserId: context.userId,
      authorUserId: context.userId,
    });
  });

  return getAgent(context, id);
}

export async function updateAgent(
  context: SiteRequestContext,
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
  const [existing] = await db.select().from(agents).where(and(eq(agents.siteId, context.siteId), eq(agents.id, agentId))).limit(1);
  if (!existing) {
    await auditScopedMiss(context, { action: "agent.update", resourceType: "agent", resourceId: agentId });
    throw new AgentRepositoryError("AGENT_NOT_FOUND", "Agent introuvable.");
  }

  const now = new Date();
  const name = input.name?.trim() ?? existing.name;
  let slug = existing.slug;
  if (input.name && input.name.trim() !== existing.name) {
    slug = await uniqueSlug(context.siteId, slugify(name), agentId);
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
    .where(and(eq(agents.siteId, context.siteId), eq(agents.id, agentId)));

  return getAgent(context, agentId);
}

export async function requireActiveAgent(context: SiteRequestContext, agentId: string) {
  const agent = await getAgent(context, agentId);
  if (agent.archivedAt) {
    throw new AgentRepositoryError("AGENT_ARCHIVED", "Cet agent est archivé.");
  }
  return agent;
}

/**
 * Résout une référence d'agent saisie à la main — `/agent switch <ref>` ou une
 * mention `@ref`. Cherche par id, puis slug, puis nom, parmi les agents actifs.
 */
export async function resolveActiveAgentRef(context: SiteRequestContext, target: string): Promise<AgentDto> {
  const db = getDatabase();
  const normalized = target.trim();

  const [match] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(
      and(
        or(
          eq(agents.id, normalized),
          eq(agents.slug, normalized),
          eq(agents.slug, normalized.toLowerCase()),
          eq(agents.name, normalized),
        ),
        eq(agents.siteId, context.siteId),
        isNull(agents.archivedAt),
      ),
    )
    .limit(1);

  if (match) return requireActiveAgent(context, match.id);

  const available = await db
    .select({ slug: agents.slug })
    .from(agents)
    .where(and(
      eq(agents.siteId, context.siteId),
      isNull(agents.archivedAt),
      context.role === "requester" ? eq(agents.ownerUserId, context.userId) : undefined,
    ))
    .orderBy(desc(agents.updatedAt))
    .limit(10);

  throw new AgentRepositoryError(
    "AGENT_NOT_FOUND",
    available.length
      ? `Agent « ${target} » introuvable. Agents disponibles : ${available
          .map((row) => `@${row.slug}`)
          .join(", ")}.`
      : `Agent « ${target} » introuvable. Aucun agent actif — créez-en un depuis Agents.`,
  );
}

type DeleteAgentDependencies = {
  resolveRuntime: typeof resolveHermesRuntimeConfig;
  deleteSession: typeof deleteHermesSession;
};

export async function deleteAgent(
  context: SiteRequestContext,
  agentId: string,
  dependencies: DeleteAgentDependencies = {
    resolveRuntime: resolveHermesRuntimeConfig,
    deleteSession: deleteHermesSession,
  },
): Promise<void> {
  const db = getDatabase();
  const [existing] = await db.select({ id: agents.id }).from(agents).where(and(eq(agents.siteId, context.siteId), eq(agents.id, agentId))).limit(1);
  if (!existing) {
    await auditScopedMiss(context, { action: "agent.delete", resourceType: "agent", resourceId: agentId });
    throw new AgentRepositoryError("AGENT_NOT_FOUND", "Agent introuvable.");
  }

  const sessionRows = await db
    .selectDistinct({ id: runs.hermesResponseId })
    .from(runs)
    .innerJoin(threads, eq(runs.threadId, threads.id))
    .where(and(eq(threads.siteId, context.siteId), eq(runs.siteId, context.siteId), eq(threads.agentId, agentId), isNotNull(runs.hermesResponseId)));

  try {
    const runtime = await dependencies.resolveRuntime();
    await Promise.all(
      sessionRows.map(async (row) => {
        if (!row.id) return;
        try {
          await dependencies.deleteSession(runtime, row.id);
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

  await db.delete(agents).where(and(eq(agents.siteId, context.siteId), eq(agents.id, agentId)));
}

async function toAgentDto(row: typeof agents.$inferSelect): Promise<AgentDto> {
  const db = getDatabase();
  const [stats] = await db
    .select({
      runs: sql<number>`count(*)::int`,
      lastRunAt: sql<Date | null>`max(${threads.updatedAt})`,
    })
    .from(threads)
    .where(and(eq(threads.siteId, row.siteId), eq(threads.agentId, row.id), eq(threads.source, "mission")));

  return {
    id: row.id,
    projectId: row.projectId,
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

async function uniqueSlug(siteId: string, base: string, excludeId?: string) {
  const db = getDatabase();
  let candidate = base || "agent";
  let attempt = 0;
  while (attempt < 50) {
    const [existing] = await db
      .select({ id: agents.id })
      .from(agents)
      .where(excludeId ? and(eq(agents.siteId, siteId), eq(agents.slug, candidate), ne(agents.id, excludeId)) : and(eq(agents.siteId, siteId), eq(agents.slug, candidate)))
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
