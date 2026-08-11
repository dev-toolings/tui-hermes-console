import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  REMOTE_MANAGER_CLI_POLICY,
  REMOTE_UPDATE_MANAGER_PATH,
  REMOTE_UPDATE_MANAGER_SCRIPT,
  buildRemoteUpdateManagerInstallCommand,
  parseRemoteUpdateManagerResult,
  remoteUpdateManagerCliCommand,
  remoteUpdateManagerInspectCommand,
  remoteUpdateManagerUpdateCommand,
} from "./remote-update-manager";

function validateCliArguments(args: string[]) {
  return spawnSync(
    "/bin/sh",
    ["-c", `${REMOTE_MANAGER_CLI_POLICY}\nvalidate_cli_arguments \"$@\"`, "policy", ...args],
    { encoding: "utf8" },
  );
}

function isConsoleManagedCredential(output: string, index: string) {
  return spawnSync(
    "/bin/sh",
    [
      "-c",
      `${REMOTE_MANAGER_CLI_POLICY}\nis_console_managed_credential "$TEST_OUTPUT" "$TEST_INDEX"`,
    ],
    {
      encoding: "utf8",
      env: { ...process.env, TEST_OUTPUT: output, TEST_INDEX: index },
    },
  );
}

function runManagerIdentityCheck(
  functionName: "api_identity_ok" | "native_identity_ok",
  env: Record<string, string>,
) {
  const functions = REMOTE_UPDATE_MANAGER_SCRIPT.split("\nvalidate_config\ncase ")[0];
  return spawnSync(
    "/bin/sh",
    [
      "-c",
      `${functions}
curl() { printf '%s' "$TEST_HEALTH_BODY"; }
systemctl() {
  if [ "$1" = is-active ]; then [ "$TEST_SYSTEMD_ACTIVE" = yes ]; return; fi
  if [ "$1" = show ]; then printf '%s\n' "$TEST_MAIN_PID"; return; fi
  return 1
}
ps() { printf '%s\n' "$TEST_PROCESS_USER"; }
ss() { printf 'LISTEN 0 128 127.0.0.1:8642 0.0.0.0:* users:(("hermes",pid=%s,fd=19))\n' "$TEST_LISTENER_PID"; }
service_user=hermes-console
${functionName}`,
    ],
    { encoding: "utf8", env: { ...process.env, ...env } },
  );
}

