import { describe, expect, test } from "bun:test";
import { LifecycleExportError } from "@/modules/retention/export";
import {
  LIFECYCLE_EXPORT_FILENAME,
  lifecycleExportErrorResponse,
  POST,
} from "./route";

const context = {
  params: Promise.resolve({}),
  siteContext: {
    siteId: "site-paris",
    userId: "user-auditor",
    role: "auditor" as const,
    actorOrganizationId: "org-client",
    clientOrganizationId: "org-client",
    mandateId: null,
    mandateProjectId: null,
    correlationId: "corr-export",
  },
};

describe("data lifecycle export route", () => {
  test("returns no bytes when the success audit cannot be committed", async () => {
    const response = lifecycleExportErrorResponse(
      new LifecycleExportError(
        "LIFECYCLE_EXPORT_AUDIT_UNAVAILABLE",
        "audit unavailable",
        503,
      ),
    );
    expect(response.status).toBe(503);
    expect(await response.text()).toBe("");
  });

  test("rejects malformed JSON before resolving a database or site", async () => {
    const response = await POST(
      new Request("http://localhost/api/settings/data-lifecycle/exports", {
        method: "POST",
        body: "{not-json",
        headers: { "content-type": "application/json" },
      }),
      context,
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "INVALID_INPUT" } });
  });

  test("uses a generic attachment filename that cannot reflect preview input", () => {
    const filename = `attachment; filename="${LIFECYCLE_EXPORT_FILENAME}"`;
    expect(filename).toBe('attachment; filename="hermes-console-data-lifecycle-export.json"');
    expect(filename).not.toContain("previewId");
    expect(filename).not.toContain("siteId");
  });
});
