import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";

const repositoryRoot = resolve(import.meta.dir, "../../../..");
const composeAvailable = spawnSync("docker", ["compose", "version"], {
  stdio: "ignore",
}).status === 0;

const describeWithCompose = composeAvailable ? describe : describe.skip;
if (!composeAvailable) test.skip("Docker Compose indisponible", () => undefined);

describeWithCompose("production Compose secret boundaries", () => {
  test("documents a forced first upgrade that stops the owner-privileged API", () => {
    const guide = readFileSync(resolve(repositoryRoot, "deploy/README.md"), "utf8");
    expect(guide).toContain(
      "docker compose --env-file deploy/production.env -f compose.prod.yml stop console caddy",
    );
    expect(guide).toContain(
      "docker compose --env-file deploy/production.env -f compose.prod.yml up -d --build --force-recreate",
    );
    expect(guide).toContain("Never use `--no-recreate`");
    expect(guide).toContain("never run `docker compose run\nmigrate` on its own");
  });

  test("injects owner credentials only into postgres and the one-shot migrator", () => {
    const result = spawnSync(
      "docker",
      [
        "compose",
        "--env-file",
        "deploy/production.env.example",
        "-f",
        "compose.prod.yml",
        "config",
        "--format",
        "json",
      ],
      { cwd: repositoryRoot, encoding: "utf8" },
    );
    expect(result.status, result.stderr).toBe(0);
    const config = JSON.parse(result.stdout) as {
      services: Record<string, { environment?: Record<string, string> }>;
    };
    const environment = (service: string) => config.services[service]?.environment ?? {};
    const ownerSecrets = ["DATABASE_OWNER_URL", "POSTGRES_PASSWORD"];

    expect(Object.keys(environment("postgres")).sort()).toEqual([
      "POSTGRES_DB",
      "POSTGRES_PASSWORD",
      "POSTGRES_USER",
    ]);
    expect(environment("migrate").DATABASE_OWNER_URL).toContain("postgres://hermes:");
    expect(environment("console").DATABASE_URL).toContain("postgres://hermes_runtime:");
    expect(Object.keys(environment("caddy"))).toEqual(["CONSOLE_SITE_ADDRESS"]);
    for (const service of ["console", "caddy"]) {
      for (const secret of ownerSecrets) expect(environment(service)[secret]).toBeUndefined();
      expect(environment(service).POSTGRES_RUNTIME_PASSWORD).toBeUndefined();
    }
    expect(environment("postgres").DATABASE_OWNER_URL).toBeUndefined();
    expect(environment("postgres").DATABASE_URL).toBeUndefined();
  });

  test("keeps the dedicated SSH material opt-in and read-only", () => {
    const result = spawnSync(
      "docker",
      [
        "compose",
        "--env-file",
        "deploy/production.env.example",
        "-f",
        "compose.prod.yml",
        "-f",
        "compose.prod.ssh.yml",
        "config",
        "--format",
        "json",
      ],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
        env: { ...process.env, CONSOLE_SSH_DIR: resolve(repositoryRoot, "deploy/ssh") },
      },
    );
    expect(result.status, result.stderr).toBe(0);
    const config = JSON.parse(result.stdout) as {
      services: Record<string, {
        environment?: Record<string, string>;
        volumes?: Array<{ type?: string; source?: string; target?: string; read_only?: boolean }>;
      }>;
    };
    const sshVolume = config.services.console?.volumes?.find(
      (volume) => volume.target === "/home/bun/.ssh",
    );
    expect(sshVolume).toMatchObject({
      type: "bind",
      read_only: true,
      target: "/home/bun/.ssh",
    });
    expect(sshVolume?.source).toEndWith("/deploy/ssh");
    expect(config.services.console?.environment?.HERMES_SSH_KNOWN_HOSTS_FILE).toBe(
      "/home/bun/.ssh/known_hosts",
    );
  });
});
