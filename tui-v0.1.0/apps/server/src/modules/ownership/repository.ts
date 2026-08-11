import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { getDatabase } from "@/db/client";
import { agents, artifacts, connectors, runs, siteMemberships, threads } from "@/db/schema";
import { appendAuditEntryInTransaction } from "@/modules/audit/service";
import { auditScopedMiss } from "@/modules/auth/site-access";
import type { SiteRequestContext } from "@/modules/auth/service";

export const OWNERSHIP_RESOURCE_TYPES = [
  "agent",
  "connector",
  "thread",
] as const;

export type OwnershipResourceType = (typeof OWNERSHIP_RESOURCE_TYPES)[number];

export class OwnershipRepositoryError extends Error {
  constructor(
    readonly code: "OWNERSHIP_RESOURCE_NOT_FOUND",
    message = "Ressource introuvable.",
  ) {
    super(message);
    this.name = "OwnershipRepositoryError";
  }
}

type OwnershipRow = {
  id: string;
  siteId: string;
  projectId: string | null;
  ownerUserId: string;
  authorUserId: string;
};

export async function transferResourceOwnership(
  context: SiteRequestContext,
  resourceType: OwnershipResourceType,
  resourceId: string,
  ownerUserId: string,
) {
  const db = getDatabase();
  const result = await db.transaction(async (tx) => {
    let resource: OwnershipRow | undefined;
    if (resourceType === "agent") {
      [resource] = await tx.select({
        id: agents.id,
        siteId: agents.siteId,
        projectId: agents.projectId,
        ownerUserId: agents.ownerUserId,
        authorUserId: agents.authorUserId,
      }).from(agents).where(and(
        eq(agents.siteId, context.siteId),
        eq(agents.id, resourceId),
        context.mandateProjectId
          ? eq(agents.projectId, context.mandateProjectId)
          : undefined,
      )).for("update");
    } else if (resourceType === "connector") {
      [resource] = await tx.select({
        id: connectors.id,
        siteId: connectors.siteId,
        projectId: connectors.projectId,
        ownerUserId: connectors.ownerUserId,
        authorUserId: connectors.authorUserId,
      }).from(connectors).where(and(
        eq(connectors.siteId, context.siteId),
        eq(connectors.id, resourceId),
        context.mandateProjectId
          ? eq(connectors.projectId, context.mandateProjectId)
          : undefined,
      )).for("update");
    } else {
      [resource] = await tx.select({
        id: threads.id,
        siteId: threads.siteId,
        projectId: threads.projectId,
        ownerUserId: threads.ownerUserId,
        authorUserId: threads.authorUserId,
      }).from(threads).where(and(
        eq(threads.siteId, context.siteId),
        eq(threads.id, resourceId),
        context.mandateProjectId
          ? eq(threads.projectId, context.mandateProjectId)
          : undefined,
      )).for("update");
    }
    if (!resource) return null;

    // L'admin peut transférer toute ressource du site ; l'operator ne peut
    // déléguer que ce qu'il possède déjà. Les rôles lecture/demande ne
    // franchissent jamais cette frontière, même si la route est forgée.
    if (
      context.role !== "admin" &&
      (context.role !== "operator" || resource.ownerUserId !== context.userId)
    ) {
      return null;
    }

    const [actorMembership] = await tx
      .select({
        role: siteMemberships.role,
        organizationId: siteMemberships.organizationId,
      })
      .from(siteMemberships)
      .where(and(
        eq(siteMemberships.siteId, context.siteId),
        eq(siteMemberships.userId, context.userId),
        eq(siteMemberships.organizationId, context.actorOrganizationId),
      ))
      .for("update");
    if (
      !actorMembership ||
      actorMembership.role !== context.role ||
      actorMembership.organizationId !== context.actorOrganizationId
    ) return null;

    const [targetOwner] = await tx
      .select({ userId: siteMemberships.userId, role: siteMemberships.role })
      .from(siteMemberships)
      .where(and(
        eq(siteMemberships.siteId, context.siteId),
        eq(siteMemberships.userId, ownerUserId),
      ))
      .for("update");
    if (!targetOwner || !["admin", "operator", "requester"].includes(targetOwner.role)) {
      return null;
    }

    if (resourceType === "thread") {
      await tx.execute(sql`SET CONSTRAINTS runs_thread_owner_fk, artifacts_run_owner_fk DEFERRED`);
      await tx.update(threads).set({ ownerUserId }).where(and(
        eq(threads.siteId, context.siteId),
        eq(threads.id, resource.id),
      ));
      await tx.update(runs).set({ ownerUserId }).where(and(
        eq(runs.siteId, context.siteId),
        eq(runs.threadId, resource.id),
      ));
      await tx.update(artifacts).set({ ownerUserId }).where(and(
        eq(artifacts.siteId, context.siteId),
        sql`${artifacts.runId} IN (
          SELECT ${runs.id} FROM ${runs}
          WHERE ${runs.siteId} = ${context.siteId}
            AND ${runs.threadId} = ${resource.id}
        )`,
      ));
    } else if (resourceType === "agent") {
      await tx.update(agents).set({ ownerUserId }).where(and(
        eq(agents.siteId, context.siteId), eq(agents.id, resource.id),
      ));
    } else if (resourceType === "connector") {
      await tx.update(connectors).set({ ownerUserId }).where(and(
        eq(connectors.siteId, context.siteId), eq(connectors.id, resource.id),
      ));
    }

    const beforeState = {
      siteId: resource.siteId,
      projectId: resource.projectId,
      ownerUserId: resource.ownerUserId,
      authorUserId: resource.authorUserId,
    };
    const afterState = { ...beforeState, ownerUserId };
    await appendAuditEntryInTransaction({
      eventId: randomUUID(),
      actorSiteId: context.siteId,
      targetSiteId: context.siteId,
      actorUserId: context.userId,
      actorRole: context.role,
      actorOrganizationId: context.actorOrganizationId,
      clientOrganizationId: context.clientOrganizationId,
      mandateId: context.mandateId,
      action: "ownership.transfer",
      resourceType,
      resourceId: resource.id,
      decision: "allowed",
      reasonCode: "OWNERSHIP_TRANSFERRED",
      beforeState,
      afterState,
      correlationId: context.correlationId,
      occurredAt: new Date(),
    }, tx);

    return {
      resourceType,
      resourceId: resource.id,
      siteId: resource.siteId,
      projectId: resource.projectId,
      ownerUserId,
      authorUserId: resource.authorUserId,
    };
  });

  if (result) return result;
  await auditScopedMiss(context, {
    action: "ownership.transfer",
    resourceType,
    resourceId,
  });
  throw new OwnershipRepositoryError("OWNERSHIP_RESOURCE_NOT_FOUND");
}
