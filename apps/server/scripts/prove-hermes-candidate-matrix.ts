import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dir, "../../..");
const digestPattern = /@sha256:[0-9a-f]{64}$/;
const image = process.env.HERMES_REAL_IMAGE?.trim() ?? "";
const expectedVersion = process.env.HERMES_EXPECTED_VERSION?.trim() || "0.19.0";

export const CANDIDATE_PROFILES = [
  { id: "contract", user: "65532:65532", workdir: "/work", writableTarget: "/work", role: "console-contract" },
  { id: "upstream", user: "10000:10000", workdir: "/opt/data", writableTarget: "/opt/data", role: "upstream-hermes" },
  { id: "root-bootstrap", user: "root", workdir: "/opt/data", writableTarget: "/opt/data", role: "bootstrap-observation", bootstrapEntrypoint: "image-default" },
] as const;

export type CandidateProbeResult = {
  profile: string;
  probePassed: boolean;
  versionMatchesExpected?: boolean;
  observedVersion?: string | null;
  versionStatus?: number;
  sandboxStatus?: number;
  persistenceStatus?: number;
  bootstrapStatus?: number;
  effectiveUid?: string | null;
  cleanupFailed?: boolean;
  output?: string;
  failures?: string[];
};

export function deriveCandidateVerdict(
  probes: CandidateProbeResult[],
) {
  const probePassed = probes.length === CANDIDATE_PROFILES.length && probes.every((probe) => probe.probePassed);
  const versionCompatible = probes.length === CANDIDATE_PROFILES.length &&
    probes.every((probe) => probe.versionMatchesExpected !== false);
  return {
    verdict: probePassed && versionCompatible ? "DECISION_REQUIRED" : "BLOCKED",
    probePassed,
    promotionAllowed: false,
    decisionApproved: false,
  } as const;
}

type CommandResult = { status: number; stdout: string; stderr: string };

function run(command: string, args: string[]): CommandResult {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.error ? (result.error.message + "\n" + (result.stderr ?? "")) : (result.stderr ?? ""),
  };
}

function docker(args: string[]) {
  return run("docker", args);
}

function text(result: CommandResult) {
  return (result.stdout + "\n" + result.stderr).trim();
}

function volumeName(profile: string) {
  return "hc-g1-002c-" + profile + "-" + process.pid + "-" + Math.random().toString(16).slice(2, 10);
}

function runVersionProbe(profile: (typeof CANDIDATE_PROFILES)[number]) {
  if (profile.id === "root-bootstrap") return runBootstrapProbe();
  const args = [
    "run", "--rm", "--platform", "linux/amd64", "--read-only",
    "--user", profile.user, "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges:true",
    "--tmpfs", "/tmp:size=64m,mode=1777",
    "--tmpfs", "/run:size=16m,mode=755",
    "--mount", "type=tmpfs,destination=" + profile.writableTarget + ",tmpfs-mode=0777",
    "--workdir", profile.workdir,
    "--entrypoint", "/opt/hermes/bin/hermes", image, "version",
  ];
  return docker(args);
}

function runBootstrapProbe() {
  const name = "hc-g1-002c-bootstrap-" + process.pid + "-" + Math.random().toString(16).slice(2, 10);
  const started = docker([
    "run", "--detach", "--name", name, "--platform", "linux/amd64", "--read-only",
    "--user", "root", "--cap-drop", "ALL", "--cap-add", "SETUID", "--cap-add", "SETGID",
    "--security-opt", "no-new-privileges:true",
    "--tmpfs", "/tmp:size=64m,mode=1777", "--tmpfs", "/run:size=16m,mode=755",
    "--mount", "type=tmpfs,destination=/opt/data,tmpfs-mode=0777",
    image,
  ]);
  if (started.status !== 0) return started;
  try {
    spawnSync("sleep", ["2"], { cwd: repositoryRoot });
    const state = docker(["inspect", name, "--format", "{{.State.Status}}:{{.State.ExitCode}}"]);
    const logs = docker(["logs", name]);
    const top = docker(["top", name, "-eo", "uid,pid,comm,args"]);
    const stateText = text(state);
    return {
      status: state.status === 0 && /:0$/.test(stateText) ? 0 : 1,
      stdout: "state=" + text(state) + "\nlogs=\n" + text(logs) + "\ntop=\n" + text(top),
      stderr: state.status === 0 ? "" : text(state),
    };
  } finally {
    docker(["rm", "--force", name]);
  }
}

function runSandboxProbe(profile: (typeof CANDIDATE_PROFILES)[number]) {
  const args = [
    "run", "--rm", "--platform", "linux/amd64", "--read-only",
    "--user", profile.user, "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges:true",
    "--tmpfs", "/tmp:size=64m,mode=1777",
    "--tmpfs", "/run:size=16m,mode=755",
    "--mount", "type=tmpfs,destination=" + profile.writableTarget + ",tmpfs-mode=0777",
    "--workdir", profile.workdir,
    "--entrypoint", "/bin/sh", image, "-ec",
    "id -u; touch " + profile.writableTarget + "/g1-002c-write; " +
      "if touch /etc/g1-002c-rootfs 2>/dev/null; then exit 21; fi; " +
      "if test -e /var/run/docker.sock; then exit 22; fi; " +
      "if test -e /host-secret; then exit 23; fi; " +
      "if test -e /run/secrets/other-workflow; then exit 24; fi",
  ];
  return docker(args);
}

