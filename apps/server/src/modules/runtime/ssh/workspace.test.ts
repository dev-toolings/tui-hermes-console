import { describe, expect, test } from "bun:test";
import {
  alignTerminalCwd,
  buildWorkspaceCandidates,
  parseWorkspaceInspection,
  probeHermesWorkspaceAccess,
  workspaceInspectionCommand,
  withTerminalCwdRollback,
} from "./workspace";
import type { SshChannel } from "./types";

describe("SSH workspace discovery", () => {
  test("keeps the remote Docker and systemd inspection shell-valid", async () => {
    const child = Bun.spawn(["sh", "-n"], {
      stdin: new TextEncoder().encode(workspaceInspectionCommand("root")),
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(await child.exited).toBe(0);
  });

  test("maps a Docker bind mount to distinct host and Hermes paths", () => {
    const inspection = parseWorkspaceInspection([
      "mode=docker",
      "home=/home/hermes",
      "hermes_home=/opt/data",
      "terminal_cwd=/opt/data/workspace",
      "resolved_cwd=/opt/data/workspace",
      "mount_type=bind",
      "mount_source=/srv/hermes/data",
      "mount_destination=/opt/data",
    ].join("\n"));

    const candidates = buildWorkspaceCandidates(inspection, {
      "/srv/hermes/data/workspace": { exists: true, writable: true },
    });
    expect(candidates[0]).toMatchObject({
      source: "terminal_cwd",
      remoteWorkdir: "/srv/hermes/data/workspace",
      remoteHermesWorkdir: "/opt/data/workspace",
      recommended: true,
    });
  });

  test("blocks a named Docker volume because SFTP has no host path", () => {
    const inspection = parseWorkspaceInspection([
      "mode=docker",
      "home=/home/hermes",
      "hermes_home=/opt/data",
      "terminal_cwd=.",
      "resolved_cwd=/opt/data",
      "mount_type=volume",
      "mount_source=hermes-data",
      "mount_destination=/opt/data",
      "mount_name=hermes-console-runtime-data",
      "mount_driver=local",
      "docker_compose=available",
    ].join("\n"));
    expect(buildWorkspaceCandidates(inspection, {})).toEqual([]);
    expect(inspection.dockerMount).toMatchObject({
      type: "volume",
      name: "hermes-console-runtime-data",
      driver: "local",
    });
    expect(inspection.dockerComposeAvailable).toBe(true);
  });

  test("never recommends the remote home root as the exchange folder", () => {
    const inspection = parseWorkspaceInspection([
      "mode=native",
      "home=/home/hermes",
      "hermes_home=/home/hermes/.hermes",
      "terminal_cwd=.",
      "resolved_cwd=/home/hermes",
      "mount_type=",
      "mount_source=",
      "mount_destination=",
    ].join("\n"));
    const candidates = buildWorkspaceCandidates(inspection, {
      "/home/hermes/.hermes/workspace": { exists: false, writable: true },
    });
    expect(candidates[0]?.remoteWorkdir).toBe(
      "/home/hermes/.hermes/workspace",
    );
    expect(candidates.some(({ remoteWorkdir }) => remoteWorkdir === "/home/hermes")).toBe(false);
  });

  test("attributes a system-wide native service to its real service user", () => {
    const inspection = parseWorkspaceInspection([
      "mode=native",
      "home=/root",
      "hermes_home=/srv/hermes-console/data",
      "terminal_cwd=/srv/hermes-console/data/workspace",
      "resolved_cwd=/srv/hermes-console/data/workspace",
      "native_service_scope=system",
      "native_service_unit=hermes-gateway.service",
      "native_service_user=hermes",
      "native_service_home=/var/lib/hermes",
      "native_executable=/srv/hermes-console/native/current/venv/bin/hermes",
    ].join("\n"));

    expect(inspection).toMatchObject({
      mode: "native",
      nativeServiceScope: "system",
      nativeServiceUnit: "hermes-gateway.service",
      nativeServiceUser: "hermes",
      nativeServiceHome: "/var/lib/hermes",
      nativeHermesExecutable: "/srv/hermes-console/native/current/venv/bin/hermes",
    });
  });
});

function dockerInspection() {
  return parseWorkspaceInspection([
    "mode=docker",
    "home=/home/hermes",
    "hermes_home=/opt/data",
    "terminal_cwd=/opt/data/old",
    "resolved_cwd=/opt/data/old",
    "container_name=hermes-runtime",
    "mount_type=bind",
    "mount_source=/srv/hermes/data",
    "mount_destination=/opt/data",
  ].join("\n"));
}

function execOnly(
  exec: SshChannel["exec"],
): SshChannel {
  return { exec } as unknown as SshChannel;
}

describe("Hermes-side workspace proof", () => {
  test("fails when the host is writable but the Docker process cannot write", async () => {
    const commands: string[] = [];
    const channel = execOnly(async (command) => {
      commands.push(command);
      return { code: 1, stdout: "", stderr: "Permission denied" };
    });
    await expect(
      probeHermesWorkspaceAccess(
        channel,
        dockerInspection(),
        "/opt/data/workspace",
        "hermes",
      ),
    ).rejects.toMatchObject({ code: "SSH_HERMES_WORKSPACE_NOT_WRITABLE" });
    expect(commands[0]).toContain("sudo -n docker exec 'hermes-runtime' sh -c");
    expect(commands[0]).toContain("/opt/data/workspace");
  });

  test("runs a system-wide native proof as the actual service user", async () => {
    const commands: string[] = [];
    const channel = execOnly(async (command) => {
      commands.push(command);
      return { code: 0, stdout: "", stderr: "" };
    });
    const inspection = parseWorkspaceInspection([
      "mode=native",
      "home=/root",
      "hermes_home=/srv/hermes-console/data",
      "terminal_cwd=/srv/hermes-console/data/workspace",
      "resolved_cwd=/srv/hermes-console/data/workspace",
      "native_service_scope=system",
      "native_service_unit=hermes-gateway.service",
      "native_service_user=hermes",
      "native_service_home=/var/lib/hermes",
      "native_executable=/srv/hermes-console/native/current/venv/bin/hermes",
    ].join("\n"));

    await probeHermesWorkspaceAccess(
      channel,
      inspection,
      "/srv/hermes-console/data/workspace",
      "root",
    );

    expect(commands[0]).toContain("runuser -u 'hermes'");
    expect(commands[0]).toContain("HERMES_HOME='/srv/hermes-console/data'");
  });
});

describe("terminal.cwd rollback", () => {
  test("reports a verified rollback failure after set succeeds and get fails", async () => {
    const results = [
      { code: 0, stdout: "", stderr: "" },
      { code: 1, stdout: "", stderr: "get failed" },
      { code: 1, stdout: "", stderr: "restore set failed" },
    ];
    const channel = execOnly(async () => results.shift()!);
    try {
      await alignTerminalCwd(
        channel,
        dockerInspection(),
        "/opt/data/workspace",
        "hermes",
      );
      throw new Error("expected rollback to fail");
    } catch (error) {
      expect((error as { code?: string }).code).toBe(
        "SSH_HERMES_CWD_ROLLBACK_FAILED",
      );
      expect((error as { cause?: { code?: string } }).cause?.code).toBe(
        "SSH_REMOTE_COMMAND_FAILED",
      );
    }
  });

  test("runs rollback on a CAS-like failure and never returns a persisted result", async () => {
    const casFailure = new Error("CAS failed");
    let rollbackCause: unknown;
    await expect(
      withTerminalCwdRollback(
        async () => {
          throw casFailure;
        },
        async (cause) => {
          rollbackCause = cause;
        },
      ),
    ).rejects.toBe(casFailure);
    expect(rollbackCause).toBe(casFailure);
  });
});
