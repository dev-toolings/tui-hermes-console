import { describe, expect, test } from "bun:test";
import type { AuditEntryDto } from "@console/core/modules/audit/types";
import { matchesAuditSearch } from "./audit";

const entry = (overrides: Partial<AuditEntryDto> = {}): AuditEntryDto => ({
  id: 7,
  eventId: "evt_7",
  actorSiteId: "site_paris",
  targetSiteId: "site_paris",
  actorUserId: "usr_auditor",
  actorRole: "auditor",
  actorOrganizationId: null,
  clientOrganizationId: null,
  mandateId: null,
  envelopeVersion: 2,
  action: "run.approve",
  resourceType: "run",
  resourceId: "run_42",
  decision: "allowed",
  reasonCode: "APPROVAL_RECORDED",
  beforeState: {},
  afterState: { approved: true },
  correlationId: "req_42",
  occurredAt: "2026-08-02T12:00:00.000Z",
  recordedAt: "2026-08-02T12:00:01.000Z",
  sequence: 7,
  previousHash: "a".repeat(64),
  entryHash: "b".repeat(64),
  ...overrides,
});

describe("audit journal filters", () => {
  test("combines decision and resource filters", () => {
    expect(matchesAuditSearch(entry(), { decision: "allowed", resource: "run" })).toBe(true);
    expect(matchesAuditSearch(entry(), { decision: "denied" })).toBe(false);
    expect(matchesAuditSearch(entry(), { resource: "agent" })).toBe(false);
  });

  test("searches action, actor, reason, resource and correlation", () => {
    expect(matchesAuditSearch(entry(), { q: "approve" })).toBe(true);
    expect(matchesAuditSearch(entry(), { q: "usr_auditor" })).toBe(true);
    expect(matchesAuditSearch(entry(), { q: "APPROVAL_RECORDED" })).toBe(true);
    expect(matchesAuditSearch(entry(), { q: "req_42" })).toBe(true);
    expect(matchesAuditSearch(entry(), { q: "missing" })).toBe(false);
  });
});
