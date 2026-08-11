import { expect, test } from "bun:test";
import { POST } from "./route";

const context = {
  params: Promise.resolve({}),
  siteContext: {
    siteId: "site-purge",
    userId: "usr-admin",
    role: "admin" as const,
    actorOrganizationId: "org-purge",
    clientOrganizationId: "org-purge",
    mandateId: null,
    mandateProjectId: null,
    correlationId: "corr-purge",
  },
};

test("POST /purges rejects malformed JSON before resolving the database", async () => {
  const response = await POST(
    new Request("http://console.test/api/settings/data-lifecycle/purges", {
      method: "POST",
      body: "not-json",
    }),
    context,
  );
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ error: { code: "INVALID_INPUT" } });
});

test("POST /purges rejects a forged site field at the route boundary", async () => {
  const response = await POST(
    new Request("http://console.test/api/settings/data-lifecycle/purges", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ previewId: "preview-1", siteId: "other-site" }),
    }),
    context,
  );
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ error: { code: "INVALID_INPUT" } });
});
