import { describe, expect, test } from "bun:test";
import type { RuntimePublicDto } from "@console/core/types/api";
import { runtimeBadgePresentation } from "./settings-runtime";

const runtime = (overrides: Partial<RuntimePublicDto> = {}): RuntimePublicDto => ({
  configured: true,
  source: "database",
  transport: "direct",
  baseUrl: "http://127.0.0.1:8642",
  name: "Hermes",
  tokenConfigured: true,
  managementMode: "external",
  credentialAdapter: "manual",
  lastCredentialRotatedAt: null,
  encryptionReady: true,
  sshHost: null,
  sshPort: 22,
  sshUser: null,
  sshAuth: "agent",
  sshPasswordConfigured: false,
  remoteWorkdir: null,
  remoteHermesWorkdir: null,
  workspaceStatus: "not_required",
  configRevision: 1,
  detectedVersion: "0.19.0",
  capabilities: null,
  lastHealthStatus: "healthy",
  lastCheckedAt: "2026-08-02T18:00:00.000Z",
  updatedAt: "2026-08-02T18:00:00.000Z",
  ...overrides,
});

describe("runtime settings status truth", () => {
  test("attributes saved direct health while an untested SSH draft is displayed", () => {
    const presentation = runtimeBadgePresentation(runtime(), "ssh");

    expect(presentation.tone).toBe("info");
    expect(presentation.label).toBe("Runtime enregistré · Accès direct · 0.19.0");
    expect(presentation.label).not.toContain("Connecté");
  });

  test("names a tested SSH target and its remaining workspace gate", () => {
    expect(
      runtimeBadgePresentation(
        runtime({
          transport: "ssh",
          sshHost: "187.55.227.55",
          sshUser: "root",
          workspaceStatus: "required",
          detectedVersion: "0.19.1",
        }),
        "ssh",
      ),
    ).toEqual({
      tone: "warning",
      label: "SSH · 187.55.227.55 · Test réussi · Dossier requis",
    });
  });
});
