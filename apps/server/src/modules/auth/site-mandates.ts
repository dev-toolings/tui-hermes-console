import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDatabase } from "@/db/client";
import {
  consoleUsers,
  mspMandateAssignments,
  mspMandates,
  organizationMemberships,
  organizations,
  projects,
  runs,
  siteMemberships,
} from "@/db/schema";
import { appendAuditEntryInTransaction } from "@/modules/audit/service";
import type { AuditJsonValue } from "@/modules/audit/chain";
import { assertSiteAction } from "./site-authorization";
import { AuthError, type SiteRequestContext } from "./service";
import { cancelRun } from "@/modules/runs/cancel-run";
import { failRun } from "@/modules/runs/repository";
import { describeError, log } from "@/observability/log";

export type MandateInput = {
  operatorOrganizationId: string;
  projectId?: string | null;
  startsAt?: string;
  expiresAt?: string | null;
};

function requireClientAdmin(context: SiteRequestContext) {
  if (
    context.role !== "admin" ||
    context.actorOrganizationId !== context.clientOrganizationId
  ) {
    throw new AuthError(
      "Seul un administrateur de l’organisation cliente peut gérer les mandats.",
      403,
      "CLIENT_ADMIN_REQUIRED",
    );
  }
}

function parseDate(value: string | null | undefined, field: string) {
  if (value === undefined || value === null) return value ?? null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AuthError(`La date ${field} est invalide.`, 400, "INVALID_INPUT");
  }
  return date;
}

async function appendMandateAudit(
  tx: Parameters<typeof appendAuditEntryInTransaction>[1],
  context: SiteRequestContext,
  resourceId: string,
  action: string,
  beforeState: AuditJsonValue,
  afterState: AuditJsonValue,
) {
  await appendAuditEntryInTransaction(
    {
      eventId: randomUUID(),
      actorSiteId: context.siteId,
      targetSiteId: context.siteId,
      actorUserId: context.userId,
      actorRole: context.role,
      actorOrganizationId: context.actorOrganizationId,
      clientOrganizationId: context.clientOrganizationId,
      mandateId: context.mandateId,
      action,
      resourceType: "msp_mandate",
      resourceId,
      decision: "allowed",
      reasonCode: "MSP_MANDATE_ALLOWED",
      beforeState,
      afterState,
      correlationId: context.correlationId,
      occurredAt: new Date(),
    },
    tx,
  );
}

const ACTIVE_RUN_STATUSES = [
  "pending",
  "starting",
  "running",
  "awaiting_approval",
] as const;

type RevocationRunTarget = {
  id: string;
  siteId: string;
  projectId: string | null;
  authorUserId: string;
  mandateId: string | null;
  operatorOrganizationId: string | null;
  clientOrganizationId: string | null;
};

async function cancelRevokedRuns(
  mandate: typeof mspMandates.$inferSelect,
  targets: RevocationRunTarget[],
) {
  for (const target of targets) {
    if (
      !target.mandateId ||
      !target.operatorOrganizationId ||
      !target.clientOrganizationId
    ) {
      continue;
    }
    const context: SiteRequestContext = {
      siteId: target.siteId,
      userId: target.authorUserId,
      role: "operator",
      actorOrganizationId: target.operatorOrganizationId,
      clientOrganizationId: target.clientOrganizationId,
      mandateId: target.mandateId,
      mandateProjectId: mandate.projectId,
      correlationId: `msp-revocation:${mandate.id}:${target.id}`,
    };
    try {
      const result = await cancelRun(context, target.id);
      // A run owned by this process is aborted asynchronously by the runner.
      // Close the product state here as well so a revoked authorization cannot
      // leave a visible active run while the stream unwinds.
      if (result.status === "stopping") {
        await failRun(context, target.id, "", "cancelled");
      }
    } catch (error) {
      // The mandate/assignment mutation remains committed. A terminal race is
      // harmless; other failures are retained in logs for operational follow-up.
      log.error("[msp-revocation] run cancellation failed", {
        mandateId: mandate.id,
        runId: target.id,
        ...describeError(error),
      });
    }
  }
}

export async function listSiteMandates(context: SiteRequestContext) {
  await assertSiteAction(context, "membership.manage");
  requireClientAdmin(context);
  return getDatabase()
    .select({
      id: mspMandates.id,
      operatorOrganizationId: mspMandates.operatorOrganizationId,
      clientOrganizationId: mspMandates.clientOrganizationId,
      siteId: mspMandates.siteId,
      projectId: mspMandates.projectId,
      startsAt: mspMandates.startsAt,
      expiresAt: mspMandates.expiresAt,
      revokedAt: mspMandates.revokedAt,
    })
    .from(mspMandates)
    .where(eq(mspMandates.siteId, context.siteId))
    .orderBy(asc(mspMandates.id));
}

