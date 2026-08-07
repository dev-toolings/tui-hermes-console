import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { discoverDirectWorkspace } from "./workspace";

describe("direct workspace discovery", () => {
  test("verifies a writable shared directory against the local Hermes CLI", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "hermes-direct-workspace-"));
    try {
      const discovery = await discoverDirectWorkspace(
        { baseUrl: "http://127.0.0.1:8642", configRevision: 7 },
        { HERMES_SHARED_WORKDIR: root },
        async () => root,
      );

      expect(discovery).toMatchObject({
        transport: "direct",
        scope: "local",
        configRevision: 7,
        proofLevel: "verified",
        sharedWorkdir: {
          path: root,
          source: "env",
          exists: true,
          readable: true,
          writable: true,
        },
        hermesTerminalCwd: root,
        restartRequired: false,
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("reports a local path mismatch without changing either configuration", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "hermes-direct-workspace-"));
    try {
      const discovery = await discoverDirectWorkspace(
        { baseUrl: "http://localhost:8642", configRevision: null },
        { HERMES_SHARED_WORKDIR: root },
        async () => "/opt/data/workspace",
      );

      expect(discovery.proofLevel).toBe("misaligned");
      expect(discovery.blockers[0]).toContain("même chemin absolu");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test("fails closed when a direct runtime is not local", async () => {
    const discovery = await discoverDirectWorkspace(
      { baseUrl: "https://hermes.example.test", configRevision: 3 },
      {},
      async () => {
        throw new Error("must not run");
      },
    );

    expect(discovery).toMatchObject({
      transport: "direct",
      scope: "remote",
      proofLevel: "unavailable",
      reasonCode: "DIRECT_REMOTE_WORKSPACE_UNSUPPORTED",
      sharedWorkdir: null,
    });
  });
});
