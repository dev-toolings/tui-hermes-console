import { describe, expect, test } from "bun:test";
import {
  assertWorkspaceStatusReady,
  requireDurableRemoteWorkdir,
  sameSshConnectionIdentity,
  saveRuntimeConfig,
  workspaceActivationProofVersions,
} from "./config";
import { acquireRunStartLease } from "@/modules/runs/active-runtime-guard";

function errorCode(value: string | undefined) {
  try {
    requireDurableRemoteWorkdir(value);
    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? null;
  }
}

describe("SSH remote workdir", () => {
  test("requires an explicit absolute workdir", () => {
    expect(errorCode(undefined)).toBe("SSH_WORKDIR_REQUIRED");
    expect(errorCode("relative/workdir")).toBe("SSH_WORKDIR_INVALID");
    expect(requireDurableRemoteWorkdir(" /srv/hermes-console/workdir/ ")).toBe(
      "/srv/hermes-console/workdir",
    );
  });

  test("rejects known transient roots instead of falling back to them", () => {
    for (const root of ["/tmp/hermes-console-work", "/var/tmp/hermes", "/run/hermes", "/dev/shm/hermes"]) {
      expect(errorCode(root)).toBe("SSH_WORKDIR_NOT_DURABLE");
    }
  });

  test("normalizes traversal before applying the durability guard", () => {
    expect(errorCode("/srv/../tmp/hermes")).toBe("SSH_WORKDIR_NOT_DURABLE");
  });
});

describe("SSH secret binding", () => {
  const row = {
    transport: "ssh" as const,
    baseUrl: "http://127.0.0.1:8642",
    sshHost: "vps.example.test",
    sshPort: 22,
    sshUser: "hermes",
    sshAuth: "agent" as const,
  };
  const input = {
    baseUrl: "http://127.0.0.1:8642",
    ssh: {
      host: "vps.example.test",
      port: 22,
      user: "hermes",
      auth: "agent" as const,
    },
  };

  test("reuses secrets only for the exact SSH and Hermes endpoint identity", () => {
    expect(sameSshConnectionIdentity(row, input)).toBe(true);
    expect(
      sameSshConnectionIdentity(row, {
        ...input,
        ssh: { ...input.ssh, host: "other.example.test" },
      }),
    ).toBe(false);
    expect(
      sameSshConnectionIdentity(row, {
        ...input,
        baseUrl: "http://127.0.0.1:9999",
      }),
    ).toBe(false);
    expect(
      sameSshConnectionIdentity(row, {
        ...input,
        ssh: { ...input.ssh, auth: "password" },
      }),
    ).toBe(false);
  });
});

describe("SSH workspace gate", () => {
  test("allows direct or verified runtimes and blocks incomplete SSH mappings", () => {
    expect(() => assertWorkspaceStatusReady("not_required")).not.toThrow();
    expect(() => assertWorkspaceStatusReady("ready")).not.toThrow();
    for (const status of ["required", "verification_required"] as const) {
      try {
        assertWorkspaceStatusReady(status);
        throw new Error("expected guard to fail");
      } catch (error) {
        expect((error as { code?: string }).code).toBe("SSH_WORKSPACE_REQUIRED");
      }
    }
  });
});

describe("SSH workspace setup proof", () => {
  test("advances a completed setup proof with the workspace revision", () => {
    expect(workspaceActivationProofVersions(6)).toEqual({
      previous: "database:6",
      next: "database:7",
    });
  });
});

describe("direct runtime mutation lease", () => {
  test("rejects a direct save before touching secrets or the database while a run is reserved", async () => {
    const releaseRun = acquireRunStartLease();
    try {
      await expect(
        saveRuntimeConfig({ baseUrl: "http://127.0.0.1:8642", token: "test" }),
      ).rejects.toMatchObject({
        status: 409,
        code: "RUNTIME_MUTATION_ACTIVE_RUNS",
      });
    } finally {
      releaseRun();
    }
  });
});
