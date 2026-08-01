import { afterEach, expect, mock, test } from "bun:test";
import {
  isGoogleEmailAllowed,
  keepSessionIfEmailAllowed,
  pkceChallenge,
  resolveSiteRequirement,
  verifyGoogleIdToken,
} from "./service";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

function encode(value: object | Uint8Array) {
  return Buffer.from(value instanceof Uint8Array ? value : JSON.stringify(value)).toString("base64url");
}

async function signedGoogleToken(overrides: Partial<Record<string, unknown>> = {}) {
  const keys = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const header = encode({ alg: "RS256", kid: "test-key" });
  const claims = encode({ iss: "https://accounts.google.com", sub: "google-subject", email: "admin@example.com", email_verified: true, aud: "client-id", exp: Math.floor(Date.now() / 1000) + 60, nonce: "nonce", ...overrides });
  const signature = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", keys.privateKey, new TextEncoder().encode(`${header}.${claims}`)));
  const publicJwk = await crypto.subtle.exportKey("jwk", keys.publicKey);
  return { token: `${header}.${claims}.${encode(signature)}`, publicJwk };
}

test("verifies the signed Google ID token and binds its nonce", async () => {
  const fixture = await signedGoogleToken();
  globalThis.fetch = (async () => Response.json({ keys: [{ ...fixture.publicJwk, kid: "test-key", use: "sig" }] })) as unknown as typeof fetch;
  const claims = await verifyGoogleIdToken(fixture.token, "nonce", "client-id");
  expect(claims.email).toBe("admin@example.com");
  await expect(verifyGoogleIdToken(fixture.token, "other-nonce", "client-id")).rejects.toMatchObject({ code: "GOOGLE_TOKEN_INVALID", status: 401 });
});

test("derives the RFC 7636 S256 PKCE challenge", () => {
  expect(pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
});

test("rejects a token whose signature has been tampered with", async () => {
  const fixture = await signedGoogleToken();
  globalThis.fetch = (async () => Response.json({ keys: [{ ...fixture.publicJwk, kid: "test-key" }] })) as unknown as typeof fetch;
  const [header, claims, signature] = fixture.token.split(".");
  const originalSignature = Buffer.from(signature!, "base64url");
  const tamperedSignature = Buffer.from(originalSignature);
  tamperedSignature[0] = tamperedSignature[0]! ^ 0x01;
  const tamperedSegment = tamperedSignature.toString("base64url");

  expect(Buffer.from(tamperedSegment, "base64url")[0]).not.toBe(
    originalSignature[0],
  );
  await expect(
    verifyGoogleIdToken(
      `${header}.${claims}.${tamperedSegment}`,
      "nonce",
      "client-id",
    ),
  ).rejects.toMatchObject({ code: "GOOGLE_TOKEN_INVALID" });
});

test("normalizes the current Google email allowlist", () => {
  expect(
    isGoogleEmailAllowed(
      " Operator@Example.COM ",
      "other@example.com, operator@example.com",
    ),
  ).toBe(true);
  expect(isGoogleEmailAllowed("removed@example.com", "other@example.com")).toBe(
    false,
  );
});

test("revokes an existing session as soon as its email leaves the allowlist", async () => {
  const revoke = mock(async () => undefined);
  await expect(
    keepSessionIfEmailAllowed(
      "removed@example.com",
      revoke,
      "operator@example.com",
    ),
  ).resolves.toBe(false);
  expect(revoke).toHaveBeenCalledTimes(1);

  revoke.mockClear();
  await expect(
    keepSessionIfEmailAllowed(
      "operator@example.com",
      revoke,
      "operator@example.com",
    ),
  ).resolves.toBe(true);
  expect(revoke).not.toHaveBeenCalled();
});

test("resolves zero, one, and multiple memberships without choosing arbitrarily", () => {
  expect(resolveSiteRequirement([], null)).toEqual({
    activeSite: null,
    membershipRequired: true,
    selectionRequired: false,
  });

  const paris = {
    id: "paris",
    name: "Paris",
    slug: "paris",
    role: "operator" as const,
    organizationId: "org_msp",
    clientOrganizationId: "org_client_paris",
  };
  expect(resolveSiteRequirement([paris], "paris")).toEqual({
    activeSite: paris,
    membershipRequired: false,
    selectionRequired: false,
  });

  const lyon = {
    id: "lyon",
    name: "Lyon",
    slug: "lyon",
    role: "auditor" as const,
    organizationId: "org_client_lyon",
    clientOrganizationId: "org_client_lyon",
  };
  expect(resolveSiteRequirement([paris, lyon], null)).toEqual({
    activeSite: null,
    membershipRequired: false,
    selectionRequired: true,
  });
  expect(resolveSiteRequirement([paris, lyon], "missing")).toEqual({
    activeSite: null,
    membershipRequired: false,
    selectionRequired: true,
  });
});
