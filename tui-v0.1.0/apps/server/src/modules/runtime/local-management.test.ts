import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  hermesCliExecutable,
  hermesCommandFailure,
  remoteHermesCommand,
} from "./local-management";

describe("Hermes CLI executable", () => {
  test("uses an explicit executable for background services with a minimal PATH", () => {
    expect(hermesCliExecutable({ HERMES_CLI_PATH: "/opt/hermes/bin/hermes" })).toBe(
      "/opt/hermes/bin/hermes",
    );
  });

  test("keeps interactive PATH lookup as the default", () => {
    expect(hermesCliExecutable({})).toBe("hermes");
    expect(hermesCliExecutable({ HERMES_CLI_PATH: "  " })).toBe("hermes");
  });
});

describe("remote Hermes command", () => {
  test("executes the Docker Hermes CLI with the runtime user and persistent HOME", () => {
    const command = remoteHermesCommand(
      ["auth", "add", "openai-codex", "--no-browser"],
      { pseudoTerminal: true },
    );

    expect(command).toContain("if [ -x '/usr/local/libexec/hermes-console-runtime-manager' ]");
    expect(command).toContain(
      "'sudo' '-n' '/usr/local/libexec/hermes-console-runtime-manager' 'cli-pty' 'auth' 'add'",
    );
    expect(command).toContain("elif docker inspect hermes-console-runtime");
    expect(command).toContain(
      "'docker' 'exec' '-it' '-u' 'hermes' '-e' 'HOME=/opt/data'",
    );
    expect(command).toContain("'/opt/hermes/.venv/bin/hermes' 'auth' 'add'");
    expect(command).toContain("else");
    expect(command).toContain("/opt/hermes-console/current/venv/bin/hermes");
    expect(command).toContain('exec "$hermes_bin" \'auth\' \'add\'');
    expect(command).not.toContain("exec 'hermes'");
  });

  test("uses the bounded manager without a PTY for non-interactive commands", () => {
    const command = remoteHermesCommand(["auth", "list", "openai"], {
      pseudoTerminal: false,
    });

    expect(command).toContain(
      "'sudo' '-n' '/usr/local/libexec/hermes-console-runtime-manager' 'cli' 'auth' 'list' 'openai'",
    );
    expect(command).not.toContain(
      "'/usr/local/libexec/hermes-console-runtime-manager' 'cli-pty' 'auth' 'list'",
    );
  });

  test("discovers a user launcher in a non-interactive SSH shell", () => {
    const home = mkdtempSync(join(tmpdir(), "hermes-console-ssh-"));
    const bin = join(home, ".local", "bin");
    const executable = join(bin, "hermes");
    mkdirSync(bin, { recursive: true });
    writeFileSync(executable, "#!/bin/sh\nprintf 'remote:%s\\n' \"$1\"\n");
    chmodSync(executable, 0o700);

    try {
      const result = spawnSync(
        "/bin/bash",
        ["-c", remoteHermesCommand(["--version"], { pseudoTerminal: false })],
        {
          env: { HOME: home, PATH: "/usr/bin:/bin" },
          encoding: "utf8",
        },
      );

      expect(result.status).toBe(0);
      expect(result.stdout).toBe("remote:--version\n");
      expect(result.stderr).toBe("");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test("returns an actionable diagnostic when no remote launcher is executable", () => {
    const home = mkdtempSync(join(tmpdir(), "hermes-console-ssh-empty-"));
    try {
      const result = spawnSync(
        "/bin/bash",
        ["-c", remoteHermesCommand(["--version"], { pseudoTerminal: false })],
        {
          env: { HOME: home, PATH: "/usr/bin:/bin" },
          encoding: "utf8",
        },
      );

      expect(result.status).toBe(127);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("Hermes CLI introuvable sur l’hôte SSH");
      expect(result.stderr).not.toContain("exec: hermes: not found");
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});

describe("Hermes command failure", () => {
  test("maps the remote launcher diagnostic to a stable runtime error", () => {
    expect(
      hermesCommandFailure({
        code: 127,
        stdout: "",
        stderr: "Hermes CLI introuvable sur l’hôte SSH.\n",
      }),
    ).toMatchObject({
      status: 503,
      code: "HERMES_REMOTE_CLI_UNAVAILABLE",
      message: "Hermes CLI introuvable sur l’hôte SSH.",
    });
  });

  test("recognizes the remote diagnostic when a PTY merges stderr into stdout", () => {
    expect(
      hermesCommandFailure({
        code: 127,
        stdout: "Hermes CLI introuvable sur l’hôte SSH.\r\n",
        stderr: "",
      }),
    ).toMatchObject({
      status: 503,
      code: "HERMES_REMOTE_CLI_UNAVAILABLE",
    });
  });

  test("keeps a generic code for other CLI failures", () => {
    const failure = hermesCommandFailure({
      code: 2,
      stdout: "",
      stderr: "provider rejected token=super-secret-value",
    });

    expect(failure).toMatchObject({
      status: 502,
      code: "HERMES_CLI_FAILED",
      message: "La commande Hermes a échoué.",
    });
    expect(failure.message).not.toContain("super-secret-value");
  });
});
