import { afterEach, describe, expect, test } from "bun:test";
import {
  createRuntimeOtpDigest,
  isValidOtp,
  matchesOtpDigest,
} from "./secret-reveal";

const originalKey = process.env.APP_ENCRYPTION_KEY;

afterEach(() => {
  if (originalKey === undefined) delete process.env.APP_ENCRYPTION_KEY;
  else process.env.APP_ENCRYPTION_KEY = originalKey;
});

describe("runtime secret reveal OTP", () => {
  test("requires exactly six numeric digits", () => {
    expect(isValidOtp("123456")).toBe(true);
    expect(isValidOtp("12345")).toBe(false);
    expect(isValidOtp("1234567")).toBe(false);
    expect(isValidOtp("12a456")).toBe(false);
  });

  test("binds the digest to the challenge and code", () => {
    process.env.APP_ENCRYPTION_KEY = "test-encryption-key";
    const digest = createRuntimeOtpDigest("challenge-a", "123456");
    expect(matchesOtpDigest(digest, createRuntimeOtpDigest("challenge-a", "123456"))).toBe(true);
    expect(matchesOtpDigest(digest, createRuntimeOtpDigest("challenge-a", "654321"))).toBe(false);
    expect(matchesOtpDigest(digest, createRuntimeOtpDigest("challenge-b", "123456"))).toBe(false);
  });

  test("fails closed when the encryption key is absent", () => {
    delete process.env.APP_ENCRYPTION_KEY;
    expect(() => createRuntimeOtpDigest("challenge-a", "123456")).toThrow(
      "APP_ENCRYPTION_KEY manquant",
    );
  });
});