describe("remote runtime update manager", () => {
  test("exposes the two runtime update operations required by the Console", () => {
    expect(remoteUpdateManagerInspectCommand()).toBe(
      `sudo -n ${REMOTE_UPDATE_MANAGER_PATH} inspect`,
    );
    expect(remoteUpdateManagerUpdateCommand()).toBe(
      `sudo -n ${REMOTE_UPDATE_MANAGER_PATH} update`,
    );
    expect(
      remoteUpdateManagerCliCommand(
        ["auth", "add", "openai-codex", "--no-browser"],
        true,
      ),
    ).toBe(
      `sudo -n ${REMOTE_UPDATE_MANAGER_PATH} cli-pty 'auth' 'add' 'openai-codex' '--no-browser'`,
    );
    expect(remoteUpdateManagerCliCommand(["--version"], false)).toBe(
      `sudo -n ${REMOTE_UPDATE_MANAGER_PATH} cli '--version'`,
    );
  });

  test("allows only the exact Hermes CLI surface used by the Console", () => {
    const allowed = [
      ["--version"],
      ["auth", "add", "openai-codex", "--no-browser"],
      ["auth", "list", "openai-codex"],
      ["auth", "list", "openai"],
      [
        "auth",
        "add",
        "openai",
        "--type",
        "api-key",
        "--label",
        "console-web-abcdef123456",
      ],
      ["auth", "remove", "openai", "0"],
      ["auth", "remove", "openai", "42"],
      ["config", "get", "terminal.cwd"],
      ["gateway", "restart"],
      ["dashboard", "--stop"],
    ];

    for (const args of allowed) {
      const result = validateCliArguments(args);
      expect(result.status, args.join(" ")).toBe(0);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("");
    }
  });

  test("rejects malformed, broadened and injectable Hermes CLI arguments", () => {
    const denied = [
      [],
      ["shell"],
      ["--version", "extra"],
      ["auth", "add", "openai-codex"],
      ["auth", "add", "anthropic", "--no-browser"],
      ["auth", "list"],
      ["auth", "list", "openai;id"],
      ["auth", "list", "../../root"],
      ["auth", "list", "a".repeat(81)],
      ["auth", "add", "openai", "--type", "api-key"],
      [
        "auth",
        "add",
        "openai",
        "--type",
        "api-key",
        "--label",
        "not-console-managed",
      ],
      [
        "auth",
        "add",
        "openai",
        "--type",
        "api-key",
        "--label",
        "console-web-ABCDEF123456",
      ],
      ["auth", "remove", "openai", "-1"],
      ["auth", "remove", "openai", "1;id"],
      ["config", "set", "terminal.cwd", "/tmp"],
      ["config", "get", "api_key"],
      ["gateway", "stop"],
      ["dashboard", "--stop", "--force"],
    ];

    for (const args of denied) {
      const result = validateCliArguments(args);
      expect(result.status, args.join(" ")).not.toBe(0);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("");
    }
  });

  test("authorizes removal only when the indexed credential has a Console label", () => {
    const inventory = [
      "  #0 personal-key api_key manual",
      "  #1 console-web-abcdef123456 api_key manual",
      "  #2 console-web-fedcba654321 oauth subscription",
      "  #3 console-web-abcdef1234567 api_key manual",
    ].join("\n");

    expect(isConsoleManagedCredential(inventory, "1").status).toBe(0);
    for (const index of ["0", "2", "3", "4", "1;id", "-1"]) {
      expect(isConsoleManagedCredential(inventory, index).status, index).not.toBe(0);
    }
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
    const encodedPolicy = command.match(/CLI_POLICY_B64='([A-Za-z0-9+/=]+)'/)?.[1];
    expect(encodedScript).toBeTruthy();
    expect(encodedPolicy).toBeTruthy();
    expect(Buffer.from(encodedScript!, "base64").toString("utf8")).toBe(
      REMOTE_UPDATE_MANAGER_SCRIPT,
    );
    expect(Buffer.from(encodedPolicy!, "base64").toString("utf8")).toBe(
      REMOTE_MANAGER_CLI_POLICY,
    );
    expect(command).toContain("install -o 0 -g 0 -m 0755");
    expect(command).toContain("install -o 0 -g 0 -m 0600");
    expect(command).toContain("install -o 0 -g 0 -m 0440");
    expect(command).toContain("mode=native");
    expect(command).toContain("runtime_root=/srv/hermes-console/workdir");
    expect(command).toContain(
      `hermes-console ALL=(root) NOPASSWD: ${REMOTE_UPDATE_MANAGER_PATH} inspect, ${REMOTE_UPDATE_MANAGER_PATH} update, ${REMOTE_UPDATE_MANAGER_PATH} workspace-get, ${REMOTE_UPDATE_MANAGER_PATH} workspace-set *, ${REMOTE_UPDATE_MANAGER_PATH} workspace-probe *, ${REMOTE_UPDATE_MANAGER_PATH} cli *, ${REMOTE_UPDATE_MANAGER_PATH} cli-pty *`,
    );
    expect(command).toContain("visudo -cf");
    expect(command).not.toContain("NOPASSWD: ALL");
    expect(REMOTE_UPDATE_MANAGER_SCRIPT).toContain("validate_workspace_path");
    expect(REMOTE_UPDATE_MANAGER_SCRIPT).toContain("workspace_inspection=true");
    expect(REMOTE_UPDATE_MANAGER_SCRIPT).toContain("validate_cli_arguments");
    expect(REMOTE_UPDATE_MANAGER_SCRIPT).toContain("authorize_credential_removal");
    expect(REMOTE_UPDATE_MANAGER_SCRIPT).toContain("credential_not_console_managed");
    expect(REMOTE_UPDATE_MANAGER_SCRIPT).toContain("flock -x 9");
    expect(REMOTE_UPDATE_MANAGER_SCRIPT).toContain("docker exec -i");
    expect(REMOTE_UPDATE_MANAGER_SCRIPT).toContain("docker exec -it");
  });

  test("requires Hermes JSON identity and the native MainPID listener before accepting health", () => {
    const valid = {
      TEST_HEALTH_BODY: '{"status":"ok","platform":"hermes-agent"}',
      TEST_SYSTEMD_ACTIVE: "yes",
      TEST_MAIN_PID: "4242",
      TEST_PROCESS_USER: "hermes-console",
      TEST_LISTENER_PID: "4242",
    };
    expect(runManagerIdentityCheck("api_identity_ok", valid).status).toBe(0);
    expect(runManagerIdentityCheck("native_identity_ok", valid).status).toBe(0);
    expect(
      runManagerIdentityCheck("api_identity_ok", {
        ...valid,
        TEST_HEALTH_BODY: '{"status":"ok","platform":"not-hermes"}',
      }).status,
    ).not.toBe(0);
    expect(
      runManagerIdentityCheck("native_identity_ok", {
        ...valid,
        TEST_LISTENER_PID: "9999",
      }).status,
    ).not.toBe(0);
    expect(REMOTE_UPDATE_MANAGER_SCRIPT).toContain("native_healthcheck");
    expect(REMOTE_UPDATE_MANAGER_SCRIPT).toMatch(
      /if ! systemctl restart "\$NATIVE_SERVICE" \|\| ! native_healthcheck/,
    );
    expect(REMOTE_UPDATE_MANAGER_SCRIPT).toMatch(
      /if \[ "\$target" = "\$previous" \]; then\n    native_healthcheck \|\| fail native_health_failed/,
    );
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
