import { describe, expect, test } from "bun:test";
import { ALL_NAV, navForCapabilities } from "./nav-config";

describe("persona navigation", () => {
  test("an approver sees decision surfaces but no creation or agent administration", () => {
    const capabilities = new Set([
      "thread.read",
      "run.read",
      "run.approve",
      "artifact.read",
    ]);
    expect(navForCapabilities(ALL_NAV, capabilities).map((item) => item.href)).toEqual([
      "/",
      "/chat",
      "/runs",
      "/artifacts",
      "/support",
    ]);
    expect(capabilities.has("thread.create")).toBe(false);
  });

  test("a requester retains only server-advertised work surfaces", () => {
    const capabilities = new Set([
      "agent.read",
      "connector.read",
      "thread.read",
      "thread.create",
      "run.read",
      "artifact.read",
    ]);
    expect(navForCapabilities(ALL_NAV, capabilities).map((item) => item.href)).toEqual([
      "/",
      "/chat",
      "/agents",
      "/runs",
      "/artifacts",
      "/support",
    ]);
  });
});
