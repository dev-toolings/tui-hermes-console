import { describe, expect, test } from "bun:test";
import { probeHermesDashboard } from "./hermes-dashboard";

describe("Hermes Dashboard probe", () => {
  test("treats the protected status endpoint as listening", async () => {
    const previousFetch = globalThis.fetch;
    let requestedUrl = "";
    globalThis.fetch = (async (input) => {
      requestedUrl = String(input);
      return new Response(JSON.stringify({ version: "0.19.1" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    try {
      await expect(probeHermesDashboard("http://127.0.0.1:9119")).resolves.toEqual({
        running: true,
        version: "0.19.1",
      });
    } finally {
      globalThis.fetch = previousFetch;
    }

    expect(requestedUrl).toBe("http://127.0.0.1:9119/api/status");
  });

  test("does not call a non-success response operational", async () => {
    const previousFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(null, { status: 503 })) as unknown as typeof fetch;

    try {
      await expect(probeHermesDashboard("http://127.0.0.1:9119")).resolves.toEqual({
        running: false,
        version: null,
      });
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
});
