import { describe, expect, test } from "bun:test";
import { summarizeLifecyclePreview } from "./settings-retention";

describe("retention preview summary", () => {
  test("aggregates every destructive unit shown by the confirmation", () => {
    expect(
      summarizeLifecyclePreview({
        id: "preview-1",
        siteId: "site-1",
        policyVersion: 2,
        retentionDays: 30,
        cutoffAt: "2026-07-08T00:00:00.000Z",
        manifestSha256: "a".repeat(64),
        createdByUserId: "user-1",
        createdAt: "2026-08-07T00:00:00.000Z",
        items: [
          {
            resourceId: "thread-1",
            activityAt: "2026-01-01T00:00:00.000Z",
            runCount: 2,
            messageCount: 8,
            artifactCount: 1,
            artifactBytes: 1024,
            runIds: ["run-1", "run-2"],
            artifactHashes: ["b".repeat(64)],
          },
          {
            resourceId: "thread-2",
            activityAt: "2026-02-01T00:00:00.000Z",
            runCount: 1,
            messageCount: 3,
            artifactCount: 2,
            artifactBytes: 2048,
            runIds: ["run-3"],
            artifactHashes: ["c".repeat(64), "d".repeat(64)],
          },
        ],
      }),
    ).toEqual({ threads: 2, runs: 3, messages: 11, artifacts: 3, artifactBytes: 3072 });
  });
});
