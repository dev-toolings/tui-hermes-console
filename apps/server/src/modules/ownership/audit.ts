import { randomUUID } from "node:crypto";
import {
  appendAuditEntryInTransaction,
  type AuditTransaction,
} from "@/modules/audit/service";
import type { SiteRequestContext } from "@/modules/auth/service";

export async function auditOwnershipCreation(
  tx: AuditTransaction,
  context: SiteRequestContext,
  resource: {
    resourceType: "agent" | "connector" | "thread" | "run" | "artifact";
    resourceId: string;
    projectId: string | null;
    ownerUserId: string;
    authorUserId: string;
  },
  options: { reasonCode?: string } = {},
) {
  await appendAuditEntryInTransaction({
    eventId: randomUUID(),
    actorSiteId: context.siteId,
    targetSiteId: context.siteId,
    actorUserId: context.userId,
    actorRole: context.role,
    action: "ownership.create",
    resourceType: resource.resourceType,
    resourceId: resource.resourceId,
    decision: "allowed",
    reasonCode: options.reasonCode ?? "RESOURCE_CREATED",
    beforeState: {},
    afterState: {
      siteId: context.siteId,
      projectId: resource.projectId,
      ownerUserId: resource.ownerUserId,
      authorUserId: resource.authorUserId,
    },
    correlationId: context.correlationId,
    occurredAt: new Date(),
  }, tx);
}
