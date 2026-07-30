import { describe, expect, test } from "bun:test";
import { decryptSecret, encryptSecret } from "./crypto";

describe("crypto", () => {
  test("round-trips a secret with APP_ENCRYPTION_KEY", () => {
    process.env.APP_ENCRYPTION_KEY = "test-passphrase-for-unit-tests-only";
    const encrypted = encryptSecret("api-server-key-value");
    expect(encrypted.startsWith("v1:")).toBe(true);
    expect(decryptSecret(encrypted)).toBe("api-server-key-value");
  });
});
