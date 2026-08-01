import { createHash, randomUUID } from "node:crypto";
import { appendAuditEntry } from "@/modules/audit/service";
import { AuthError, type SiteRequestContext } from "./service";

type ScopedMiss = {
  action: string;
  resourceType: string;
  resourceId: string;
};

type Dependencies = {
  append?: (input: Parameters<typeof appendAuditEntry>[0]) => Promise<unknown>;
};

/**
 * Audite un miss scopé sans jamais chercher le propriétaire réel de l'id.
 * Ressource absente et ressource d'un autre site suivent la même branche
 * applicative, la même réponse et la même forme de ledger. La latence n'est
 * pas supposée constante et doit être mesurée séparément.
 */
export async function auditScopedMiss(
  context: SiteRequestContext,
  miss: ScopedMiss,
  dependencies: Dependencies = {},
) {
  const resourceFingerprint = `sha256:${createHash("sha256")
    .update(miss.resourceId.slice(0, 512))
    .digest("hex")}`;
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
      action: miss.action,
      resourceType: miss.resourceType,
      resourceId: resourceFingerprint,
      decision: "denied",
      reasonCode: "RESOURCE_NOT_FOUND_OR_OUT_OF_SCOPE",
      beforeState: {},
      afterState: {},
      correlationId: context.correlationId,
      occurredAt: new Date(),
    });
  } catch (error) {
    console.error("Scoped denial audit failed", {
      siteId: context.siteId,
      resourceType: miss.resourceType,
      correlationId: context.correlationId,
      error,
    });
    throw new AuthError(
      "Le refus d’accès n’a pas pu être inscrit dans le journal d’audit.",
      503,
      "AUDIT_UNAVAILABLE",
    );
  }
}
