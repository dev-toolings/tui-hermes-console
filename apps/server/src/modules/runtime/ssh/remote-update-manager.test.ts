import { describe, expect, test } from "bun:test";
import {
  REMOTE_UPDATE_MANAGER_PATH,
  REMOTE_UPDATE_MANAGER_SCRIPT,
  buildRemoteUpdateManagerInstallCommand,
  parseRemoteUpdateManagerResult,
  remoteUpdateManagerInspectCommand,
  remoteUpdateManagerUpdateCommand,
} from "./remote-update-manager";

describe("remote runtime update manager", () => {
  test("exposes the two runtime update operations required by the Console", () => {
    expect(remoteUpdateManagerInspectCommand()).toBe(
      `sudo -n ${REMOTE_UPDATE_MANAGER_PATH} inspect`,
    );
    expect(remoteUpdateManagerUpdateCommand()).toBe(
      `sudo -n ${REMOTE_UPDATE_MANAGER_PATH} update`,
    );
  });

  test("installs a root-owned manager, a sealed topology config and exact sudoers commands", () => {
    const command = buildRemoteUpdateManagerInstallCommand({
      sudo: "sudo -n",
      serviceUser: "hermes-console",
      serviceUid: 1002,
      serviceGid: 1003,
      runtimeRoot: "/srv/hermes-console/workdir",
      mode: "native",
    });

    const encodedScript = command.match(/MANAGER_B64='([A-Za-z0-9+/=]+)'/)?.[1];
    expect(encodedScript).toBeTruthy();
    expect(Buffer.from(encodedScript!, "base64").toString("utf8")).toBe(
      REMOTE_UPDATE_MANAGER_SCRIPT,
    );
    expect(command).toContain("install -o 0 -g 0 -m 0755");
    expect(command).toContain("install -o 0 -g 0 -m 0600");
    expect(command).toContain("install -o 0 -g 0 -m 0440");
    expect(command).toContain("mode=native");
    expect(command).toContain("runtime_root=/srv/hermes-console/workdir");
    expect(command).toContain(
      `hermes-console ALL=(root) NOPASSWD: ${REMOTE_UPDATE_MANAGER_PATH} inspect, ${REMOTE_UPDATE_MANAGER_PATH} update, ${REMOTE_UPDATE_MANAGER_PATH} workspace-get, ${REMOTE_UPDATE_MANAGER_PATH} workspace-set *, ${REMOTE_UPDATE_MANAGER_PATH} workspace-probe *`,
    );
    expect(command).toContain("visudo -cf");
    expect(command).not.toContain("NOPASSWD: ALL");
    expect(REMOTE_UPDATE_MANAGER_SCRIPT).toContain("validate_workspace_path");
    expect(REMOTE_UPDATE_MANAGER_SCRIPT).toContain("workspace_inspection=true");
  });

  test("encodes the managed Docker topology without broadening privileges", () => {
    const command = buildRemoteUpdateManagerInstallCommand({
      sudo: "",
      serviceUser: "hermes-console",
      serviceUid: 1002,
      serviceGid: 1003,
      runtimeRoot: "/srv/hermes-console/workdir",
      mode: "docker",
    });

    expect(command).toContain("mode=docker");
    expect(command).toContain("service_uid=1002");
    expect(command).toContain("service_gid=1003");
    expect(command).toContain("hermes.console.contract");
    expect(command).toContain("g1-002-docker-v1");
  });

  test("rejects unsafe config values before generating a root command", () => {
    expect(() =>
      buildRemoteUpdateManagerInstallCommand({
        sudo: "sudo -n",
        serviceUser: "hermes-console;id",
        serviceUid: 1002,
        serviceGid: 1003,
        runtimeRoot: "/srv/hermes-console/workdir",
        mode: "native",
      }),
    ).toThrow("service user");
    expect(() =>
      buildRemoteUpdateManagerInstallCommand({
        sudo: "sudo -n",
        serviceUser: "hermes-console",
        serviceUid: 1002,
        serviceGid: 1003,
        runtimeRoot: "relative/path",
        mode: "docker",
      }),
    ).toThrow("runtime root");
    expect(() =>
      buildRemoteUpdateManagerInstallCommand({
        sudo: "sudo -n",
        serviceUser: "hermes-console",
        serviceUid: 1002,
        serviceGid: 1003,
        runtimeRoot: "/srv/hermes console",
        mode: "native",
      }),
    ).toThrow("runtime root");
  });

  test("classifies success, rollback and recovery without trusting prose", () => {
    expect(parseRemoteUpdateManagerResult({
      code: 0,
      stdout: "mode=native\nupdated=true\n",
      stderr: "",
    })).toEqual({ status: "updated", mode: "native" });
    expect(parseRemoteUpdateManagerResult({
      code: 75,
      stdout: "mode=docker\nupdated=false\nrolled_back=true\n",
      stderr: "",
    })).toEqual({ status: "rolled_back", mode: "docker" });
    expect(parseRemoteUpdateManagerResult({
      code: 76,
      stdout: "mode=native\nrecovery_required=true\n",
      stderr: "",
    })).toEqual({ status: "recovery_required", mode: "native" });
    expect(parseRemoteUpdateManagerResult({
      code: 0,
      stdout: "mode=docker\nupdated=false\n",
      stderr: "",
    })).toEqual({ status: "unchanged", mode: "docker" });
    expect(parseRemoteUpdateManagerResult({
      code: 0,
      stdout: "updated=true\n",
      stderr: "",
    })).toEqual({ status: "failed", mode: null });
  });
});
