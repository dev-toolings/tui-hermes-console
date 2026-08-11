import { describe, expect, test } from "bun:test";
import { publicSetupState } from "./route";

describe("/api/setup public DTO", () => {
  test("keeps runtime status but strips the internal CAS proof", () => {
    expect(
      publicSetupState({
        step: "completed",
        runtimeVerifiedAt: "2026-08-01T10:00:00.000Z",
        runtimeConfigVersion: "environment:secret-proof",
        runtime: { configured: true, lastHealthStatus: "healthy" },
      }),
    ).toEqual({
      step: "completed",
      runtimeVerifiedAt: "2026-08-01T10:00:00.000Z",
      runtime: { configured: true, lastHealthStatus: "healthy" },
    });
  });
});
