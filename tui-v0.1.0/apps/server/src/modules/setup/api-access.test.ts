import { describe, expect, test } from "bun:test";
import { isApiAvailableDuringSetup } from "./api-access";

describe("setup API access", () => {
  test("allows runtime installation sub-routes needed to finish setup", () => {
    expect(isApiAvailableDuringSetup("/api/runtime/update")).toBe(true);
    expect(
      isApiAvailableDuringSetup("/api/runtime/ssh/workspace/discover"),
    ).toBe(true);
    expect(isApiAvailableDuringSetup("/api/runtime/ssh/workspace")).toBe(true);
  });

  test("keeps product routes and lookalike prefixes locked", () => {
    expect(isApiAvailableDuringSetup("/api/threads")).toBe(false);
    expect(isApiAvailableDuringSetup("/api/runtime/achievements")).toBe(false);
    expect(isApiAvailableDuringSetup("/api/runtime-malicious/path")).toBe(false);
    expect(isApiAvailableDuringSetup("/api/runtime/update-malicious")).toBe(false);
  });
});
