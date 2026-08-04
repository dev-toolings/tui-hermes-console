import { describe, expect, test } from "bun:test";
import {
  ALL_NAV,
  DEFAULT_CONSOLE_PATH,
  WORK_NAV,
  activeNavHref,
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
      "/artifacts",
      "/overview",
      "/updates",
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
      "/skills",
      "/sessions",
      "/artifacts",
      "/overview",
      "/updates",
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
      "/skills",
      "/sessions",
      "/artifacts",
      "/overview",
      "/updates",
      "/audit",
      "/support",
    ]);
  });

  test("Chat is the default and the operational indexes have explicit metadata", () => {
    expect(DEFAULT_CONSOLE_PATH).toBe("/chat");
    expect(pageMeta("/overview").title).toBe("Vue d’ensemble");
    expect(pageMeta("/sessions").title).toBe("Sessions");
    expect(pageMeta("/skills").title).toBe("Skills");
    expect(pageMeta("/runs/new").parent).toEqual({
      label: "Sessions",
      href: "/sessions?source=mission",
    });
    expect(pageMeta("/audit").title).toBe("Journal d’audit");
    expect(activeNavHref([...WORK_NAV], "/runs/thr_1")).toBe("/sessions");
  });
});
