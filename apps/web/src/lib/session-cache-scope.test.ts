import { describe, expect, test } from "bun:test";
import {
  getSessionCacheScope,
  scopedSessionStorageKey,
  setSessionCacheScope,
} from "./session-cache-scope";

describe("session cache scope", () => {
  test("includes the selected mandate so project contexts never share keys", () => {
    setSessionCacheScope("operator@example.com", "paris", "mandate_a");
    expect(getSessionCacheScope()).toBe("operator%40example.com:paris:mandate_a");
    expect(scopedSessionStorageKey("hermes-console:thread-chrome:thread_a")).toBe(
      "hermes-console:thread-chrome:thread_a:operator%40example.com:paris:mandate_a",
    );

    setSessionCacheScope("operator@example.com", "paris", "mandate_b");
    expect(getSessionCacheScope()).toBe("operator%40example.com:paris:mandate_b");

    setSessionCacheScope(null, null, null);
  });
});
