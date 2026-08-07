import { describe, expect, test } from "bun:test";

import { bearerSessionToken, usesBearerSession } from "./service";

describe("mobile bearer session transport", () => {
  test("accepts an opaque URL-safe bearer token", () => {
    const request = new Request("https://console.example/api/threads", {
      headers: { authorization: `Bearer ${"a".repeat(40)}_mobile-session` },
    });
    expect(bearerSessionToken(request)).toBe(`${"a".repeat(40)}_mobile-session`);
    expect(usesBearerSession(request)).toBe(true);
  });

  test("rejects malformed or ambiguous authorization values", () => {
    for (const authorization of [
      "bearer short",
      `Bearer ${"a".repeat(20)} another`,
      `Basic ${"a".repeat(40)}`,
      `Bearer ${"a".repeat(513)}`,
    ]) {
      const request = new Request("https://console.example/api/threads", { headers: { authorization } });
      expect(bearerSessionToken(request)).toBeNull();
      expect(usesBearerSession(request)).toBe(false);
    }
  });

  test("does not infer bearer auth from cookies", () => {
    const request = new Request("https://console.example/api/threads", {
      headers: { cookie: `hc_session=${"a".repeat(40)}` },
    });
    expect(usesBearerSession(request)).toBe(false);
  });
});
