import { describe, expect, test } from "bun:test";
import { DataLifecycleError } from "./service";
import {
  assertPurgeManifest,
  buildPurgeFilePlan,
  lifecyclePurgeSchema,
  LifecyclePurgeError,
} from "./purge";

describe("data lifecycle purge contracts", () => {
  test("accepts only a preview id and cannot be given a forged site", () => {
    expect(lifecyclePurgeSchema.parse({ previewId: "preview_1" })).toEqual({
      previewId: "preview_1",
    });
    expect(() => lifecyclePurgeSchema.parse({ previewId: "preview_1", siteId: "other" })).toThrow();
    expect(() => lifecyclePurgeSchema.parse({})).toThrow();
  });

  test("purge errors are API-compatible lifecycle errors", () => {
    const error = new LifecyclePurgeError(
      "LIFECYCLE_PURGE_ALREADY_CONSUMED",
      "Aperçu déjà consommé.",
      409,
    );
    expect(error).toBeInstanceOf(DataLifecycleError);
    expect(error).toMatchObject({
      code: "LIFECYCLE_PURGE_ALREADY_CONSUMED",
      status: 409,
    });
  });

  test("manifest revalidation rejects drift, legal hold, and non-terminal runs", () => {
    const preview = {
      policyVersion: 2,
      retentionDays: 30,
      cutoffAt: new Date("2026-07-01T00:00:00.000Z"),
      manifestSha256: "0".repeat(64),
      items: [],
    };
    expect(() => assertPurgeManifest(preview, { legalHoldEnabled: true })).toThrow(
      LifecyclePurgeError,
    );
    try {
      assertPurgeManifest(
        { ...preview, manifestSha256: "1".repeat(64) },
        { legalHoldEnabled: false },
      );
      throw new Error("expected manifest mismatch");
    } catch (error) {
      expect(error).toMatchObject({ code: "LIFECYCLE_PURGE_MANIFEST_MISMATCH" });
    }
  });

  test("file plans derive only bounded run-id directories, never storage_path", () => {
    const plan = buildPurgeFilePlan(["run_1"], "/tmp/artifacts", "/tmp/work");
    expect(plan).toEqual({
      runIds: ["run_1"],
      directories: [
        "/tmp/artifacts/runs/run_1",
        "/tmp/work/runs/run_1",
      ],
    });
    expect(() => buildPurgeFilePlan(["../escape"], "/tmp/artifacts", "/tmp/work")).toThrow();
  });
});
