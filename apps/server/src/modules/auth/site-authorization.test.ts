import { describe, expect, mock, test } from "bun:test";
import type { SiteMembershipRole } from "@/db/schema";
import {
  SITE_ACTIONS,
  SITE_ROLE_MATRIX_VERSION,
  assertSiteAction,
  canPerformSiteAction,
  type SiteAction,
} from "./site-authorization";

const context = (role: SiteMembershipRole) => ({
  siteId: "paris",
  userId: `usr_${role}`,
  role,
  correlationId: `req_${role}`,
});

const readActions: SiteAction[] = [
  "agent.read",
  "connector.read",
  "thread.read",
  "thread.events.read",
  "run.read",
  "artifact.read",
  "storage.read",
];

describe("site role permission matrix", () => {
  test("assigns every current action to the five roles without broadening specialized roles", () => {
    expect(SITE_ROLE_MATRIX_VERSION).toBe("2026-08-01.us-g2-003.v1");
    expect(SITE_ACTIONS).toHaveLength(26);

    for (const action of SITE_ACTIONS) {
      expect(canPerformSiteAction("admin", action)).toBe(true);
    }
    for (const role of ["operator", "auditor"] as const) {
      for (const action of readActions) {
        expect(canPerformSiteAction(role, action)).toBe(true);
      }
    }

    expect(canPerformSiteAction("operator", "thread.create")).toBe(true);
    expect(canPerformSiteAction("operator", "thread.delete")).toBe(true);
    expect(canPerformSiteAction("operator", "run.cancel")).toBe(true);
    expect(canPerformSiteAction("operator", "run.retry")).toBe(true);
    expect(canPerformSiteAction("operator", "thread.agent.switch")).toBe(true);
    expect(canPerformSiteAction("operator", "ownership.transfer")).toBe(true);
    expect(canPerformSiteAction("operator", "run.approve")).toBe(false);
    expect(canPerformSiteAction("operator", "agent.create")).toBe(false);

    expect(canPerformSiteAction("requester", "thread.create")).toBe(true);
    expect(canPerformSiteAction("requester", "agent.read")).toBe(true);
    expect(canPerformSiteAction("requester", "connector.read")).toBe(true);
    expect(canPerformSiteAction("requester", "thread.read")).toBe(true);
    expect(canPerformSiteAction("requester", "thread.message")).toBe(true);
    expect(canPerformSiteAction("requester", "artifact.create")).toBe(true);
    expect(canPerformSiteAction("requester", "thread.command")).toBe(true);
    expect(canPerformSiteAction("requester", "thread.agent.switch")).toBe(false);
    expect(canPerformSiteAction("requester", "thread.delete")).toBe(false);
    expect(canPerformSiteAction("requester", "run.cancel")).toBe(false);

    expect(canPerformSiteAction("approver", "run.approve")).toBe(true);
    expect(canPerformSiteAction("approver", "run.read")).toBe(true);
    expect(canPerformSiteAction("approver", "artifact.read")).toBe(true);
    expect(canPerformSiteAction("approver", "agent.read")).toBe(false);
    expect(canPerformSiteAction("approver", "connector.read")).toBe(false);
    expect(canPerformSiteAction("approver", "storage.read")).toBe(false);
    expect(canPerformSiteAction("approver", "run.cancel")).toBe(false);
    expect(canPerformSiteAction("approver", "thread.message")).toBe(false);

    expect(canPerformSiteAction("auditor", "artifact.read")).toBe(true);
    expect(canPerformSiteAction("auditor", "thread.command")).toBe(true);
    expect(canPerformSiteAction("auditor", "audit.read")).toBe(true);
    expect(canPerformSiteAction("auditor", "audit.export")).toBe(true);
    expect(canPerformSiteAction("auditor", "artifact.create")).toBe(false);
    expect(canPerformSiteAction("auditor", "run.approve")).toBe(false);
    expect(canPerformSiteAction("operator", "audit.read")).toBe(false);
    expect(canPerformSiteAction("requester", "membership.manage")).toBe(false);
    expect(canPerformSiteAction("admin", "membership.manage")).toBe(true);
  });

  test("returns one stable denial and attributes the immutable actor role", async () => {
    const append = mock(async (_input: unknown) => undefined);

    await expect(
      assertSiteAction(context("requester"), "agent.create", { append }),
    ).rejects.toMatchObject({
      status: 403,
      code: "SITE_PERMISSION_DENIED",
      message: "Cette action n’est pas autorisée pour ce rôle.",
    });

    expect(append).toHaveBeenCalledTimes(1);
    expect(append.mock.calls[0]![0]).toMatchObject({
      actorSiteId: "paris",
      targetSiteId: "paris",
      actorUserId: "usr_requester",
      actorRole: "requester",
      action: "agent.create",
      resourceType: "site_authorization",
      resourceId: "paris",
      decision: "denied",
      reasonCode: "ROLE_PERMISSION_DENIED",
      beforeState: {
        role: "requester",
        matrixVersion: "2026-08-01.us-g2-003.v1",
      },
      afterState: {
        role: "requester",
        matrixVersion: "2026-08-01.us-g2-003.v1",
      },
      correlationId: "req_requester",
    });
  });

  test("does not touch the ledger for allowed actions and fails closed if denial audit fails", async () => {
    const append = mock(async (_input: unknown) => undefined);
    await expect(
      assertSiteAction(context("approver"), "run.approve", { append }),
    ).resolves.toBeUndefined();
    expect(append).not.toHaveBeenCalled();

    await expect(
      assertSiteAction(context("auditor"), "thread.delete", {
        append: async () => {
          throw new Error("ledger down");
        },
      }),
    ).rejects.toMatchObject({ status: 503, code: "AUDIT_UNAVAILABLE" });
  });
});
