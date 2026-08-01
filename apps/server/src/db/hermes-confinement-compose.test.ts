import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, test } from "bun:test";

const repositoryRoot = resolve(import.meta.dir, "../../../..");
const composeAvailable = spawnSync("docker", ["compose", "version"], { stdio: "ignore" }).status === 0;
const describeWithCompose = composeAvailable ? describe : describe.skip;
const fixtureDigest = "example.invalid/hermes:fixture@sha256:" + "a".repeat(64);

describeWithCompose("G1-002A managed Hermes Compose boundary", () => {
  test("renders a digest-pinned, non-root, private and resource-limited service", async () => {
    const directory = await mkdtemp(join(tmpdir(), "hermes-g1-002a-test-"));
    const secretFile = join(directory, "runtime-token");
    await writeFile(secretFile, "synthetic-token\n", { mode: 0o600 });
    try {
      const result = spawnSync(
        "docker",
        [
          "compose", "--env-file", "deploy/production.env.example",
          "-f", "compose.prod.yml", "-f", "compose.prod.hermes-managed.yml",
          "config", "--format", "json",
        ],
        {
          cwd: repositoryRoot,
          encoding: "utf8",
          env: {
            ...process.env,
            HERMES_IMAGE: fixtureDigest,
            HERMES_RUNTIME_TOKEN_FILE: secretFile,
          },
        },
      );
      expect(result.status, result.stderr).toBe(0);
      const config = JSON.parse(result.stdout) as {
        services: Record<string, {
          image?: string;
          user?: string;
          working_dir?: string;
          read_only?: boolean;
          security_opt?: string[];
          cap_drop?: string[];
          ports?: unknown[];
          volumes?: Array<{ type?: string; source?: string; target?: string; read_only?: boolean }>;
          networks?: Record<string, unknown>;
          cpus?: string | number;
          mem_limit?: string | number;
          pids_limit?: number;
          deploy?: { resources?: { limits?: { cpus?: string | number; memory?: string | number; pids?: number } } };
        }>;
        networks: Record<string, { internal?: boolean }>;
      };
      const hermes = config.services.hermes;
      expect(hermes).toMatchObject({
        image: fixtureDigest,
        user: "65532:65532",
        working_dir: "/work",
        read_only: true,
        pids_limit: 256,
      });
      expect(Number(hermes?.cpus)).toBe(2);
      expect(["1G", "1073741824", 1073741824]).toContain(hermes?.mem_limit ?? "");
      expect(hermes?.security_opt).toContain("no-new-privileges:true");
      expect(hermes?.cap_drop).toContain("ALL");
      expect(hermes?.ports ?? []).toHaveLength(0);
      expect(hermes?.networks).toHaveProperty("hermes-private");
      expect(config.networks["hermes-private"]?.internal).toBe(true);
      const limits = hermes?.deploy?.resources?.limits;
      expect(Number(limits?.cpus)).toBe(2);
      expect(["1G", "1073741824", 1073741824]).toContain(limits?.memory ?? "");
      expect(limits?.pids).toBe(256);
      const writable = (hermes?.volumes ?? []).filter((volume) => volume.read_only !== true);
      expect(writable).toEqual([{ type: "volume", source: "hermes-work", target: "/work" }]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("rejects an unpinned Hermes image in the executable proof contract", async () => {
    const directory = await mkdtemp(join(tmpdir(), "hermes-g1-002a-test-"));
    const secretFile = join(directory, "runtime-token");
    await writeFile(secretFile, "synthetic-token\n", { mode: 0o600 });
    try {
      const result = spawnSync(
        "bun",
        ["apps/server/scripts/prove-hermes-confinement.ts"],
        {
          cwd: repositoryRoot,
          encoding: "utf8",
          env: {
            ...process.env,
            HERMES_IMAGE: "example.invalid/hermes:latest",
            HERMES_CONFINEMENT_FIXTURE_IMAGE: fixtureDigest,
            HERMES_RUNTIME_TOKEN_FILE: secretFile,
            HERMES_CONFINEMENT_SKIP_PROBE: "1",
          },
        },
      );
      expect(result.status).not.toBe(0);
      expect(`${result.stdout}\n${result.stderr}`).toContain("digest-pinned");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
