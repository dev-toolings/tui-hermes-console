import { randomUUID } from "node:crypto";
import type { SiteMembershipRole } from "@/db/schema";
import { appendAuditEntry } from "@/modules/audit/service";
import { AuthError, type SiteRequestContext } from "./service";

export const SITE_ROLE_MATRIX_VERSION = "2026-08-01.us-g1-006e.v1";

export const SITE_ACTIONS = [
  "agent.read",
  "agent.create",
  "agent.update",
  "agent.delete",
  "connector.read",
  "connector.upsert",
  "connector.delete",
  "connector.test",
  "thread.read",
  "thread.create",
  "thread.delete",
  "thread.message",
  "thread.command",
  "thread.agent.switch",
  "thread.events.read",
  "run.read",
  "run.cancel",
  "run.retry",
  "run.approve",
  "artifact.read",
  "artifact.create",
  "storage.read",
  "membership.manage",
  "audit.read",
  "audit.export",
  "data.lifecycle.read",
  "data.lifecycle.manage",
  "data.lifecycle.preview",
  "data.lifecycle.export",
  "data.lifecycle.purge",
  "ownership.transfer",
] as const;

export type SiteAction = (typeof SITE_ACTIONS)[number];

const READ_ACTIONS: readonly SiteAction[] = [
  "agent.read",
  "connector.read",
  "thread.read",
  "thread.command",
  "thread.events.read",
  "run.read",
  "artifact.read",
  "storage.read",
];

const REQUEST_ACTIONS: readonly SiteAction[] = [
  "thread.create",
  "thread.message",
  "artifact.create",
];

const EXECUTION_ACTIONS: readonly SiteAction[] = [
  ...REQUEST_ACTIONS,
  "thread.delete",
  "run.cancel",
  "run.retry",
];

export const SITE_ROLE_PERMISSIONS: Readonly<
  Record<SiteMembershipRole, ReadonlySet<SiteAction>>
> = {
  admin: new Set(SITE_ACTIONS),
  operator: new Set([
    ...READ_ACTIONS,
    ...EXECUTION_ACTIONS,
    "thread.agent.switch",
    "ownership.transfer",
  ]),
  // Les repositories appliquent un prédicat owner_user_id pour chacune de ces
  // actions. Les ajouter ici n'accorde donc jamais une lecture site-wide.
  requester: new Set([
    "agent.read",
    "connector.read",
    "thread.read",
    "thread.create",
    "thread.message",
    "thread.command",
    "thread.events.read",
    "run.read",
    "artifact.read",
    "artifact.create",
  ]),
  approver: new Set([
    "thread.read",
    "thread.command",
    "thread.events.read",
    "run.read",
    "artifact.read",
    "run.approve",
  ]),
  auditor: new Set([
    ...READ_ACTIONS,
    "audit.read",
    "audit.export",
    "data.lifecycle.read",
    "data.lifecycle.preview",
    "data.lifecycle.export",
  ]),
};

export function canPerformSiteAction(
  role: SiteMembershipRole,
  action: SiteAction,
) {
  return SITE_ROLE_PERMISSIONS[role].has(action);
}

export function siteCapabilitiesForRole(role: SiteMembershipRole): SiteAction[] {
  return SITE_ACTIONS.filter((action) => canPerformSiteAction(role, action));
}

type AuthorizationDependencies = {
  append?: (input: Parameters<typeof appendAuditEntry>[0]) => Promise<unknown>;
};

type SiteDenial = {
  action: string;
  resourceType: string;
  resourceId: string;
  reasonCode: string;
  state: Record<string, string | number | boolean | null>;
  error: { message: string; status: number; code: string };
};

/**
 * Aucun rôle d'administration de l'installation n'existe encore. Le refus est
 * donc inscrit dans le ledger du site acteur, sans prétendre qu'il s'agit du
 * ledger d'une ressource globale.
 */
export function denyInstallationAccess(
  context: SiteRequestContext,
  method: string,
  routePath: string,
  dependencies: AuthorizationDependencies = {},
) {
  return denySiteAction(
    context,
    {
      action: "installation.access",
      resourceType: "installation_route",
      resourceId: `${method.toUpperCase()} ${routePath}`,
      reasonCode: "INSTALLATION_ADMIN_REQUIRED",
      state: { role: context.role },
      error: {
        message: "Une autorisation d’administration de l’installation est requise.",
        status: 403,
        code: "INSTALLATION_ADMIN_REQUIRED",
      },
    },
    dependencies,
  );
}

export async function assertSiteAction(
  context: SiteRequestContext,
  action: SiteAction,
  dependencies: AuthorizationDependencies = {},
) {
  if (canPerformSiteAction(context.role, action)) return;
  return denySiteAction(
    context,
    {
      action,
      resourceType: "site_authorization",
      resourceId: context.siteId,
      reasonCode: "ROLE_PERMISSION_DENIED",
      state: {
        role: context.role,
        matrixVersion: SITE_ROLE_MATRIX_VERSION,
      },
      error: {
        message: "Cette action n’est pas autorisée pour ce rôle.",
        status: 403,
        code: "SITE_PERMISSION_DENIED",
      },
    },
    dependencies,
  );
}

export async function denySiteAction(
  context: SiteRequestContext,
  denial: SiteDenial,
  dependencies: AuthorizationDependencies = {},
): Promise<never> {
  try {
    await (dependencies.append ?? appendAuditEntry)({
      eventId: randomUUID(),
      actorSiteId: context.siteId,
      targetSiteId: context.siteId,
      actorUserId: context.userId,
      actorRole: context.role,
      actorOrganizationId: context.actorOrganizationId,
      clientOrganizationId: context.clientOrganizationId,
      mandateId: context.mandateId,
      action: denial.action,
      resourceType: denial.resourceType,
      resourceId: denial.resourceId,
      decision: "denied",
      reasonCode: denial.reasonCode,
      beforeState: denial.state,
      afterState: denial.state,
      correlationId: context.correlationId,
      occurredAt: new Date(),
    });
  } catch (error) {
    console.error("Role denial audit failed", {
      siteId: context.siteId,
      action: denial.action,
      correlationId: context.correlationId,
      error,
    });
    throw new AuthError(
      "Le refus d’accès n’a pas pu être inscrit dans le journal d’audit.",
      503,
      "AUDIT_UNAVAILABLE",
    );
  }

  throw new AuthError(
    denial.error.message,
    denial.error.status,
    denial.error.code,
  );
}
