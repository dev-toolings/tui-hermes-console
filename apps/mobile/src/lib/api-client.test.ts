import { afterEach, describe, expect, test } from "bun:test";

import { ConsoleApiClient, exchangePairingCode } from "./api-client";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

describe("ConsoleApiClient mobile contracts", () => {
  test("exchanges a one-time pairing code without sending product credentials", async () => {
    let request: Request | null = null;
    globalThis.fetch = (async (input, init) => {
      request = new Request(input, init);
      return Response.json({ sessionToken: "session_mobile" });
    }) as typeof fetch;

    expect(await exchangePairingCode("https://console.example/", "pairing_code_1234567890")).toBe("session_mobile");
    expect(request!.url).toBe("https://console.example/api/auth/mobile?action=exchange");
    expect(request!.headers.get("authorization")).toBeNull();
    expect(await request!.json()).toEqual({ pairingCode: "pairing_code_1234567890" });
  });

  test("uses bearer auth for state-changing run actions", async () => {
    const requests: Request[] = [];
    globalThis.fetch = (async (input, init) => {
      requests.push(new Request(input, init));
      return Response.json({ runId: "run_2" }, { status: 202 });
    }) as typeof fetch;
    const client = new ConsoleApiClient({ apiUrl: "https://console.example", sessionToken: "opaque_mobile_session" });

    await client.cancelRun("run 1");
    await client.retryRun("run 1");
    await client.respondApproval("run 1", "once", "approval_1");

    expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
      "/api/runs/run%201/cancel",
      "/api/runs/run%201/retry",
      "/api/runs/run%201/approval",
    ]);
    for (const request of requests) {
      expect(request.method).toBe("POST");
      expect(request.headers.get("authorization")).toBe("Bearer opaque_mobile_session");
    }
  });

  test("downloads artifact bytes through the authenticated Console API", async () => {
    const authorizations: Array<string | null> = [];
    globalThis.fetch = (async (input, init) => {
      const request = new Request(input, init);
      authorizations.push(request.headers.get("authorization"));
      return new Response(new Uint8Array([1, 2, 3]));
    }) as typeof fetch;
    const client = new ConsoleApiClient({ apiUrl: "https://console.example", sessionToken: "opaque_mobile_session" });

    expect(Array.from(await client.artifactBytes("file_1"))).toEqual([1, 2, 3]);
    expect(authorizations).toEqual(["Bearer opaque_mobile_session"]);
  });
});
