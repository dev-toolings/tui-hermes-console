import { expect, mock, test } from "bun:test";
import { auditScopedMiss } from "./site-access";

const context = {
  siteId: "paris",
  userId: "usr_operator",
  role: "operator" as const,
  correlationId: "req_123",
};

test("audits every scoped miss in the actor ledger without resolving another site", async () => {
  const append = mock(async (_input: unknown) => undefined);
  await auditScopedMiss(context, {
    action: "thread.read",
    resourceType: "thread",
    resourceId: "thr_unknown",
  }, { append });

  expect(append).toHaveBeenCalledTimes(1);
  expect(append.mock.calls[0]![0]).toMatchObject({
    actorSiteId: "paris",
    targetSiteId: "paris",
    actorUserId: "usr_operator",
    actorRole: "operator",
    decision: "denied",
    reasonCode: "RESOURCE_NOT_FOUND_OR_OUT_OF_SCOPE",
    resourceType: "thread",
    resourceId: "sha256:eca31c471979e2ee9c6ef2dd8a5edd1b7fb19c047b75d400b0ca1227cbd86c9c",
    correlationId: "req_123",
    beforeState: {},
    afterState: {},
  });
});

test("fails closed when the denial cannot be persisted", async () => {
  await expect(
    auditScopedMiss(
      context,
      { action: "run.cancel", resourceType: "run", resourceId: "run_x" },
      { append: async () => { throw new Error("ledger down"); } },
    ),
  ).rejects.toMatchObject({ code: "AUDIT_UNAVAILABLE", status: 503 });
});