export async function createSiteMandate(
  context: SiteRequestContext,
  input: MandateInput,
) {
  await assertSiteAction(context, "membership.manage");
  requireClientAdmin(context);
  const operatorOrganizationId = input.operatorOrganizationId.trim();
  if (!operatorOrganizationId) {
    throw new AuthError("L’organisation MSP est requise.", 400, "INVALID_INPUT");
  }
  const startsAt = parseDate(input.startsAt, "startsAt") ?? new Date();
  const expiresAt = parseDate(input.expiresAt, "expiresAt");
  if (expiresAt && expiresAt <= startsAt) {
    throw new AuthError("La date d’expiration doit suivre le début.", 400, "INVALID_INPUT");
  }

  const db = getDatabase();
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(
      hashtext('hermes-console-msp-mandate'), hashtext(${context.siteId})
    )`);
    const [operator] = await tx
      .select({ id: organizations.id, kind: organizations.kind })
      .from(organizations)
      .where(eq(organizations.id, operatorOrganizationId));
    if (!operator || operator.kind !== "msp") {
      throw new AuthError("L’organisation MSP est introuvable.", 404, "ORGANIZATION_NOT_FOUND");
    }
    if (input.projectId) {
      const [project] = await tx
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.id, input.projectId), eq(projects.siteId, context.siteId)));
      if (!project) throw new AuthError("Le projet est introuvable.", 404, "PROJECT_NOT_FOUND");
    }
    const id = `mandate_${randomUUID()}`;
    const [mandate] = await tx
      .insert(mspMandates)
      .values({
        id,
        operatorOrganizationId,
        clientOrganizationId: context.clientOrganizationId,
        siteId: context.siteId,
        projectId: input.projectId ?? null,
        startsAt,
        expiresAt,
      })
      .returning();
    if (!mandate) throw new AuthError("Le mandat n’a pas pu être créé.", 503, "MSP_MANDATE_UNAVAILABLE");
    await appendMandateAudit(tx, context, mandate.id, "msp_mandate.create", {}, {
      operatorOrganizationId: mandate.operatorOrganizationId,
      clientOrganizationId: mandate.clientOrganizationId,
      projectId: mandate.projectId,
      startsAt: mandate.startsAt.toISOString(),
      expiresAt: mandate.expiresAt?.toISOString() ?? null,
    });
    return mandate;
  });
}

export async function revokeSiteMandate(
  context: SiteRequestContext,
  mandateId: string,
) {
  await assertSiteAction(context, "membership.manage");
  requireClientAdmin(context);
  const result = await getDatabase().transaction(async (tx) => {
    const [mandate] = await tx
      .select()
      .from(mspMandates)
      .where(and(eq(mspMandates.id, mandateId), eq(mspMandates.siteId, context.siteId)))
      .for("update");
    if (!mandate) throw new AuthError("Le mandat est introuvable.", 404, "MSP_MANDATE_NOT_FOUND");
    if (mandate.revokedAt) return { mandate, targets: [] as RevocationRunTarget[] };
    const targets = await tx
      .select({
        id: runs.id,
        siteId: runs.siteId,
        projectId: runs.projectId,
        authorUserId: runs.authorUserId,
        mandateId: runs.mandateId,
        operatorOrganizationId: runs.operatorOrganizationId,
        clientOrganizationId: runs.clientOrganizationId,
      })
      .from(runs)
      .where(
        and(
          eq(runs.siteId, mandate.siteId),
          eq(runs.mandateId, mandate.id),
          inArray(runs.status, ACTIVE_RUN_STATUSES),
        ),
      );
    const revokedAt = new Date();
    const [updated] = await tx
      .update(mspMandates)
      .set({ revokedAt })
      .where(eq(mspMandates.id, mandate.id))
      .returning();
    await appendMandateAudit(tx, context, mandate.id, "msp_mandate.revoke", {
      revokedAt: null,
    }, { revokedAt: revokedAt.toISOString() });
    return { mandate: updated ?? { ...mandate, revokedAt }, targets };
  });
  await cancelRevokedRuns(result.mandate, result.targets);
  return result.mandate;
}

export async function assignSiteMandate(
  context: SiteRequestContext,
  mandateId: string,
  userId: string,
) {
  await assertSiteAction(context, "membership.manage");
  requireClientAdmin(context);
  return getDatabase().transaction(async (tx) => {
    const [mandate] = await tx
      .select()
      .from(mspMandates)
      .where(and(eq(mspMandates.id, mandateId), eq(mspMandates.siteId, context.siteId)))
      .for("update");
    if (!mandate) throw new AuthError("Le mandat est introuvable.", 404, "MSP_MANDATE_NOT_FOUND");
    if (mandate.revokedAt) throw new AuthError("Le mandat est révoqué.", 409, "MSP_MANDATE_REVOKED");
    const [user] = await tx.select({ id: consoleUsers.id }).from(consoleUsers).where(eq(consoleUsers.id, userId));
    if (!user) throw new AuthError("Le compte est introuvable.", 404, "MEMBERSHIP_USER_NOT_FOUND");
    const [orgMembership] = await tx
      .select({ userId: organizationMemberships.userId })
      .from(organizationMemberships)
      .where(and(
        eq(organizationMemberships.userId, userId),
        eq(organizationMemberships.organizationId, mandate.operatorOrganizationId),
      ));
    if (!orgMembership) throw new AuthError("Le compte n’appartient pas à l’organisation MSP.", 409, "MSP_ORGANIZATION_MEMBERSHIP_REQUIRED");
    const [siteMembership] = await tx
      .select({ role: siteMemberships.role, organizationId: siteMemberships.organizationId })
      .from(siteMemberships)
      .where(and(eq(siteMemberships.userId, userId), eq(siteMemberships.siteId, context.siteId)))
      .for("update");
    if (!siteMembership || siteMembership.role !== "operator" || siteMembership.organizationId !== mandate.operatorOrganizationId) {
      throw new AuthError("Le compte doit être opérateur MSP sur ce site.", 409, "MSP_OPERATOR_MEMBERSHIP_REQUIRED");
    }
    const [assignment] = await tx
      .insert(mspMandateAssignments)
      .values({ mandateId, userId, organizationId: mandate.operatorOrganizationId })
      .onConflictDoUpdate({
        target: [mspMandateAssignments.mandateId, mspMandateAssignments.userId],
        set: { revokedAt: null, expiresAt: null },
      })
      .returning();
    await appendMandateAudit(tx, context, mandateId, "msp_mandate.assignment.add", {}, {
      userId,
      operatorOrganizationId: mandate.operatorOrganizationId,
    });
    return assignment;
  });
}

export async function revokeSiteMandateAssignment(
  context: SiteRequestContext,
  mandateId: string,
  userId: string,
) {
  await assertSiteAction(context, "membership.manage");
  requireClientAdmin(context);
  const result = await getDatabase().transaction(async (tx) => {
    const [mandate] = await tx
      .select()
      .from(mspMandates)
      .where(and(eq(mspMandates.id, mandateId), eq(mspMandates.siteId, context.siteId)))
      .for("update");
    if (!mandate) throw new AuthError("Le mandat est introuvable.", 404, "MSP_MANDATE_NOT_FOUND");
    const targets = await tx
      .select({
        id: runs.id,
        siteId: runs.siteId,
        projectId: runs.projectId,
        authorUserId: runs.authorUserId,
        mandateId: runs.mandateId,
        operatorOrganizationId: runs.operatorOrganizationId,
        clientOrganizationId: runs.clientOrganizationId,
      })
      .from(runs)
      .where(
        and(
          eq(runs.siteId, mandate.siteId),
          eq(runs.mandateId, mandate.id),
          eq(runs.authorUserId, userId),
          inArray(runs.status, ACTIVE_RUN_STATUSES),
        ),
      );
    const [assignment] = await tx
      .update(mspMandateAssignments)
      .set({ revokedAt: new Date() })
      .where(and(eq(mspMandateAssignments.mandateId, mandateId), eq(mspMandateAssignments.userId, userId), isNull(mspMandateAssignments.revokedAt)))
      .returning();
    if (!assignment) throw new AuthError("L’affectation est introuvable.", 404, "MSP_ASSIGNMENT_NOT_FOUND");
    await appendMandateAudit(tx, context, mandateId, "msp_mandate.assignment.revoke", {
      userId,
      revokedAt: null,
    }, { userId, revokedAt: assignment.revokedAt?.toISOString() ?? null });
    return { assignment, mandate, targets };
  });
  await cancelRevokedRuns(result.mandate, result.targets);
  return result.assignment;
}
