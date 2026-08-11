import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDatabase } from "@/db/client";
import { projectRepositories, projects } from "@/db/schema";
import { appendAuditEntryInTransaction } from "@/modules/audit/service";
import { assertSiteAction } from "@/modules/auth/site-authorization";
import type { SiteRequestContext } from "@/modules/auth/service";
import { GuidedTaskRepositoryError } from "./repository";
import { inspectGuidedRepository, validateGuidedTestCommands } from "./sandbox";

const repositoryInputSchema = z.object({
  rootPath: z.string().trim().min(1).max(4_096),
  baseRef: z.string().trim().min(1).max(512).default("HEAD"),
  testCommands: z.array(z.array(z.string())).min(1).max(8),
  networkPolicy: z.enum(["none", "host"]).default("none"),
}).strict();

const createProjectRepositorySchema = repositoryInputSchema.extend({
  projectName: z.string().trim().min(2).max(160),
});

export async function createGuidedProjectRepository(
  context: SiteRequestContext,
  rawInput: unknown,
) {
  await assertSiteAction(context, "guided.repository.manage");
  const input = createProjectRepositorySchema.parse(rawInput);
  const testCommands = validateGuidedTestCommands(input.testCommands);
  const inspected = await inspectGuidedRepository(input.rootPath, input.baseRef);
  const projectId = `project_${randomUUID()}`;
  const now = new Date();
  const slugBase = input.projectName.toLowerCase().normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project";
  const slug = `${slugBase.slice(0, 120)}-${projectId.slice(-8)}`;
  await getDatabase().transaction(async (tx) => {
    await tx.insert(projects).values({
      id: projectId,
      siteId: context.siteId,
      name: input.projectName,
      slug,
      createdAt: now,
      updatedAt: now,
    });
    await tx.insert(projectRepositories).values({
      id: `repo_${randomUUID()}`,
      siteId: context.siteId,
      projectId,
      rootPath: inspected.rootPath,
      baseRef: input.baseRef,
      testCommands,
      networkPolicy: input.networkPolicy,
      createdAt: now,
      updatedAt: now,
    });
    await appendRepositoryAudit(tx, context, {
      projectId,
      baseRef: input.baseRef,
      baseCommit: inspected.baseCommit,
      networkPolicy: input.networkPolicy,
      testCommandCount: testCommands.length,
      beforeState: {},
      now,
    });
  });
  return { projectId, projectName: input.projectName, ...inspected };
}

export async function listGuidedProjectRepositories(context: SiteRequestContext) {
  await assertSiteAction(context, "guided.task.read");
  const rows = await getDatabase()
    .select({
      projectId: projects.id,
      projectName: projects.name,
      rootPath: projectRepositories.rootPath,
      baseRef: projectRepositories.baseRef,
      testCommands: projectRepositories.testCommands,
      networkPolicy: projectRepositories.networkPolicy,
    })
    .from(projects)
    .leftJoin(
      projectRepositories,
      and(
        eq(projectRepositories.siteId, projects.siteId),
        eq(projectRepositories.projectId, projects.id),
      ),
    )
    .where(and(
      eq(projects.siteId, context.siteId),
      context.mandateProjectId ? eq(projects.id, context.mandateProjectId) : undefined,
    ));
  const technical = context.role === "admin" || context.role === "operator" || context.role === "approver";
  return rows.map((row) => ({
    projectId: row.projectId,
    projectName: row.projectName,
    configured: Boolean(row.rootPath),
    rootPath: technical ? row.rootPath : null,
    baseRef: technical ? row.baseRef : null,
    testCommands: technical ? row.testCommands : [],
    networkPolicy: technical ? row.networkPolicy : null,
  }));
}

export async function saveGuidedProjectRepository(
  context: SiteRequestContext,
  projectId: string,
  rawInput: unknown,
) {
  await assertSiteAction(context, "guided.repository.manage");
  const input = repositoryInputSchema.parse(rawInput);
  const testCommands = validateGuidedTestCommands(input.testCommands);
  const inspected = await inspectGuidedRepository(input.rootPath, input.baseRef);
  const db = getDatabase();
  const [project] = await db.select({ id: projects.id }).from(projects).where(and(
    eq(projects.siteId, context.siteId),
    eq(projects.id, projectId),
    context.mandateProjectId ? eq(projects.id, context.mandateProjectId) : undefined,
  ));
  if (!project) {
    throw new GuidedTaskRepositoryError(
      "GUIDED_PROJECT_NOT_FOUND",
      "Projet introuvable dans ce périmètre.",
      404,
    );
  }
  const now = new Date();
  const [existing] = await db.select().from(projectRepositories).where(and(
    eq(projectRepositories.siteId, context.siteId),
    eq(projectRepositories.projectId, projectId),
  ));
  await db.transaction(async (tx) => {
    if (existing) {
      await tx.update(projectRepositories).set({
        rootPath: inspected.rootPath,
        baseRef: input.baseRef,
        testCommands,
        networkPolicy: input.networkPolicy,
        updatedAt: now,
      }).where(eq(projectRepositories.id, existing.id));
    } else {
      await tx.insert(projectRepositories).values({
        id: `repo_${randomUUID()}`,
        siteId: context.siteId,
        projectId,
        rootPath: inspected.rootPath,
        baseRef: input.baseRef,
        testCommands,
        networkPolicy: input.networkPolicy,
        createdAt: now,
        updatedAt: now,
      });
    }
    await appendRepositoryAudit(tx, context, {
      projectId,
      baseRef: input.baseRef,
      baseCommit: inspected.baseCommit,
      networkPolicy: input.networkPolicy,
      testCommandCount: testCommands.length,
      beforeState: existing ? { baseRef: existing.baseRef, networkPolicy: existing.networkPolicy } : {},
      now,
    });
  });
  return { projectId, ...inspected, baseRef: input.baseRef, testCommands, networkPolicy: input.networkPolicy };
}

type RepositoryAuditTx = Parameters<typeof appendAuditEntryInTransaction>[1];

async function appendRepositoryAudit(
  tx: RepositoryAuditTx,
  context: SiteRequestContext,
  input: {
    projectId: string;
    baseRef: string;
    baseCommit: string;
    networkPolicy: "none" | "host";
    testCommandCount: number;
    beforeState: Record<string, string | null>;
    now: Date;
  },
) {
  await appendAuditEntryInTransaction({
    eventId: randomUUID(),
    actorSiteId: context.siteId,
    targetSiteId: context.siteId,
    actorUserId: context.userId,
    actorRole: context.role,
    actorOrganizationId: context.actorOrganizationId,
    clientOrganizationId: context.clientOrganizationId,
    mandateId: context.mandateId,
    action: "guided.repository.configure",
    resourceType: "project",
    resourceId: input.projectId,
    decision: "allowed",
    reasonCode: "GUIDED_REPOSITORY_VERIFIED",
    beforeState: input.beforeState,
    afterState: {
      baseRef: input.baseRef,
      baseCommit: input.baseCommit,
      networkPolicy: input.networkPolicy,
      testCommandCount: input.testCommandCount,
    },
    correlationId: context.correlationId,
    occurredAt: input.now,
  }, tx);
}
