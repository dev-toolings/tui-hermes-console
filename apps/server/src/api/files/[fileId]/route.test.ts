import { describe, expect, test } from "bun:test";
import { DELETE } from "./route";

const context = {
  params: Promise.resolve({ fileId: "file_1" }),
  siteContext: {
    siteId: "site_1",
    userId: "user_1",
    role: "operator" as const,
    actorOrganizationId: "org_operator",
    clientOrganizationId: "org_client",
    mandateId: null,
    mandateProjectId: null,
    correlationId: "corr_1",
  },
};

describe("DELETE /api/files/:fileId", () => {
  test("délègue la suppression complète au service borné par le contexte", async () => {
    const calls: Array<{ siteId: string; fileId: string }> = [];
    const response = await DELETE(
      new Request("http://console.test/api/files/file_1", { method: "DELETE" }),
      context,
      {
        delete: (async (siteContext, fileId) => {
          calls.push({ siteId: siteContext.siteId, fileId });
          return {
            artifactId: fileId,
            runId: "run_1",
            filename: "brief.pdf",
            deletedAt: "2026-08-07T12:00:00.000Z",
            cleanupPending: false,
          };
        }) as typeof import("@/modules/artifacts/delete-artifact").deleteArtifactEverywhere,
      },
    );

    expect(response.status).toBe(200);
    expect(calls).toEqual([{ siteId: "site_1", fileId: "file_1" }]);
    expect(await response.json()).toMatchObject({
      deleted: true,
      artifactId: "file_1",
      cleanupPending: false,
    });
  });
});
