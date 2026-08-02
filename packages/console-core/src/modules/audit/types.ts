export type AuditDecision = "allowed" | "denied";

/** Entrée publique de `GET /api/audit`, sérialisée pour la Console. */
export type AuditEntryDto = {
  id: number;
  eventId: string;
  actorSiteId: string;
  targetSiteId: string;
  actorUserId: string;
  actorRole: string;
  actorOrganizationId: string | null;
  clientOrganizationId: string | null;
  mandateId: string | null;
  envelopeVersion: number;
  action: string;
  resourceType: string;
  resourceId: string;
  decision: AuditDecision;
  reasonCode: string;
  beforeState: unknown;
  afterState: unknown;
  correlationId: string;
  occurredAt: string;
  recordedAt: string;
  sequence: number;
  previousHash: string | null;
  entryHash: string;
};
