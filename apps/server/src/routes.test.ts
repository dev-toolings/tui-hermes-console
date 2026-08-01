import { describe, expect, test } from "bun:test";
import { ROUTES, ROUTE_METHODS } from "./routes";

describe("route authorization inventory", () => {
  test("classifies every mounted handler and requires an action on site routes", () => {
    for (const route of ROUTES) {
      const methods = ROUTE_METHODS.filter(
        (method) => typeof route.module[method] === "function",
      );
      expect(methods.length).toBeGreaterThan(0);
      if (route.access.boundary !== "site") continue;
      for (const method of methods) {
        expect(route.access.actions[method]).toBeString();
      }
    }
  });

  test("keeps installation-global settings outside the site role matrix", () => {
    const installationPaths = ROUTES.filter(
      ({ access }) => access.boundary === "installation",
    ).map(({ path }) => path);
    expect(installationPaths).toEqual([
      "/api/runtime",
      "/api/runtime/models",
      "/api/runtime/probe",
      "/api/runtime/restart",
      "/api/runtime/ssh-hosts",
      "/api/runtime/test",
      "/api/runtime/providers/openai-codex/auth",
      "/api/runtime/providers/:provider/credentials",
    ]);
    expect(ROUTES.find(({ path }) => path === "/api/setup")?.access).toEqual({
      boundary: "setup",
    });
  });

  test("registers membership management, audit read and site-scoped export", () => {
    expect(
      ROUTES.find(({ path }) => path === "/api/site/memberships")?.access,
    ).toEqual({ boundary: "site", actions: { GET: "membership.manage" } });
    expect(
      ROUTES.find(({ path }) => path === "/api/site/memberships/:userId")
        ?.access,
    ).toEqual({ boundary: "site", actions: { PUT: "membership.manage" } });
    expect(ROUTES.find(({ path }) => path === "/api/audit")?.access).toEqual({
      boundary: "site",
      actions: { GET: "audit.read" },
    });
    expect(ROUTES.find(({ path }) => path === "/api/audit/exports")?.access).toEqual({
      boundary: "site",
      actions: { POST: "audit.export" },
    });
  });
});
