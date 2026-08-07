import { describe, expect, test } from "bun:test";
import { ROUTES, ROUTE_METHODS, routeRequiresAiConsent } from "./routes";

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
      "/api/runtime/dashboard",
      "/api/runtime/models",
      "/api/runtime/probe",
      "/api/runtime/events",
      "/api/runtime/restart",
      "/api/runtime/update",
      "/api/runtime/update/:operationId",
      "/api/runtime/update/:operationId/events",
      "/api/runtime/credentials",
      "/api/runtime/credentials/plan",
      "/api/runtime/credentials/:operationId",
      "/api/runtime/ssh-hosts",
      "/api/runtime/test",
      "/api/runtime/ssh/connect",
      "/api/runtime/workspace/discover",
      "/api/runtime/ssh/workspace/discover",
      "/api/runtime/ssh/workspace/check",
      "/api/runtime/ssh/workspace",
      "/api/runtime/ssh/host-key/scan",
      "/api/runtime/ssh/host-key",
      "/api/runtime/ssh/plan",
      "/api/runtime/ssh/provision",
      "/api/runtime/ssh/provision/:jobId/events",
      "/api/runtime/ssh/storage-migration/plan",
      "/api/runtime/ssh/storage-migration",
      "/api/runtime/ssh/storage-migration/:jobId",
      "/api/runtime/ssh/storage-migration/:jobId/events",
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

  test("registers site-scoped lifecycle policy and preview routes", () => {
    expect(ROUTES.find(({ path }) => path === "/api/settings/data-lifecycle")?.access).toEqual({
      boundary: "site",
      actions: {
        GET: "data.lifecycle.read",
        PUT: "data.lifecycle.manage",
      },
    });
    expect(
      ROUTES.find(({ path }) => path === "/api/settings/data-lifecycle/previews")?.access,
    ).toEqual({ boundary: "site", actions: { POST: "data.lifecycle.preview" } });
    expect(
      ROUTES.find(({ path }) => path === "/api/settings/data-lifecycle/previews/:previewId")?.access,
    ).toEqual({ boundary: "site", actions: { GET: "data.lifecycle.preview" } });
    expect(
      ROUTES.find(({ path }) => path === "/api/settings/data-lifecycle/exports")?.access,
    ).toEqual({ boundary: "site", actions: { POST: "data.lifecycle.export" } });
    expect(
      ROUTES.find(({ path }) => path === "/api/settings/data-lifecycle/purges")?.access,
    ).toEqual({ boundary: "site", actions: { POST: "data.lifecycle.purge" } });
  });

  test("declares every AI-start route in the mounted manifest", () => {
    const consentRoutes = ROUTES.flatMap((route) =>
      Object.entries(route.requiresAiConsent ?? {})
        .filter(([, required]) => required)
        .map(([method]) => `${method} ${route.path}`),
    );
    expect(consentRoutes).toEqual([
      "POST /api/guided/tasks/:taskId/attempts",
      "POST /api/runs/:runId/retry",
      "POST /api/threads",
      "POST /api/threads/:threadId/messages",
    ]);
    expect(routeRequiresAiConsent("POST", "/api/runs/run_1/retry")).toBe(true);
    expect(routeRequiresAiConsent("POST", "/api/threads/thr_1/messages")).toBe(true);
    expect(routeRequiresAiConsent("POST", "/api/threads/thr_1/commands")).toBe(false);
  });
});
