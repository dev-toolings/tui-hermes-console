import { describe, expect, test } from "bun:test";
import { createHmac, randomBytes } from "node:crypto";
import {
  hostLookupKey,
  parseKnownHosts,
  verifyHostKey,
} from "@/modules/runtime/ssh/known-hosts";

const KEY_A = "AAAAC3NzaC1lZDI1NTE5AAAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const KEY_B = "AAAAC3NzaC1lZDI1NTE5AAAAIBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";

function hashedLine(host: string, keyBase64: string) {
  const salt = randomBytes(20);
  const hash = createHmac("sha1", salt).update(host).digest("base64");
  return `|1|${salt.toString("base64")}|${hash} ssh-ed25519 ${keyBase64}`;
}

describe("hostLookupKey", () => {
  test("omet le port par défaut, l'ajoute sinon", () => {
    expect(hostLookupKey("srv.example", 22)).toBe("srv.example");
    expect(hostLookupKey("srv.example", 2222)).toBe("[srv.example]:2222");
  });
});

describe("parseKnownHosts", () => {
  test("ignore les commentaires et les lignes vides", () => {
    expect(parseKnownHosts("# commentaire\n\n   \n")).toHaveLength(0);
  });

  test("lit les alias multiples séparés par une virgule", () => {
    const [entry] = parseKnownHosts(`srv.example,10.0.0.5 ssh-ed25519 ${KEY_A}`);
    expect(entry.patterns).toEqual(["srv.example", "10.0.0.5"]);
    expect(entry.keyBase64).toBe(KEY_A);
  });

  test("ignore @cert-authority faute de savoir le valider", () => {
    expect(parseKnownHosts(`@cert-authority *.example ssh-ed25519 ${KEY_A}`)).toHaveLength(0);
  });

  test("retient @revoked", () => {
    const [entry] = parseKnownHosts(`@revoked srv.example ssh-ed25519 ${KEY_A}`);
    expect(entry.revoked).toBe(true);
  });
});

describe("verifyHostKey", () => {
  test("accepte une clé enregistrée en clair", () => {
    const entries = parseKnownHosts(`srv.example ssh-ed25519 ${KEY_A}`);
    expect(verifyHostKey(entries, "srv.example", KEY_A)).toEqual({ ok: true });
  });

  test("accepte une clé enregistrée sous forme hachée", () => {
    const entries = parseKnownHosts(hashedLine("srv.example", KEY_A));
    expect(verifyHostKey(entries, "srv.example", KEY_A)).toEqual({ ok: true });
  });

  test("refuse un hôte absent de known_hosts", () => {
    const entries = parseKnownHosts(`autre.example ssh-ed25519 ${KEY_A}`);
    expect(verifyHostKey(entries, "srv.example", KEY_A)).toEqual({
      ok: false,
      reason: "unknown_host",
    });
  });

  test("refuse une clé différente pour un hôte connu (MITM)", () => {
    const entries = parseKnownHosts(`srv.example ssh-ed25519 ${KEY_A}`);
    expect(verifyHostKey(entries, "srv.example", KEY_B)).toEqual({
      ok: false,
      reason: "key_mismatch",
    });
  });

  test("refuse une clé révoquée", () => {
    const entries = parseKnownHosts(`@revoked srv.example ssh-ed25519 ${KEY_A}`);
    expect(verifyHostKey(entries, "srv.example", KEY_A)).toEqual({
      ok: false,
      reason: "revoked",
    });
  });

  test("distingue les ports non standard", () => {
    const entries = parseKnownHosts(`[srv.example]:2222 ssh-ed25519 ${KEY_A}`);
    expect(verifyHostKey(entries, "[srv.example]:2222", KEY_A)).toEqual({ ok: true });
    expect(verifyHostKey(entries, "srv.example", KEY_A)).toEqual({
      ok: false,
      reason: "unknown_host",
    });
  });

  test("applique les jokers OpenSSH", () => {
    const entries = parseKnownHosts(`*.example ssh-ed25519 ${KEY_A}`);
    expect(verifyHostKey(entries, "srv.example", KEY_A)).toEqual({ ok: true });
    expect(verifyHostKey(entries, "srv.autre", KEY_A)).toEqual({
      ok: false,
      reason: "unknown_host",
    });
  });
});
