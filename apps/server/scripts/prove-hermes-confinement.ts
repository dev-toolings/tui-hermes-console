import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const repositoryRoot = resolve(import.meta.dir, "../../..");
const productionCompose = resolve(repositoryRoot, "compose.prod.yml");
const hermesCompose = resolve(repositoryRoot, "compose.prod.hermes-managed.yml");
const projectPattern = /^hc-g1-002a-[0-9]+-[a-f0-9]{8}$/;
const digestPattern = /@sha256:[0-9a-f]{64}$/;

type ComposeService = {
  image?: string;
  user?: string;
  read_only?: boolean;
  security_opt?: string[];
  cap_drop?: string[];
  volumes?: Array<{ target?: string; read_only?: boolean; type?: string }>;
  tmpfs?: string[];
  networks?: string[] | Record<string, unknown>;
  ports?: unknown[];
  cpus?: string | number;
  mem_limit?: string | number;
  pids_limit?: number;
  deploy?: { resources?: { limits?: { cpus?: string | number; memory?: string | number; pids?: number } } };
};

type ComposeConfig = {
  services: Record<string, ComposeService>;
  networks?: Record<string, { internal?: boolean }>;
};

function fail(message: string): never {
  throw new Error(message);
}

function run(command: string, args: string[], options: { env?: NodeJS.ProcessEnv } = {}) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: { ...process.env, ...options.env },
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error) fail(`${command} ${args.join(" ")} failed: ${result.error.message}`);
  return result;
}

function docker(args: string[], options: { env?: NodeJS.ProcessEnv } = {}) {
  return run("docker", args, options);
}

function pinnedFixtureImage() {
  const configured = process.env.HERMES_CONFINEMENT_FIXTURE_IMAGE?.trim();
  if (configured) return configured;
  const result = docker(["image", "inspect", "hermes-console:local", "--format", "{{index .RepoDigests 0}}"]);
  if (result.status === 0 && result.stdout.trim()) return result.stdout.trim();
  fail("HERMES_CONFINEMENT_FIXTURE_IMAGE is required when hermes-console:local is unavailable");
}

function assertPinnedImage(image: string) {
  if (!digestPattern.test(image)) fail(`Hermes image is not digest-pinned: ${image}`);
}

function assertService(config: ComposeConfig) {
  const service = config.services.hermes;
  if (!service) fail("managed Compose overlay does not define services.hermes");
  if (!service.image || !digestPattern.test(service.image)) fail("Hermes image is not digest-pinned");
  if (service.user !== "65532:65532") fail(`Hermes user must be non-root 65532:65532, got ${service.user}`);
  if (service.read_only !== true) fail("Hermes root filesystem must be read-only");
  if (!service.security_opt?.includes("no-new-privileges:true")) fail("no-new-privileges is missing");
  if (!service.cap_drop?.includes("ALL")) fail("all Linux capabilities must be dropped");
  if (service.ports && service.ports.length > 0) fail("Hermes must not publish a host port");
  if (Number(service.cpus) !== 2 || !memoryLimitIs(service.mem_limit) || service.pids_limit !== 256) {
    fail("Hermes resource limits are not explicit");
  }
  const limits = service.deploy?.resources?.limits;
  if (Number(limits?.cpus) !== 2 || !memoryLimitIs(limits?.memory) || limits.pids !== 256) {
    fail("Hermes deploy resource limits are not explicit");
  }
  const writablePersistent = (service.volumes ?? []).filter((volume) => volume.read_only !== true);
  if (writablePersistent.length !== 1 || writablePersistent[0]?.target !== "/work") {
    fail("only /work may be a persistent writable Hermes mount");
  }
  if (service.networks !== undefined && !Object.keys(service.networks).includes("hermes-private")) {
    fail("Hermes is not attached to hermes-private");
  }
  if (config.networks?.["hermes-private"]?.internal !== true) fail("hermes-private must be internal");
}

