import { randomUUID } from "node:crypto";
import { and, asc, count, eq, sql } from "drizzle-orm";
import { getDatabase } from "@/db/client";
import {
  agents,
  artifacts,
  connectors,
  consoleSessions,
  consoleUsers,
  organizationMemberships,
  runs,
  siteMemberships,
  threads,
  type SiteMembershipRole,
} from "@/db/schema";
import { appendAuditEntryInTransaction } from "@/modules/audit/service";
import { assertSiteAction } from "./site-authorization";
import { AuthError, type SiteRequestContext } from "./service";

type MembershipResult = {
  userId: string;
  siteId: string;
  role: SiteMembershipRole;
};

type MembershipTransactionResult =
  | { membership: MembershipResult; error?: never }
  | { membership?: never; error: AuthError };

export async function setSiteMembershipRole(
  context: SiteRequestContext,
  targetUserId: string,
  role: SiteMembershipRole,
): Promise<MembershipResult> {
  await assertSiteAction(context, "membership.manage");
  const db = getDatabase();
  const result = await db.transaction<MembershipTransactionResult>(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(
        hashtext('hermes-console-site-membership'),
        hashtext(${context.siteId})
      )`,
    );

    const [actorMembership] = await tx
      .select({
        role: siteMemberships.role,
        organizationId: siteMemberships.organizationId,
      })
      .from(siteMemberships)
      .where(
        and(
          eq(siteMemberships.userId, context.userId),
          eq(siteMemberships.siteId, context.siteId),
        ),
      )
      .for("update");

    if (
      !actorMembership ||
      actorMembership.role !== "admin" ||
      actorMembership.organizationId !== context.clientOrganizationId
    ) {
      if (!actorMembership) {
        throw new AuthError(
          "Le contrôle du rôle courant n’est plus disponible.",
          503,
          "SITE_MEMBERSHIP_UNAVAILABLE",
        );
      }
      await appendMembershipAudit(tx, {
        context: { ...context, role: actorMembership.role },
        targetUserId,
        decision: "denied",
        reasonCode: "ROLE_PERMISSION_DENIED",
        beforeRole: actorMembership.role,
        afterRole: actorMembership.role,
      });
      return {
        error: new AuthError(
          "Cette action n’est pas autorisée pour ce rôle.",
          403,
          "SITE_PERMISSION_DENIED",
        ),
      };
    }

    if (targetUserId === context.userId) {
      await appendMembershipAudit(tx, {
        context,
        targetUserId,
        decision: "denied",
        reasonCode: "SELF_ROLE_CHANGE_FORBIDDEN",
        beforeRole: actorMembership.role,
        afterRole: actorMembership.role,
      });
      return {
        error: new AuthError(
          "Un membre ne peut pas modifier son propre rôle.",
          403,
          "SELF_ROLE_CHANGE_FORBIDDEN",
        ),
      };
    }

    const [targetUser] = await tx
      .select({ id: consoleUsers.id })
      .from(consoleUsers)
      .where(eq(consoleUsers.id, targetUserId))
      .limit(1);
    const [existing] = await tx
      .select({
        role: siteMemberships.role,
        organizationId: siteMemberships.organizationId,
      })
      .from(siteMemberships)
      .where(
        and(
          eq(siteMemberships.userId, targetUserId),
          eq(siteMemberships.siteId, context.siteId),
        ),
      )
      .limit(1);

    if (!targetUser) {
      await appendMembershipAudit(tx, {
        context,
        targetUserId,
        decision: "denied",
        reasonCode: "MEMBERSHIP_USER_NOT_FOUND",
        beforeRole: existing?.role ?? null,
        afterRole: existing?.role ?? null,
      });
      return {
        error: new AuthError(
          "Le compte à rattacher est introuvable.",
          404,
          "MEMBERSHIP_USER_NOT_FOUND",
        ),
      };
    }

    if (role === "operator" && existing?.role !== "operator") {
      await appendMembershipAudit(tx, {
        context,
        targetUserId,
        decision: "denied",
        reasonCode: "MSP_ASSIGNMENT_REQUIRED",
        beforeRole: existing?.role ?? null,
        afterRole: existing?.role ?? null,
      });
      return {
        error: new AuthError(
          "Un opérateur MSP doit être affilié à une organisation, un mandat et une affectation explicites.",
          409,
          "MSP_ASSIGNMENT_REQUIRED",
        ),
      };
    }

    if (existing?.role === "admin" && role !== "admin") {
      const [{ value: adminCount }] = await tx
        .select({ value: count() })
        .from(siteMemberships)
        .where(
          and(
            eq(siteMemberships.siteId, context.siteId),
            eq(siteMemberships.role, "admin"),
          ),
        );
      if (adminCount <= 1) {
        await appendMembershipAudit(tx, {
          context,
          targetUserId,
          decision: "denied",
          reasonCode: "LAST_SITE_ADMIN_REQUIRED",
          beforeRole: existing.role,
          afterRole: existing.role,
        });
        return {
          error: new AuthError(
            "Le site doit conserver au moins un administrateur.",
            409,
            "LAST_SITE_ADMIN_REQUIRED",
          ),
        };
      }
    }

    if (existing && (role === "approver" || role === "auditor")) {
      const ownershipRows = await tx.execute<{ owns_resources: boolean }>(sql`
        SELECT EXISTS (
          SELECT 1 FROM ${agents}
          WHERE ${agents.siteId} = ${context.siteId}
            AND ${agents.ownerUserId} = ${targetUserId}
          UNION ALL
          SELECT 1 FROM ${connectors}
          WHERE ${connectors.siteId} = ${context.siteId}
            AND ${connectors.ownerUserId} = ${targetUserId}
          UNION ALL
          SELECT 1 FROM ${threads}
          WHERE ${threads.siteId} = ${context.siteId}
            AND ${threads.ownerUserId} = ${targetUserId}
          UNION ALL
          SELECT 1 FROM ${runs}
          WHERE ${runs.siteId} = ${context.siteId}
            AND ${runs.ownerUserId} = ${targetUserId}
          UNION ALL
          SELECT 1 FROM ${artifacts}
          WHERE ${artifacts.siteId} = ${context.siteId}
            AND ${artifacts.ownerUserId} = ${targetUserId}
        ) AS owns_resources
      `);
      if (ownershipRows[0]?.owns_resources) {
        await appendMembershipAudit(tx, {
          context,
          targetUserId,
          decision: "denied",
          reasonCode: "OWNED_RESOURCES_REQUIRE_TRANSFER",
          beforeRole: existing.role,
          afterRole: existing.role,
        });
        return {
          error: new AuthError(
            "Transférez les ressources possédées avant de modifier ce rôle.",
            409,
            "OWNED_RESOURCES_REQUIRE_TRANSFER",
          ),
        };
      }
    }

    const organizationId = role === "operator"
      ? existing!.organizationId
      : context.clientOrganizationId;
    await tx
      .insert(organizationMemberships)
      .values({ userId: targetUserId, organizationId })
      .onConflictDoNothing();
    const [membership] = await tx
      .insert(siteMemberships)
      .values({
        userId: targetUserId,
        siteId: context.siteId,
        organizationId,
        role,
      })
      .onConflictDoUpdate({
        target: [siteMemberships.userId, siteMemberships.siteId],
        set: { role, organizationId, updatedAt: new Date() },
      })
      .returning({
        userId: siteMemberships.userId,
        siteId: siteMemberships.siteId,
        role: siteMemberships.role,
      });
    if (!membership) {
      throw new AuthError(
        "Le rôle n’a pas pu être enregistré.",
        503,
        "SITE_MEMBERSHIP_UNAVAILABLE",
      );
    }

    if (existing?.role === "operator" && role !== "operator") {
      await tx
        .update(consoleSessions)
        .set({ mandateId: null })
        .where(and(
          eq(consoleSessions.userId, targetUserId),
          eq(consoleSessions.siteId, context.siteId),
        ));
    }

    await appendMembershipAudit(tx, {
      context,
      targetUserId,
      decision: "allowed",
      reasonCode: "SITE_ROLE_ASSIGNED",
      beforeRole: existing?.role ?? null,
      afterRole: membership.role,
    });
    return { membership };
  });

  if (result.error) throw result.error;
  return result.membership;
}

export async function listSiteMemberships(context: SiteRequestContext) {
  await assertSiteAction(context, "membership.manage");
  return getDatabase()
    .select({
      userId: siteMemberships.userId,
      email: consoleUsers.email,
      name: consoleUsers.displayName,
      role: siteMemberships.role,
      organizationId: siteMemberships.organizationId,
    })
    .from(siteMemberships)
    .innerJoin(consoleUsers, eq(consoleUsers.id, siteMemberships.userId))
    .where(eq(siteMemberships.siteId, context.siteId))
    .orderBy(asc(consoleUsers.email), asc(siteMemberships.userId));
}

async function appendMembershipAudit(
  tx: Parameters<typeof appendAuditEntryInTransaction>[1],
  input: {
    context: SiteRequestContext;
    targetUserId: string;
    decision: "allowed" | "denied";
    reasonCode: string;
    beforeRole: SiteMembershipRole | null;
    afterRole: SiteMembershipRole | null;
  },
) {
  return appendAuditEntryInTransaction(
    {
      eventId: randomUUID(),
      actorSiteId: input.context.siteId,
      targetSiteId: input.context.siteId,
      actorUserId: input.context.userId,
      actorRole: input.context.role,
      actorOrganizationId: input.context.actorOrganizationId,
      clientOrganizationId: input.context.clientOrganizationId,
      mandateId: input.context.mandateId,
      action: "membership.manage",
      resourceType: "site_membership",
      resourceId: input.targetUserId,
      decision: input.decision,
      reasonCode: input.reasonCode,
      beforeState: { role: input.beforeRole },
      afterState: { role: input.afterRole },
      correlationId: input.context.correlationId,
      occurredAt: new Date(),
    },
    tx,
  );
}
