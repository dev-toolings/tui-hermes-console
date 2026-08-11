import { describe, expect, test } from "bun:test";
import type { RuntimePublicDto } from "@console/core/types/api";
import {
  canReuseDirectRuntimeToken,
  canReuseSshPassword,
  canReuseSshRuntimeToken,
  isSameSshConnectionIdentity,
} from "./runtime-secret-reuse";

const runtime = (overrides: Partial<RuntimePublicDto> = {}): RuntimePublicDto => ({
  configured: true,
  source: "database",
  transport: "ssh",
  baseUrl: "http://127.0.0.1:8642",
  name: "Hermes",
  tokenConfigured: true,
  managementMode: "external",
  credentialAdapter: "manual",
  lastCredentialRotatedAt: null,
  encryptionReady: true,
  sshHost: "vps.example.test",
  sshPort: 22,
  sshUser: "root",
  sshAuth: "agent",
  sshPasswordConfigured: false,
  remoteWorkdir: null,
  remoteHermesWorkdir: null,
  workspaceStatus: "required",
  configRevision: 1,
  detectedVersion: null,
  capabilities: null,
  lastHealthStatus: "unknown",
  lastCheckedAt: null,
  updatedAt: null,
  ...overrides,
});

describe("runtime secret reuse", () => {
  test("reuses a database direct token only for the exact stored URL", () => {
    const direct = runtime({ transport: "direct", sshHost: null, sshUser: null });

    expect(canReuseDirectRuntimeToken(direct, "http://127.0.0.1:8642/")).toBe(true);
    expect(canReuseDirectRuntimeToken(direct, "http://runtime.example.test:8642")).toBe(false);
    expect(canReuseDirectRuntimeToken({ ...direct, source: "env" }, direct.baseUrl!)).toBe(false);
  });

  test("matches an SSH credential only to its complete stored destination", () => {
    const saved = runtime();
    const candidate = {
      baseUrl: "http://127.0.0.1:8642/",
      sshHost: "vps.example.test",
      sshPort: 22,
      sshUser: "root",
      sshAuth: "agent" as const,
    };

    expect(isSameSshConnectionIdentity(saved, candidate)).toBe(true);
    expect(isSameSshConnectionIdentity(saved, { ...candidate, sshHost: "other.example.test" })).toBe(false);
    expect(isSameSshConnectionIdentity(saved, { ...candidate, sshPort: 2222 })).toBe(false);
    expect(isSameSshConnectionIdentity(saved, { ...candidate, baseUrl: "http://127.0.0.1:9000" })).toBe(false);
  });

  test("never treats a direct or environment runtime as the same SSH destination", () => {
    const candidate = {
      baseUrl: "http://127.0.0.1:8642",
      sshHost: "vps.example.test",
      sshPort: 22,
      sshUser: "root",
      sshAuth: "agent" as const,
    };

    expect(isSameSshConnectionIdentity(runtime({ transport: "direct" }), candidate)).toBe(false);
    expect(isSameSshConnectionIdentity(runtime({ source: "env" }), candidate)).toBe(false);
  });

  test("reuses SSH secrets only when both destination and credential kind match", () => {
    const candidate = {
      baseUrl: "http://127.0.0.1:8642",
      sshHost: "vps.example.test",
      sshPort: 22,
      sshUser: "root",
      sshAuth: "password" as const,
    };
    const saved = runtime({ sshAuth: "password", sshPasswordConfigured: true });

    expect(canReuseSshRuntimeToken(saved, candidate)).toBe(true);
    expect(canReuseSshPassword(saved, candidate)).toBe(true);
    expect(canReuseSshPassword(saved, { ...candidate, sshAuth: "agent" })).toBe(false);
    expect(canReuseSshRuntimeToken({ ...saved, tokenConfigured: false }, candidate)).toBe(false);
  });
});
