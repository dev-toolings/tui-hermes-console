import { describe, expect, test } from "bun:test";
import {
  buildLifecycleManifest,
  hashLifecycleManifest,
  lifecyclePolicySchema,
} from "./service";

describe("data lifecycle policy and manifest contract", () => {
  test("keeps policy input strict and requires a legal-hold reason", () => {
    expect(
      lifecyclePolicySchema.parse({
        retentionDays: 30,
        legalHoldEnabled: false,
      }),
    ).toMatchObject({ retentionDays: 30, legalHoldEnabled: false });
    expect(() =>
      lifecyclePolicySchema.parse({
        retentionDays: 30,
        legalHoldEnabled: true,
      }),
    ).toThrow();
    expect(() =>
      lifecyclePolicySchema.parse({
        retentionDays: 0,
        legalHoldEnabled: false,
      }),
    ).toThrow();
    expect(() =>
      lifecyclePolicySchema.parse({
        retentionDays: 30,
        legalHoldEnabled: false,
        siteId: "other-site",
      }),
    ).toThrow();
  });

  test("hashes a canonical, order-stable dry-run manifest without mutable side effects", () => {
    const policy = { version: 2, retentionDays: 30 } as const;
    const cutoff = new Date("2026-07-02T00:00:00.000Z");
    const candidate = {
      resourceId: "thread-1",
      activityAt: "2026-06-01T00:00:00.000Z",
      runCount: 1,
      messageCount: 2,
      artifactCount: 1,
      artifactBytes: 42,
      runIds: ["run-1"],
      artifactHashes: ["a".repeat(64)],
    };
    const first = buildLifecycleManifest(policy, cutoff, [candidate]);
    const second = buildLifecycleManifest(policy, cutoff, [{ ...candidate }]);
    expect(hashLifecycleManifest(first)).toBe(hashLifecycleManifest(second));
    expect(hashLifecycleManifest(first)).toMatch(/^[0-9a-f]{64}$/);
    expect(first.items[0]).not.toHaveProperty("storagePath");
  });
});
