import { describe, expect, test } from "bun:test";
import { DEVELOPMENT_LOGIN_PATH, requestDevelopmentLogin } from "./development-login";

describe("development login navigation", () => {
  test("creates the local session through an explicit same-origin POST", async () => {
    const requests: Array<{ input: string | URL | Request; init?: RequestInit }> = [];
    const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
      requests.push({ input, init });
      return new Response(null, { status: 204 });
    };

    await requestDevelopmentLogin(fetcher);

    expect(requests[0]?.input).toBe(DEVELOPMENT_LOGIN_PATH);
    expect(requests[0]?.init).toMatchObject({ method: "POST", credentials: "same-origin" });
  });

  test("surfaces the server error instead of navigating", async () => {
    const fetcher = async () =>
      Response.json(
        { error: { message: "Bypass local indisponible." } },
        { status: 403 },
      );

    await expect(requestDevelopmentLogin(fetcher)).rejects.toThrow(
      "Bypass local indisponible.",
    );
  });
});
