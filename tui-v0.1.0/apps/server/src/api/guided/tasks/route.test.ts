import { describe, expect, mock, test } from "bun:test";
import type { AuthenticatedRouteContext } from "@/modules/api/route-context";

const validCursor = "eyJ1cGRhdGVkQXQiOiIyMDI2LTA4LTA5VDEwOjAwOjAwLjAwMFoiLCJpZCI6InRhc2tfMSJ9";

const listGuidedTaskSummaries = mock(async () => ({
  tasks: [
    {
      id: "task_1",
      title: "Réparer le formulaire",
      status: "ready",
      projectName: "Portail Acme",
      currentRevision: {
        id: "revision_2",
        state: "validated",
        requiresTechnicalApproval: false,
      },
      latestAttempt: { id: "attempt_2", revisionId: "revision_2", status: "awaiting_functional_validation", error: "SENTINEL_STDERR_SECRET" },
      decisions: [{ kind: "tool", outcome: "approved", attemptId: null }],
      updatedAt: "2026-08-09T10:00:00.000Z",
      revisionContent: "ne doit jamais sortir",
      evidence: [{ payload: "ne doit jamais sortir" }],
      hermesOutput: "ne doit jamais sortir",
      repositoryPath: "/srv/private",
      baseCommit: "deadbeef",
      branchName: "private-branch",
      sandbox: { id: "private-sandbox" },
      hermesSessionId: "private-session",
      actorUserId: "private-actor",
      idempotencyKey: "private-key",
    },
  ],
  page: { hasMore: true, nextCursor: "opaque-next-cursor" },
}));

mock.module("@/modules/guided-task/repository", () => ({
  createGuidedTask: mock(async () => ({ id: "created" })),
  listGuidedTasks: mock(async () => []),
  listGuidedTaskSummaries,
  GuidedTaskRepositoryError: class GuidedTaskRepositoryError extends Error {},
}));

const { GET } = await import("./route");

const context: AuthenticatedRouteContext = {
  params: Promise.resolve({}),
  siteContext: {
    siteId: "site-test",
    userId: "user-test",
    role: "admin",
    actorOrganizationId: "org-test",
    clientOrganizationId: "org-test",
    mandateId: "mandate-test",
    mandateProjectId: "project-test",
    correlationId: "correlation-test",
  },
};

describe("GET /api/guided/tasks summary contract", () => {
  test("parses a bounded limit and opaque cursor, and returns the paginated minimal DTO", async () => {
    listGuidedTaskSummaries.mockClear();

    const response = await GET(
      new Request(`http://console.test/api/guided/tasks?limit=999&cursor=${validCursor}`),
      context,
    );

    expect(response.status).toBe(200);
    expect(listGuidedTaskSummaries).toHaveBeenCalledWith(context.siteContext, {
      limit: 100,
      cursor: validCursor,
    });
    await expect(response.json()).resolves.toEqual({
      tasks: [
        {
          id: "task_1",
          title: "Réparer le formulaire",
          status: "ready",
          projectName: "Portail Acme",
          currentRevision: {
            id: "revision_2",
            state: "validated",
            requiresTechnicalApproval: false,
          },
          latestAttempt: { id: "attempt_2", revisionId: "revision_2", status: "awaiting_functional_validation" },
          decisions: [{ kind: "tool", outcome: "approved", attemptId: null }],
          updatedAt: "2026-08-09T10:00:00.000Z",
        },
      ],
      page: { hasMore: true, nextCursor: "opaque-next-cursor" },
    });
  });

  test("never serializes a raw attempt error", async () => {
    const response = await GET(new Request("http://console.test/api/guided/tasks"), context);
    const body = await response.text();
    expect(body).not.toContain("SENTINEL_STDERR_SECRET");
    expect(body).not.toContain('"error"');
  });

  test("rejects an invalid cursor with HTTP 400 before querying the repository", async () => {
    listGuidedTaskSummaries.mockClear();

    const response = await GET(
      new Request("http://console.test/api/guided/tasks?cursor=not-a-valid-cursor"),
      context,
    );

    expect(response.status).toBe(400);
    expect(listGuidedTaskSummaries).not.toHaveBeenCalled();
  });
});
