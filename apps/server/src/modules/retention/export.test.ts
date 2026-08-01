import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  MAX_LIFECYCLE_EXPORT_BYTES,
  lifecycleExportSchema,
  serializeLifecycleExport,
} from "./export";

describe("lifecycle business export", () => {
  test("requires only a preview id and rejects forged site scope", () => {
    expect(lifecycleExportSchema.parse({ previewId: "preview_1" })).toEqual({
      previewId: "preview_1",
    });
    expect(() => lifecycleExportSchema.parse({ previewId: "preview_1", siteId: "other" })).toThrow();
    expect(() => lifecycleExportSchema.parse({})).toThrow();
    expect(MAX_LIFECYCLE_EXPORT_BYTES).toBe(100 * 1024 * 1024);
  });

  test("serializes a deterministic, readable bundle and exposes its digest", () => {
    const payload = {
      version: 1 as const,
      type: "hermes_console_business_export" as const,
      previewId: "preview_1",
      policyVersion: 2,
      retentionDays: 30,
      cutoffAt: "2026-07-01T00:00:00.000Z",
      generatedAt: "2026-08-01T00:00:00.000Z",
      threads: [{ id: "thread_1" }],
      runs: [{ id: "run_1" }],
      messages: [],
      events: [],
      artifacts: [{ id: "artifact_1", bytesBase64: Buffer.from("hello").toString("base64") }],
    };
    const result = serializeLifecycleExport(payload);
    expect(result.sha256).toBe(createHash("sha256").update(result.body).digest("hex"));
    expect(JSON.parse(result.body)).toEqual(payload);
    expect(result.body).toContain("hermes_console_business_export");
  });
});
