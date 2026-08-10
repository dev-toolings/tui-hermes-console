import { describe, expect, mock, test } from "bun:test";
import type { AuthenticatedRouteContext } from "@/modules/api/route-context";

const validCursor = "eyJ1cGRhdGVkQXQiOiIyMDI2LTA4LTA5VDEwOjAwOjAwLjAwMFoiLCJpZCI6InRocl8xIn0";
const listInboxMissionSummaries = mock(async () => ({
  missions: [{
    id: "thr_1", title: "Préparer le rapport", agentName: "Agent", updatedAt: "2026-08-09T10:00:00.000Z",
    latestRun: {
      status: "failed", input: "SENTINEL_INPUT", output: "SENTINEL_OUTPUT", error: "SENTINEL_ERROR",
      hermesResponseId: "SENTINEL_RESPONSE", runtimeSession: "SENTINEL_SESSION",
    },
  }],
  page: { hasMore: true, nextCursor: "next" },
}));
mock.module("@/modules/runs/repository", () => ({
  listInboxMissionSummaries,
  ProductRepositoryError: class ProductRepositoryError extends Error {},
}));
const { GET } = await import("./route");
const context: AuthenticatedRouteContext = {
  params: Promise.resolve({}),
  siteContext: { siteId: "site", userId: "user", role: "admin", actorOrganizationId: "org", clientOrganizationId: "org", mandateId: null, mandateProjectId: null, correlationId: "corr" },
};

describe("GET /api/inbox/missions", () => {
  test("returns only the whitelisted mission summary and bounded cursor", async () => {
    const response = await GET(new Request(`http://console.test/api/inbox/missions?limit=999&cursor=${validCursor}`), context);
    expect(response.status).toBe(200);
    expect(listInboxMissionSummaries).toHaveBeenCalledWith(context.siteContext, { limit: 100, cursor: validCursor });
    const body = await response.text();
    expect(body).not.toContain("SENTINEL_INPUT");
    expect(body).not.toContain("SENTINEL_OUTPUT");
    expect(body).not.toContain("SENTINEL_ERROR");
    expect(body).not.toContain("SENTINEL_RESPONSE");
    expect(body).not.toContain("SENTINEL_SESSION");
    const parsed = JSON.parse(body);
    expect(Object.keys(parsed.missions[0].latestRun)).toEqual(["status"]);
    expect(Object.keys(parsed.missions[0])).toEqual(["id", "title", "agentName", "updatedAt", "latestRun"]);
    expect(parsed).toEqual({
      missions: [{ id: "thr_1", title: "Préparer le rapport", agentName: "Agent", updatedAt: "2026-08-09T10:00:00.000Z", latestRun: { status: "failed" } }],
      page: { hasMore: true, nextCursor: "next" },
    });
  });

  test("rejects invalid cursor before repository access", async () => {
    listInboxMissionSummaries.mockClear();
    const response = await GET(new Request("http://console.test/api/inbox/missions?cursor=invalid"), context);
    expect(response.status).toBe(400);
    expect(listInboxMissionSummaries).not.toHaveBeenCalled();
  });
});