function runPersistenceProbe(profile: (typeof CANDIDATE_PROFILES)[number]) {
  const volume = volumeName(profile.id);
  const created = docker(["volume", "create", volume]);
  if (created.status !== 0) return { status: created.status, output: text(created) };
  let resultStatus = 1;
  let resultOutput = "";
  try {
    const first = docker([
      "run", "--rm", "--platform", "linux/amd64", "--read-only", "--user", profile.user,
      "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true",
      "--mount", "type=volume,src=" + volume + ",dst=" + profile.writableTarget,
      "--workdir", profile.workdir, "--entrypoint", "/bin/sh", image, "-ec",
      "printf g1-002c-marker > " + profile.writableTarget + "/.g1-002c-marker",
    ]);
    const second = docker([
      "run", "--rm", "--platform", "linux/amd64", "--read-only", "--user", profile.user,
      "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true",
      "--mount", "type=volume,src=" + volume + ",dst=" + profile.writableTarget,
      "--workdir", profile.workdir, "--entrypoint", "/bin/sh", image, "-ec",
      "test \"$(cat " + profile.writableTarget + "/.g1-002c-marker)\" = g1-002c-marker",
    ]);
    resultStatus = first.status === 0 && second.status === 0 ? 0 : 1;
    resultOutput = text(second);
  } finally {
    const removed = docker(["volume", "rm", "--force", volume]);
    if (removed.status !== 0) {
      resultStatus = 1;
      resultOutput += "\ncleanupFailed=" + text(removed);
    }
  }
  return { status: resultStatus, output: resultOutput, cleanupFailed: resultStatus !== 0 && resultOutput.includes("cleanupFailed=") };
}

function inspectImage() {
  const result = docker(["image", "inspect", image, "--format", "{{json .Config}}"]);
  if (result.status !== 0) throw new Error("Image absente localement; utilisez HERMES_REAL_PULL=1 avec une référence digestée.");
  return JSON.parse(result.stdout) as {
    User?: string;
    Entrypoint?: string[];
    WorkingDir?: string;
    Volumes?: Record<string, unknown>;
  };
}

function pullImage() {
  if (docker(["image", "inspect", image, "--format", "{{.Id}}"]).status === 0) return;
  if (process.env.HERMES_REAL_PULL !== "1") {
    throw new Error("Image absente localement; HERMES_REAL_PULL=1 est requis pour tirer explicitement le digest.");
  }
  const pulled = docker(["pull", "--platform", "linux/amd64", image]);
  if (pulled.status !== 0) throw new Error("Pull de l’image digestée échoué: " + text(pulled));
}

function main() {
  if (!image || !digestPattern.test(image)) throw new Error("HERMES_REAL_IMAGE doit être une référence image@sha256:digest.");
  if (docker(["info"]).status !== 0) throw new Error("Docker est requis pour G1-002C.");
  pullImage();
  const config = inspectImage();
  const reports: CandidateProbeResult[] = CANDIDATE_PROFILES.map((profile) => {
    const version = runVersionProbe(profile);
    const sandbox = runSandboxProbe(profile);
    const persistence = runPersistenceProbe(profile);
    const failures: string[] = [];
    if (version.status !== 0) failures.push("version probe failed");
    if (sandbox.status !== 0) failures.push("sandbox probe failed");
    if (persistence.status !== 0) failures.push("persistence probe failed");
    const versionText = text(version);
    const observedVersion = versionText.match(/Hermes Agent v([0-9]+\.[0-9]+\.[0-9]+)/)?.[1] ?? null;
    const versionMatchesExpected = observedVersion === expectedVersion;
    if (!versionMatchesExpected) failures.push("observed version does not match the PRD reference");
    if (profile.id === "contract" && (config.User !== "65532:65532" || config.WorkingDir !== "/work")) {
      failures.push("upstream OCI config does not match the Console contract");
    }
    return {
      profile: profile.id,
      probePassed: failures.length === 0,
      observedVersion,
      versionMatchesExpected,
      versionStatus: version.status,
      sandboxStatus: sandbox.status,
      persistenceStatus: persistence.status,
      bootstrapStatus: profile.id === "root-bootstrap" ? version.status : undefined,
      effectiveUid: sandbox.stdout.trim().split(/\s+/)[0] || null,
      cleanupFailed: persistence.cleanupFailed,
      output: (versionText + "\n" + text(sandbox)).slice(-2000),
      failures,
    };
  });
  const verdict = deriveCandidateVerdict(reports);
  const report = {
    image,
    expectedVersion,
    observedConfig: {
      user: config.User ?? null,
      workingDir: config.WorkingDir ?? null,
      entrypoint: config.Entrypoint ?? null,
      volumes: Object.keys(config.Volumes ?? {}),
    },
    profiles: reports,
    ...verdict,
    limitations: [
      "candidate matrix is local Docker only",
      "no production Compose or image was modified",
      "root-bootstrap is observation only, never a confinement acceptance",
      "P-SEC/P-OPS/P-E2E and Gate 1 remain open",
    ],
  };
  process.stdout.write(JSON.stringify(report) + "\n");
  process.exitCode = 1;
}

if (import.meta.main) {
  try {
    main();
  } catch (error) {
    process.stdout.write(JSON.stringify({
      verdict: "BLOCKED",
      promotionAllowed: false,
      reason: error instanceof Error ? error.message : String(error),
      limitations: ["candidate matrix did not complete; no promotion is possible"],
    }) + "\n");
    process.exitCode = 1;
  }
}
