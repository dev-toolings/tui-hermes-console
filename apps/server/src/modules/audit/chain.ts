import { createHmac, timingSafeEqual } from "node:crypto";
import type { AuditDecision, SiteMembershipRole } from "@/db/schema";

const AUDIT_HMAC_DOMAIN = "hermes-console/audit-ledger/v1\0";

export type AuditJsonValue =
  | null
  | boolean
  | number
  | string
  | AuditJsonValue[]
  | { [key: string]: AuditJsonValue };

export interface AuditHashPayload {
  eventId: string;
  actorSiteId: string;
  targetSiteId: string;
  actorUserId: string;
  actorRole: SiteMembershipRole;
  action: string;
  resourceType: string;
  resourceId: string;
  decision: AuditDecision;
  reasonCode: string;
  beforeState: AuditJsonValue;
  afterState: AuditJsonValue;
  correlationId: string;
  occurredAt: string;
  recordedAt: string;
  sequence: number;
  previousHash: string | null;
}

export interface AuditChainEntry extends AuditHashPayload {
  entryHash: string;
}

export class AuditIntegrityError extends Error {
  constructor(
    readonly code:
      | "APP_ENCRYPTION_KEY_MISSING"
      | "AUDIT_JSON_INVALID"
      | "AUDIT_CHAIN_INTEGRITY_FAILED",
    message: string,
  ) {
    super(message);
    this.name = "AuditIntegrityError";
  }
}

export function resolveAuditHmacKey(key = process.env.APP_ENCRYPTION_KEY): string {
  if (!key || key.trim() === "") {
    throw new AuditIntegrityError(
      "APP_ENCRYPTION_KEY_MISSING",
      "APP_ENCRYPTION_KEY_MISSING",
    );
  }
  return key;
}

export function canonicalizeAuditValue(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) invalidJson();
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalizeAuditValue).join(",")}]`;
  }
  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) invalidJson();
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => {
        if (object[key] === undefined) invalidJson();
        return `${JSON.stringify(key)}:${canonicalizeAuditValue(object[key])}`;
      })
      .join(",")}}`;
  }
  invalidJson();
}

export function computeAuditEntryHash(
  payload: AuditHashPayload,
  key?: string,
): string {
  const hmacKey = resolveAuditHmacKey(key);
  return createHmac("sha256", hmacKey)
    .update(AUDIT_HMAC_DOMAIN, "utf8")
    .update(canonicalizeAuditValue(payload), "utf8")
    .digest("hex");
}

export function assertAuditChain(
  entries: readonly AuditChainEntry[],
  key?: string,
): void {
  const hmacKey = resolveAuditHmacKey(key);
  let previousHash: string | null = null;
  let targetSiteId: string | undefined;

  for (const [index, entry] of entries.entries()) {
    if (
      entry.sequence !== index + 1 ||
      entry.previousHash !== previousHash ||
      (targetSiteId !== undefined && entry.targetSiteId !== targetSiteId)
    ) {
      chainFailure();
    }
    const expected = computeAuditEntryHash(withoutEntryHash(entry), hmacKey);
    if (!hashesEqual(expected, entry.entryHash)) chainFailure();
    previousHash = entry.entryHash;
    targetSiteId = entry.targetSiteId;
  }
}

export function assertAuditEntryHash(entry: AuditChainEntry, key?: string): void {
  const expected = computeAuditEntryHash(withoutEntryHash(entry), key);
  if (!hashesEqual(expected, entry.entryHash)) chainFailure();
}

function withoutEntryHash(entry: AuditChainEntry): AuditHashPayload {
  const { entryHash: _entryHash, ...payload } = entry;
  return payload;
}

function hashesEqual(left: string, right: string): boolean {
  if (!/^[0-9a-f]{64}$/.test(left) || !/^[0-9a-f]{64}$/.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

function invalidJson(): never {
  throw new AuditIntegrityError(
    "AUDIT_JSON_INVALID",
    "Les états d’audit doivent être des valeurs JSON canoniques.",
  );
}

function chainFailure(): never {
  throw new AuditIntegrityError(
    "AUDIT_CHAIN_INTEGRITY_FAILED",
    "AUDIT_CHAIN_INTEGRITY_FAILED",
  );
}
