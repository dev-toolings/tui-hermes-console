import { spawnSync } from "node:child_process";

import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dir, "../../..");
const digestPattern = /@sha256:[0-9a-f]{64}$/;
const expectedVersion = process.env.HERMES_EXPECTED_VERSION?.trim() || "0.19.0";
const image = process.env.HERMES_REAL_IMAGE?.trim();

type ImageConfig = {
  User?: string;
  Entrypoint?: string[];
  WorkingDir?: string;
  Volumes?: Record<string, unknown>;
};

type CommandResult = {
  status: number;
  stdout: string;
  stderr: string;
};

function run(command: string, args: string[]): CommandResult {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.error ? `${result.stderr ?? ""}\n${result.error.message}` : result.stderr ?? "",
  };
}

function docker(args: string[]) {
  return run("docker", args);
}

function output(result: CommandResult) {
  return `${result.stdout}\n${result.stderr}`.trim();
}

function requireImage() {
  if (!image) {
    throw new Error("HERMES_REAL_IMAGE doit être une référence image@sha256:digest.");
  }
  if (!digestPattern.test(image)) {
    throw new Error(`Image Hermes non pinnée : ${image}`);
  }
}

function ensureImage() {
  const inspected = docker(["image", "inspect", image!, "--format", "{{json .Config}}"]); // image is checked above
  if (inspected.status === 0) return;
  if (process.env.HERMES_REAL_PULL !== "1") {
    throw new Error(`Image absente localement; relancer avec HERMES_REAL_PULL=1 : ${output(inspected)}`);
  }
  const pulled = docker(["pull", "--platform", "linux/amd64", image!]);
  if (pulled.status !== 0) throw new Error(`Pull Hermes échoué : ${output(pulled)}`);
}

function inspectImage(): ImageConfig {
  const inspected = docker(["image", "inspect", image!, "--format", "{{json .Config}}"]);
  if (inspected.status !== 0) throw new Error(`Inspection image échouée : ${output(inspected)}`);
  return JSON.parse(inspected.stdout) as ImageConfig;
}

function runVersionProbe() {
  return docker([
    "run", "--rm", "--platform", "linux/amd64",
    "--read-only", "--user", "root",
    "--cap-drop", "ALL", "--cap-add", "SETUID", "--cap-add", "SETGID",
    "--security-opt", "no-new-privileges:true",
    "--tmpfs", "/tmp:size=64m,mode=1777",
    "--tmpfs", "/run:size=16m,mode=755",
    "--mount", "type=tmpfs,destination=/opt/data,tmpfs-mode=0777",
    "--entrypoint", "/opt/hermes/bin/hermes", image!, "version",
  ]);
}

function runOverlayProbe() {
  return docker([
    "run", "--rm", "--platform", "linux/amd64",
    "--read-only", "--user", "65532:65532", "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges:true",
    "--tmpfs", "/tmp:size=64m,mode=1777",
    "--tmpfs", "/run:size=16m,mode=755",
    "--mount", "type=tmpfs,destination=/opt/data,tmpfs-mode=0777",
    "--mount", "type=tmpfs,destination=/work,tmpfs-mode=0777",
    image!, "version",
  ]);
}

function runSandboxProbe() {
  return docker([
    "run", "--rm", "--platform", "linux/amd64",
    "--read-only", "--user", "10000:10000", "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges:true",
    "--tmpfs", "/tmp:size=64m,mode=1777",
    "--tmpfs", "/run:size=16m,mode=755",
    "--mount", "type=tmpfs,destination=/opt/data,tmpfs-mode=0777",
    "--mount", "type=tmpfs,destination=/work,tmpfs-mode=0777",
    "--entrypoint", "/bin/sh", image!, "-ec",
    [
      "id -u | grep -qx 10000",
      "touch /work/g1-002b-write && rm /work/g1-002b-write",
      "if touch /etc/g1-002b-rootfs 2>/dev/null; then exit 21; fi",
      "if test -e /var/run/docker.sock; then exit 22; fi",
      "if test -e /host-secret; then exit 23; fi",
      "if test -e /run/secrets/other-workflow; then exit 24; fi",
    ].join("; "),
  ]);
}

function runPersistenceProbe() {
  const volume = `hc-g1-002b-${process.pid}-${Math.random().toString(16).slice(2, 10)}`;
  const created = docker(["volume", "create", volume]);
  if (created.status !== 0) return { volume, first: created, second: created };
  try {
    const first = docker([
      "run", "--rm", "--platform", "linux/amd64", "--user", "10000:10000",
      "--mount", `type=volume,src=${volume},dst=/opt/data`,
      "--entrypoint", "/bin/sh", image!, "-ec", "printf g1-002b-marker > /opt/data/.g1-002b-marker",
    ]);
    const second = docker([
      "run", "--rm", "--platform", "linux/amd64", "--user", "10000:10000",
      "--mount", `type=volume,src=${volume},dst=/opt/data`,
      "--entrypoint", "/bin/sh", image!, "-ec", "test \"$(cat /opt/data/.g1-002b-marker)\" = g1-002b-marker",
    ]);
    return { volume, first, second };
  } finally {
    docker(["volume", "rm", "--force", volume]);
  }
}

function main() {
  requireImage();
  ensureImage();
  const config = inspectImage();
  const versionProbe = runVersionProbe();
  const overlayProbe = runOverlayProbe();
  const sandboxProbe = runSandboxProbe();
  const persistence = runPersistenceProbe();
  const versionText = output(versionProbe);
  const version = versionText.match(/Hermes Agent v([0-9]+\.[0-9]+\.[0-9]+)/)?.[1] ?? null;
  const failures = [
    ...(config.User !== "65532:65532" ? [`image user is ${config.User ?? "unset"}, expected 65532:65532`] : []),
    ...(config.WorkingDir !== "/work" ? [`image working directory is ${config.WorkingDir ?? "unset"}, expected /work`] : []),
    ...(version !== expectedVersion ? [`image reports v${version ?? "unknown"}, expected v${expectedVersion}`] : []),
    ...(overlayProbe.status === 0 ? [] : ["current Compose security contract cannot start the real image"]),
    ...(sandboxProbe.status === 0 ? [] : ["real image sandbox refusal probe failed"]),
    ...(persistence.first.status === 0 && persistence.second.status === 0 ? [] : ["real /opt/data persistence probe failed"]),
  ];
  const status = failures.length === 0 ? "PASS" : "BLOCKED";
  const report = {
    status,
    image,
    expectedVersion,
    observedVersion: version,
    config: {
      user: config.User ?? null,
      entrypoint: config.Entrypoint ?? null,
      workingDir: config.WorkingDir ?? null,
      volumes: Object.keys(config.Volumes ?? {}),
    },
    probes: {
      version: { status: versionProbe.status, output: versionText.slice(-1200) },
      composeOverlay: { status: overlayProbe.status, output: output(overlayProbe).slice(-1200) },
      sandbox: { status: sandboxProbe.status, output: output(sandboxProbe).slice(-1200) },
      persistence: {
        firstStatus: persistence.first.status,
        secondStatus: persistence.second.status,
      },
    },
    failures,
    limitations: [
      "local Docker proof only",
      "no Hermes model/provider call",
      "no P-SEC independent review",
      "no P-OPS production deployment",
      "no Gate 1 acceptance",
    ],
  };
  process.stdout.write(`${JSON.stringify(report)}\n`);
  if (status !== "PASS") process.exitCode = 1;
}

main();
