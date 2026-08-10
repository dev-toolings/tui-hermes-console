import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dir, "../../../../../..");
const script = resolve(
  repositoryRoot,
  "deploy/proxmox/scripts/reset-hermes-runtime.sh",
);

let fixture = "";
let fakeBin = "";
let commandLog = "";

function executable(name: string, body: string) {
  const path = resolve(fakeBin, name);
  writeFileSync(path, `#!/bin/sh\nset -eu\n${body}\n`);
  chmodSync(path, 0o755);
}

function run(args: string[], extraEnv: Record<string, string> = {}) {
  return Bun.spawnSync(["/bin/sh", script, ...args], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      PATH: `${fakeBin}:/usr/bin:/bin`,
      RESET_COMMAND_LOG: commandLog,
      RESET_FAKE_VM_NAME: "hermes-ephemeral-01",
      RESET_FAKE_INVENTORY_HOST: "hermes-ephemeral-01",
      RESET_FAKE_POSTCHECK_MODE: "docker",
      ...extraEnv,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
}

beforeEach(() => {
  fixture = mkdtempSync(resolve(tmpdir(), "hermes-reset-test-"));
  fakeBin = resolve(fixture, "bin");
  commandLog = resolve(fixture, "commands.log");
  Bun.spawnSync(["/bin/mkdir", "-p", fakeBin]);

  executable(
    "pvecli",
    `printf 'pvecli %s\\n' "$*" >> "$RESET_COMMAND_LOG"
case "\${1:-} \${2:-}" in
  'doctor ') printf 'doctor=ok\\n' ;;
  'vm show') printf 'name: %s\\nstatus: running\\nvmid: 210\\ntags: managed;pvecli\\n' "$RESET_FAKE_VM_NAME" ;;
  'iac inventory')
    out=''
    while [ "$#" -gt 0 ]; do
      if [ "$1" = --out ]; then out=$2; shift 2; else shift; fi
    done
    printf 'managed:\\n  hosts:\\n    %s:\\n      ansible_host: 192.168.1.210\\n' "$RESET_FAKE_INVENTORY_HOST" > "$out"
    ;;
  'backup run') printf 'backup=ok\\n' ;;
esac`,
  );
  executable(
    "ansible-playbook",
    `printf 'ansible-playbook %s\\n' "$*" >> "$RESET_COMMAND_LOG"`,
  );
  executable(
    "ansible-inventory",
    `printf 'ansible-inventory %s\\n' "$*" >> "$RESET_COMMAND_LOG"
printf '{"ansible_host":"192.168.1.210"}\\n'`,
  );
  executable(
    "ssh",
    `printf 'ssh %s\\n' "$*" >> "$RESET_COMMAND_LOG"
printf 'health=ok\\nplatform=hermes-agent\\nversion=0.20.0\\nmanager_mode=%s\\n' "$RESET_FAKE_POSTCHECK_MODE"
if [ "$RESET_FAKE_POSTCHECK_MODE" = docker ]; then
  legacy=\${RESET_FAKE_LEGACY_DOCKER_PROCESS:-present}
  dashboard=\${RESET_FAKE_DASHBOARD_STATE:-running}
  printf 'docker=running\\ndashboard=%s\\nnative=inactive\\nlegacy_docker_process=%s\\n' "$dashboard" "$legacy"
else
  legacy=\${RESET_FAKE_LEGACY_DOCKER_PROCESS:-absent}
  dashboard=\${RESET_FAKE_DASHBOARD_STATE:-absent}
  printf 'docker=absent\\ndashboard=%s\\nnative=active\\nlegacy_docker_process=%s\\n' "$dashboard" "$legacy"
fi`,
  );
});

afterEach(() => {
  rmSync(fixture, { recursive: true, force: true });
});

describe("reset-hermes-runtime.sh", () => {
  test("documents its two explicit remote modes", () => {
    const result = run(["--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain("--mode docker|system-wide");
    expect(result.stdout.toString()).toContain("--no-backup");
  });

  test("rejects an unknown mode and shell-shaped target values", () => {
    expect(run(["--mode", "native", "--yes"]).exitCode).not.toBe(0);
    expect(
      run(["--mode", "docker", "--host", "vm;id", "--yes"]).exitCode,
    ).not.toBe(0);
    expect(
      run(["--mode", "docker", "--host-ip", "192.168.1.210;id", "--yes"])
        .exitCode,
    ).not.toBe(0);
  });

  test("requires explicit confirmation for a mutation", () => {
    const result = run(["--mode", "docker"]);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString()).toContain("--yes");
  });

  test("dry-run prints the selected transition without backup, Ansible or SSH", () => {
    const result = run(["--mode", "system-wide", "--dry-run"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain("deploy-hermes-native.yml");
    const log = readFileSync(commandLog, "utf8");
    expect(log).not.toContain("backup run");
    expect(log).not.toContain("ansible-playbook");
    expect(log).not.toContain("ssh ");
  });

  test("selects Docker with backup, guarded native stop and real postcheck", () => {
    const result = run(["--mode", "docker", "--yes"]);
    expect(result.exitCode).toBe(0);
    const log = readFileSync(commandLog, "utf8");
    expect(log).toContain("backup run 210");
    expect(log).toContain("deploy-hermes.yml");
    expect(log).toContain("allow_native_stop=true");
    expect(log).toMatch(
      /ansible-inventory -i \/tmp\/[^ ]+\.yml --host hermes-ephemeral-01/,
    );
    expect(log).toMatch(/ansible-playbook -i \/tmp\/[^ ]+\.yml/);
    expect(log).toContain("ssh hermes-ephemeral-01");
  });

  test("selects system-wide, removes Docker after health and verifies native state", () => {
    const result = run(["--mode", "system-wide", "--yes"], {
      RESET_FAKE_POSTCHECK_MODE: "native",
    });
    expect(result.exitCode).toBe(0);
    const log = readFileSync(commandLog, "utf8");
    expect(log).toContain("deploy-hermes-native.yml");
    expect(log).toContain("allow_managed_docker_stop=true");
    expect(log).toContain("remove_managed_docker_after_native_health=true");
  });

  test("supports an explicit no-backup fast replay", () => {
    const result = run(["--mode", "docker", "--no-backup", "--yes"]);
    expect(result.exitCode).toBe(0);
    expect(readFileSync(commandLog, "utf8")).not.toContain("backup run");
  });

  test("accepts a custom SSH alias without confusing it with the immutable VM name", () => {
    const result = run(
      ["--mode", "docker", "--host", "vm210", "--no-backup", "--yes"],
      { RESET_FAKE_INVENTORY_HOST: "vm210" },
    );
    expect(result.exitCode).toBe(0);
    const log = readFileSync(commandLog, "utf8");
    expect(log).toContain("--host vm210");
    expect(log).toContain("--limit vm210");
  });

  test("fails closed when VM identity or postconditions differ", () => {
    expect(
      run(["--mode", "docker", "--yes"], {
        RESET_FAKE_VM_NAME: "another-vm",
      }).exitCode,
    ).not.toBe(0);
    expect(
      run(["--mode", "system-wide", "--no-backup", "--yes"], {
        RESET_FAKE_POSTCHECK_MODE: "docker",
      }).exitCode,
    ).not.toBe(0);
    expect(
      run(["--mode", "system-wide", "--no-backup", "--yes"], {
        RESET_FAKE_POSTCHECK_MODE: "native",
        RESET_FAKE_LEGACY_DOCKER_PROCESS: "present",
      }).exitCode,
    ).not.toBe(0);
    expect(
      run(["--mode", "system-wide", "--no-backup", "--yes"], {
        RESET_FAKE_POSTCHECK_MODE: "native",
        RESET_FAKE_DASHBOARD_STATE: "running",
      }).exitCode,
    ).not.toBe(0);
  });
});
