import { describe, expect, test } from "bun:test";
import {
  ALL_NAV,
  DEFAULT_CONSOLE_PATH,
  navForCapabilities,
  pageMeta,
} from "./nav-config";

describe("persona navigation", () => {
  test("an approver sees decision surfaces but no creation or agent administration", () => {
    const capabilities = new Set([
      "thread.read",
      "run.read",
      "run.approve",
      "artifact.read",
    ]);
    expect(navForCapabilities(ALL_NAV, capabilities).map((item) => item.href)).toEqual([
      "/chat",
      "/sessions",
      "/runs",
      "/artifacts",
      "/overview",
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
      "/chat",
      "/agents",
      "/sessions",
      "/runs",
      "/artifacts",
      "/overview",
      "/support",
    ]);
  });

  test("an auditor gets the journal but not installation settings", () => {
    const capabilities = new Set([
      "agent.read",
      "thread.read",
      "run.read",
      "artifact.read",
      "audit.read",
    ]);
    expect(navForCapabilities(ALL_NAV, capabilities).map((item) => item.href)).toEqual([
      "/chat",
      "/agents",
      "/sessions",
      "/runs",
      "/artifacts",
      "/overview",
      "/audit",
      "/support",
    ]);
  });

  test("Chat is the default and the operational indexes have explicit metadata", () => {
    expect(DEFAULT_CONSOLE_PATH).toBe("/chat");
    expect(pageMeta("/overview").title).toBe("Vue d’ensemble");
    expect(pageMeta("/sessions").title).toBe("Sessions");
    expect(pageMeta("/audit").title).toBe("Journal d’audit");
  });
});