function memoryLimitIs(value: string | number | undefined) {
  return value === "1G" || value === "1073741824" || value === 1073741824;
}

function composeConfig(env: NodeJS.ProcessEnv) {
  const result = run("docker", [
    "compose", "--env-file", "deploy/production.env.example",
    "-f", productionCompose, "-f", hermesCompose, "config", "--format", "json",
  ], { env });
  if (result.status !== 0) fail(`docker compose config failed: ${result.stderr || result.stdout}`);
  try {
    return JSON.parse(result.stdout) as ComposeConfig;
  } catch (error) {
    fail(`docker compose config returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function ensureProject(project: string) {
  if (!projectPattern.test(project)) fail(`invalid proof project name: ${project}`);
}

function probeFixture(image: string) {
  const name = `hc-g1-002a-probe-${process.pid}`;
  const args = [
    "run", "--rm", "--name", name,
    "--read-only", "--user", "65532:65532", "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges:true",
    "--tmpfs", "/tmp:size=64m,mode=1777",
    "--tmpfs", "/run:size=16m,mode=755",
    "--mount", "type=tmpfs,destination=/work",
    "--entrypoint", "/bin/sh", image, "-ec",
    [
      "touch /work/g1-002a-write && rm /work/g1-002a-write",
      "if touch /etc/g1-002a-rootfs 2>/dev/null; then echo rootfs-write-unexpected; exit 21; else echo rootfs-write-refused; fi",
      "if cat /var/run/docker.sock >/dev/null 2>&1; then echo docker-socket-open; exit 22; else echo docker-socket-refused; fi",
      "if test -e /host-secret; then echo host-path-visible; exit 23; else echo host-path-refused; fi",
      "if test -e /run/secrets/other-workflow; then echo cross-workflow-secret-visible; exit 24; else echo cross-workflow-secret-refused; fi",
    ].join("; "),
  ];
  const result = docker(args);
  if (result.status !== 0) fail(`confinement fixture probe failed: ${result.stderr || result.stdout}`);
  const output = result.stdout;
  for (const marker of ["rootfs-write-refused", "docker-socket-refused", "host-path-refused", "cross-workflow-secret-refused"]) {
    if (!output.includes(marker)) fail(`missing refusal marker: ${marker}`);
  }
  return output.trim().split("\n");
}

async function main() {
  if (docker(["compose", "version"], {}).status !== 0) fail("Docker Compose unavailable; G1-002A proof not executed");
  const fixtureImage = pinnedFixtureImage();
  const image = process.env.HERMES_IMAGE?.trim() || fixtureImage;
  assertPinnedImage(image);
  const tokenDir = await mkdtemp(join(tmpdir(), "hermes-g1-002a-"));
  const tokenFile = join(tokenDir, "runtime-token");
  await writeFile(tokenFile, "synthetic-g1-002a-token\n", { mode: 0o600 });
  const project = `hc-g1-002a-${process.pid}-${Math.random().toString(16).slice(2, 10)}`;
  ensureProject(project);
  try {
    const config = composeConfig({
      HERMES_IMAGE: image,
      HERMES_RUNTIME_TOKEN_FILE: tokenFile,
      COMPOSE_PROJECT_NAME: project,
    });
    assertService(config);
    let refusalMarkers: string[] = [];
    if (process.env.HERMES_CONFINEMENT_SKIP_PROBE !== "1") {
      if (docker(["info"], {}).status !== 0) fail("Docker daemon unavailable; G1-002A proof not executed");
      refusalMarkers = probeFixture(fixtureImage);
    }
    process.stdout.write(JSON.stringify({
      status: "PASS",
      scope: "local-fixture-manifest-and-refusals",
      image,
      project,
      refusalMarkers,
      limitations: ["not a real Hermes image", "not P-SEC/P-OPS/P-E2E", "no remote runtime mutation"],
    }) + "\n");
  } finally {
    await rm(tokenDir, { recursive: true, force: true });
  }
}

await main();
