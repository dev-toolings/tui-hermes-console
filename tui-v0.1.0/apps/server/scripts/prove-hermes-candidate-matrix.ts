import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dir, "../../..");
const digestPattern = /@(sha256:[0-9a-f]{64})$/;
const digestValuePattern = /^sha256:[0-9a-f]{64}$/;
const versionPattern = /^[0-9]+\.[0-9]+\.[0-9]+$/;
const selectionRefPattern = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const image = process.env.HERMES_REAL_IMAGE?.trim() ?? "";
const expectedVersion = process.env.HERMES_EXPECTED_VERSION?.trim() ?? "";

export const CANDIDATE_EXIT_CODES = {
  READY: 0,
  BLOCKED: 1,
  DECISION_REQUIRED: 2,
  ASSERTION_MISMATCH: 2,
  SELECTED_NOT_DEPLOYABLE: 3,
  INVALID_INPUT: 64,
} as const;

export class InvalidCandidateInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidCandidateInputError";
  }
}

type CandidateEnvironment = Readonly<Record<string, string | undefined>>;

export type TargetContract = {
  uid: number;
  gid: number;
  user: string;
  workdir: string;
  writableTarget: string;
};

export type CandidateProfile = {
  id: "target-contract" | "production-reference" | "root-bootstrap";
  uid: number;
  gid: number;
  user: string;
  workdir: string;
  writableTarget: string;
  role: string;
  bootstrapEntrypoint?: "image-default";
};

export type CandidateProbeObservations = {
  ociConfig: {
    user?: string | null;
    workingDir?: string | null;
  };
  versionStatus: number;
  versionOutput: string;
  sandboxStatus: number;
  sandboxOutput: string;
  sandboxInspectionStatus: number;
  sandboxDaemonUser: string | null;
  sandboxDaemonWorkingDir: string | null;
  sandboxCleanupFailed?: boolean;
  persistenceStatus: number;
  persistenceOutput: string;
  cleanupFailed?: boolean;
};

export type CandidateProbeResult = {
  profile: CandidateProfile["id"];
  probePassed: boolean;
  versionMatchesExpected: boolean;
  observedVersion: string | null;
  versionStatus: number;
  sandboxStatus: number;
  persistenceStatus: number;
  bootstrapStatus?: number;
  effectiveUid: number | null;
  effectiveGid: number | null;
  effectiveWorkdir: string | null;
  cleanupFailed: boolean;
  sandboxCleanupFailed: boolean;
  persistenceCleanupFailed: boolean;
  sandboxDaemon: {
    inspectionStatus: number;
    user: string | null;
    workingDir: string | null;
  };
  ociConfig: {
    user: string | null;
    workingDir: string | null;
    userMatchesProfile: boolean;
    workdirMatchesProfile: boolean;
  };
  output: string;
  failures: string[];
};

export type OperatorSelection = {
  source: "environment";
  digest: string | null;
  version: string | null;
  reference: string | null;
  matched: boolean;
  authenticated: false;
};

function positiveInteger(value: string, variable: string) {
  if (!/^[1-9][0-9]*$/.test(value)) {
    throw new InvalidCandidateInputError(`${variable} doit être un entier strictement positif.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new InvalidCandidateInputError(`${variable} dépasse la plage des entiers sûrs.`);
  }
  return parsed;
}

function absoluteContainerPath(value: string | undefined, fallback: string, variable: string) {
  const path = value === undefined ? fallback : value.trim();
  const segments = path.split("/").slice(1);
  if (!path.startsWith("/") || path.length === 1 || segments.some((segment) => !segment || segment === ".." || !/^[A-Za-z0-9._-]+$/.test(segment))) {
    throw new InvalidCandidateInputError(`${variable} doit être un chemin absolu de conteneur sans segment parent.`);
  }
  return path;
}

export function resolveTargetContract(environment: CandidateEnvironment = process.env): TargetContract {
  const rawUid = environment.HERMES_TARGET_UID;
  const rawGid = environment.HERMES_TARGET_GID;
  if ((rawUid === undefined) !== (rawGid === undefined)) {
    throw new InvalidCandidateInputError("HERMES_TARGET_UID et HERMES_TARGET_GID doivent être fournis ensemble.");
  }

  const uid = rawUid === undefined ? 65532 : positiveInteger(rawUid.trim(), "HERMES_TARGET_UID");
  const gid = rawGid === undefined ? 65532 : positiveInteger(rawGid.trim(), "HERMES_TARGET_GID");
  return {
    uid,
    gid,
    user: `${uid}:${gid}`,
    workdir: absoluteContainerPath(environment.HERMES_TARGET_WORKDIR, "/work", "HERMES_TARGET_WORKDIR"),
    writableTarget: absoluteContainerPath(environment.HERMES_TARGET_WRITABLE_PATH, "/work", "HERMES_TARGET_WRITABLE_PATH"),
  };
}

export function createCandidateProfiles(target: TargetContract): CandidateProfile[] {
  return [
    { id: "target-contract", uid: target.uid, gid: target.gid, user: target.user, workdir: target.workdir, writableTarget: target.writableTarget, role: "console-target" },
    { id: "production-reference", uid: 10000, gid: 10000, user: "10000:10000", workdir: "/opt/data", writableTarget: "/opt/data", role: "upstream-production" },
    { id: "root-bootstrap", uid: 0, gid: 0, user: "0:0", workdir: "/opt/data", writableTarget: "/opt/data", role: "bootstrap-observation", bootstrapEntrypoint: "image-default" },
  ];
}

export const CANDIDATE_PROFILES = createCandidateProfiles(resolveTargetContract({}));

export function classifyCandidateProbe(
  profile: CandidateProfile,
  expected: string,
  observations: CandidateProbeObservations,
): CandidateProbeResult {
  const failures: string[] = [];
  if (observations.versionStatus !== 0) failures.push(`version probe failed with status ${observations.versionStatus}`);
  if (observations.sandboxStatus !== 0) failures.push(`sandbox probe failed with status ${observations.sandboxStatus}`);
  if (observations.sandboxInspectionStatus !== 0) failures.push(`sandbox daemon inspection failed with status ${observations.sandboxInspectionStatus}`);
  if (observations.sandboxCleanupFailed) failures.push("sandbox cleanup failed");
  if (observations.persistenceStatus !== 0) failures.push(`persistence probe failed with status ${observations.persistenceStatus}`);
  if (observations.cleanupFailed) failures.push("persistence cleanup failed");

  const observedVersion = observations.versionOutput.match(/Hermes Agent v([0-9]+\.[0-9]+\.[0-9]+)/)?.[1] ?? null;
  const versionMatchesExpected = observedVersion === expected;
  if (observedVersion === null) {
    failures.push("Hermes Agent version was not observed");
  } else if (!versionMatchesExpected) {
    failures.push(`observed version ${observedVersion} does not match expected ${expected}`);
  }

  const daemonUser = observations.sandboxDaemonUser;
  const daemonIdentity = daemonUser?.match(/^([0-9]+):([0-9]+)$/) ?? null;
  const effectiveUid = daemonIdentity ? Number(daemonIdentity[1]) : null;
  const effectiveGid = daemonIdentity ? Number(daemonIdentity[2]) : null;
  const effectiveWorkdir = observations.sandboxDaemonWorkingDir;
  if (!daemonIdentity) {
    failures.push(`sandbox daemon user ${daemonUser ?? "missing"} is not a numeric UID:GID`);
  } else {
    if (effectiveUid !== profile.uid) failures.push(`effective UID ${effectiveUid} does not match expected ${profile.uid}`);
    if (effectiveGid !== profile.gid) failures.push(`effective GID ${effectiveGid} does not match expected ${profile.gid}`);
  }
  if (effectiveWorkdir === null) {
    failures.push("sandbox daemon workdir is missing");
  } else if (effectiveWorkdir !== profile.workdir) {
    failures.push(`effective workdir ${effectiveWorkdir} does not match expected ${profile.workdir}`);
  }

  const ociUser = observations.ociConfig.user ?? null;
  const ociWorkingDir = observations.ociConfig.workingDir ?? null;
  return {
    profile: profile.id,
    probePassed: failures.length === 0,
    versionMatchesExpected,
    observedVersion,
    versionStatus: observations.versionStatus,
    sandboxStatus: observations.sandboxStatus,
    persistenceStatus: observations.persistenceStatus,
    bootstrapStatus: profile.id === "root-bootstrap" ? observations.versionStatus : undefined,
    effectiveUid,
    effectiveGid,
    effectiveWorkdir,
    cleanupFailed: observations.sandboxCleanupFailed === true || observations.cleanupFailed === true,
    sandboxCleanupFailed: observations.sandboxCleanupFailed === true,
    persistenceCleanupFailed: observations.cleanupFailed === true,
    sandboxDaemon: {
      inspectionStatus: observations.sandboxInspectionStatus,
      user: daemonUser,
      workingDir: observations.sandboxDaemonWorkingDir,
    },
    ociConfig: {
      user: ociUser,
      workingDir: ociWorkingDir,
      userMatchesProfile: ociUser === profile.user,
      workdirMatchesProfile: ociWorkingDir === profile.workdir,
    },
    output: (observations.versionOutput + "\n" + observations.sandboxOutput + "\n" + observations.persistenceOutput).trim().slice(-2000),
    failures,
  };
}

function emptyOperatorSelection(): OperatorSelection {
  return {
    source: "environment",
    digest: null,
    version: null,
    reference: null,
    matched: false,
    authenticated: false,
  };
}

export function resolveOperatorSelection(
  environment: CandidateEnvironment,
  candidate: { image: string; expectedVersion: string },
): OperatorSelection {
  const rawDigest = environment.HERMES_OPERATOR_SELECTED_DIGEST;
  const rawVersion = environment.HERMES_OPERATOR_SELECTED_VERSION;
  const rawReference = environment.HERMES_OPERATOR_SELECTION_REF;
  const supplied = [rawDigest, rawVersion, rawReference].map((value) => value !== undefined);
  if (supplied.every((value) => !value)) return emptyOperatorSelection();
  if (!supplied.every(Boolean)) {
    throw new InvalidCandidateInputError("Les trois assertions HERMES_OPERATOR_* doivent être absentes ou présentes ensemble.");
  }

  const selectedDigest = rawDigest!.trim();
  const selectedVersion = rawVersion!.trim();
  const reference = rawReference!.trim();
  if (!digestValuePattern.test(selectedDigest)) {
    throw new InvalidCandidateInputError("HERMES_OPERATOR_SELECTED_DIGEST doit être un digest sha256 exact.");
  }
  if (!versionPattern.test(selectedVersion)) {
    throw new InvalidCandidateInputError("HERMES_OPERATOR_SELECTED_VERSION doit être une version X.Y.Z.");
  }
  if (reference.length < 3 || reference.length > 128 || !selectionRefPattern.test(reference)) {
    throw new InvalidCandidateInputError("HERMES_OPERATOR_SELECTION_REF doit respecter le format autorisé sur 3 à 128 caractères.");
  }

  const candidateDigest = candidate.image.match(digestPattern)?.[1] ?? "";
  return {
    source: "environment",
    digest: selectedDigest,
    version: selectedVersion,
    reference,
    matched: selectedDigest === candidateDigest && selectedVersion === candidate.expectedVersion,
    authenticated: false,
  };
}

function invalidCardinalityVerdict(operatorSelection: OperatorSelection) {
  return {
    verdict: "INVALID_INPUT",
    exitCode: CANDIDATE_EXIT_CODES.INVALID_INPUT,
    qualificationPassed: false,
    promotionAllowed: false,
    deploymentAllowed: false,
    allProfilesPassed: false,
    operatorSelection,
    reason: "candidate matrix requires exactly one target-contract, production-reference, and root-bootstrap probe",
  } as const;
}

export function deriveCandidateVerdict(
  probes: CandidateProbeResult[],
  operatorSelection: OperatorSelection,
) {
  const requiredProfiles = CANDIDATE_PROFILES.map((profile) => profile.id);
  const cardinalityValid = probes.length === requiredProfiles.length && requiredProfiles.every((profile) =>
    probes.filter((probe) => probe.profile === profile).length === 1
  );
  if (!cardinalityValid) return invalidCardinalityVerdict(operatorSelection);

  const productionReference = probes.find((probe) => probe.profile === "production-reference")!;
  const targetContract = probes.find((probe) => probe.profile === "target-contract")!;
  const qualificationPassed = productionReference.probePassed && productionReference.versionMatchesExpected;
  const selectionPresent = operatorSelection.digest !== null;
  const promotionAllowed = qualificationPassed && operatorSelection.matched;
  const deploymentAllowed = promotionAllowed && targetContract.probePassed;
  const allProfilesPassed = probes.every((probe) => probe.probePassed);
  const verdict = !qualificationPassed
    ? "BLOCKED"
    : !selectionPresent
      ? "DECISION_REQUIRED"
      : !operatorSelection.matched
        ? "ASSERTION_MISMATCH"
        : !deploymentAllowed
          ? "SELECTED_NOT_DEPLOYABLE"
          : "READY";

  return {
    verdict,
    exitCode: CANDIDATE_EXIT_CODES[verdict],
    qualificationPassed,
    promotionAllowed,
    deploymentAllowed,
    allProfilesPassed,
    operatorSelection,
  } as const;
}

export function toCandidateFailureReport(error: unknown) {
  const verdict = error instanceof InvalidCandidateInputError ? "INVALID_INPUT" : "BLOCKED";
  return {
    verdict,
    exitCode: CANDIDATE_EXIT_CODES[verdict],
    qualificationPassed: false,
    promotionAllowed: false,
    deploymentAllowed: false,
    allProfilesPassed: false,
    operatorSelection: emptyOperatorSelection(),
    reason: error instanceof Error ? error.message : String(error),
  } as const;
}

type CommandResult = { status: number; stdout: string; stderr: string };
type SandboxProbeResult = CommandResult & {
  inspectionStatus: number;
  daemonUser: string | null;
  daemonWorkingDir: string | null;
  cleanupFailed: boolean;
};

export function parseSandboxDaemonInspection(result: CommandResult) {
  if (result.status !== 0) {
    return {
      inspectionStatus: result.status,
      daemonUser: null,
      daemonWorkingDir: null,
      sanitizedError: `docker inspect failed with status ${result.status}`,
    } as const;
  }
  try {
    const config = JSON.parse(result.stdout) as unknown;
    const record = typeof config === "object" && config !== null
      ? config as Record<string, unknown>
      : {};
    return {
      inspectionStatus: 0,
      daemonUser: typeof record.User === "string" ? record.User : null,
      daemonWorkingDir: typeof record.WorkingDir === "string" ? record.WorkingDir : null,
      sanitizedError: "",
    } as const;
  } catch {
    return {
      inspectionStatus: 1,
      daemonUser: null,
      daemonWorkingDir: null,
      sanitizedError: "docker inspect returned invalid Config JSON",
    } as const;
  }
}

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

function runVersionProbe(profile: CandidateProfile) {
  if (profile.id === "root-bootstrap") return runBootstrapProbe();
  return docker([
    "run", "--rm", "--platform", "linux/amd64", "--read-only",
    "--user", profile.user, "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges:true",
    "--tmpfs", "/tmp:size=64m,mode=1777",
    "--tmpfs", "/run:size=16m,mode=755",
    "--mount", "type=tmpfs,destination=" + profile.writableTarget + ",tmpfs-mode=0777",
    "--workdir", profile.workdir,
    "--entrypoint", "/opt/hermes/bin/hermes", image, "version",
  ]);
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
    return {
      status: state.status === 0 && /:0$/.test(text(state)) ? 0 : 1,
      stdout: "state=" + text(state) + "\nlogs=\n" + text(logs) + "\ntop=\n" + text(top),
      stderr: state.status === 0 ? "" : text(state),
    };
  } finally {
    docker(["rm", "--force", name]);
  }
}

function runSandboxProbe(profile: CandidateProfile) {
  const name = "hc-g1-002c-sandbox-" + profile.id + "-" + process.pid + "-" + Math.random().toString(16).slice(2, 10);
  const created = docker([
    "create", "--name", name, "--platform", "linux/amd64", "--read-only",
    "--user", profile.user, "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges:true",
    "--tmpfs", "/tmp:size=64m,mode=1777",
    "--tmpfs", "/run:size=16m,mode=755",
    "--mount", "type=tmpfs,destination=" + profile.writableTarget + ",tmpfs-mode=0777",
    "--workdir", profile.workdir,
    "--entrypoint", "/bin/sh", image, "-ec",
    "touch " + profile.writableTarget + "/g1-002c-write; " +
      "if touch /etc/g1-002c-rootfs 2>/dev/null; then exit 21; fi; " +
      "if test -e /var/run/docker.sock; then exit 22; fi; " +
      "if test -e /host-secret; then exit 23; fi; " +
      "if test -e /run/secrets/other-workflow; then exit 24; fi",
  ]);
  if (created.status !== 0) {
    return {
      ...created,
      inspectionStatus: 1,
      daemonUser: null,
      daemonWorkingDir: null,
      cleanupFailed: false,
    };
  }

  let inspectionStatus = 1;
  let daemonUser: string | null = null;
  let daemonWorkingDir: string | null = null;
  let inspectionError = "";
  let started: CommandResult = { status: 1, stdout: "", stderr: "sandbox container was not started" };
  let cleanupFailed = false;
  let cleanupOutput = "";
  try {
    const inspected = docker(["inspect", name, "--format", "{{json .Config}}"]);
    const parsedInspection = parseSandboxDaemonInspection(inspected);
    inspectionStatus = parsedInspection.inspectionStatus;
    daemonUser = parsedInspection.daemonUser;
    daemonWorkingDir = parsedInspection.daemonWorkingDir;
    inspectionError = parsedInspection.sanitizedError;
    started = docker(["start", "--attach", name]);
  } finally {
    const removed = docker(["rm", "--force", name]);
    if (removed.status !== 0) {
      cleanupFailed = true;
      cleanupOutput = text(removed);
    }
  }
  return {
    status: started.status,
    stdout: started.stdout,
    stderr: [started.stderr, inspectionError, cleanupOutput].filter(Boolean).join("\n"),
    inspectionStatus,
    daemonUser,
    daemonWorkingDir,
    cleanupFailed,
  };
}

function runPersistenceProbe(profile: CandidateProfile) {
  const volume = volumeName(profile.id);
  const created = docker(["volume", "create", volume]);
  if (created.status !== 0) return { status: created.status, output: text(created), cleanupFailed: false };
  let resultStatus = 1;
  let resultOutput = "";
  let cleanupFailed = false;
  try {
    // Un volume Docker neuf reprend les permissions de /opt/data présentes dans
    // l'image (actuellement 10000:10000). Le contrat SSH réel prépare au
    // contraire le bind mount avec l'UID/GID du compte de service avant de
    // lancer le conteneur. Cette étape reproduit cette préparation admin au
    // lieu de confondre l'identité upstream avec l'identité de la cible.
    const prepared = docker([
      "run", "--rm", "--platform", "linux/amd64", "--user", "0:0",
      "--cap-drop", "ALL", "--cap-add", "CHOWN",
      "--security-opt", "no-new-privileges:true",
      "--mount", "type=volume,src=" + volume + ",dst=" + profile.writableTarget,
      "--entrypoint", "/bin/sh", image, "-ec",
      `chown ${profile.uid}:${profile.gid} ${profile.writableTarget}`,
    ]);
    if (prepared.status !== 0) {
      resultStatus = 1;
      resultOutput = "persistence ownership preparation failed: " + text(prepared);
      return { status: resultStatus, output: resultOutput, cleanupFailed };
    }
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
    resultOutput = text(first) + "\n" + text(second);
  } finally {
    const removed = docker(["volume", "rm", "--force", volume]);
    if (removed.status !== 0) {
      resultStatus = 1;
      cleanupFailed = true;
      resultOutput += "\ncleanupFailed=" + text(removed);
    }
  }
  return { status: resultStatus, output: resultOutput, cleanupFailed };
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
  if (docker(["image", "inspect", image, "--format", "{{.Id}}"] ).status === 0) return;
  if (process.env.HERMES_REAL_PULL !== "1") {
    throw new Error("Image absente localement; HERMES_REAL_PULL=1 est requis pour tirer explicitement le digest.");
  }
  const pulled = docker(["pull", "--platform", "linux/amd64", image]);
  if (pulled.status !== 0) throw new Error("Pull de l’image digestée échoué: " + text(pulled));
}

function main() {
  if (!image || !digestPattern.test(image)) {
    throw new InvalidCandidateInputError("HERMES_REAL_IMAGE doit être une référence image@sha256:digest.");
  }
  if (!versionPattern.test(expectedVersion)) {
    throw new InvalidCandidateInputError("HERMES_EXPECTED_VERSION doit fournir la version X.Y.Z observée sur le digest résolu.");
  }
  const targetContract = resolveTargetContract(process.env);
  const operatorSelection = resolveOperatorSelection(process.env, { image, expectedVersion });
  const profiles = createCandidateProfiles(targetContract);
  if (docker(["info"]).status !== 0) throw new Error("Docker est requis pour G1-002C.");
  pullImage();
  const config = inspectImage();
  const reports = profiles.map((profile) => {
    const version = runVersionProbe(profile);
    const sandbox = runSandboxProbe(profile);
    const persistence = runPersistenceProbe(profile);
    return classifyCandidateProbe(profile, expectedVersion, {
      ociConfig: { user: config.User ?? null, workingDir: config.WorkingDir ?? null },
      versionStatus: version.status,
      versionOutput: text(version),
      sandboxStatus: sandbox.status,
      sandboxOutput: text(sandbox),
      sandboxInspectionStatus: sandbox.inspectionStatus,
      sandboxDaemonUser: sandbox.daemonUser,
      sandboxDaemonWorkingDir: sandbox.daemonWorkingDir,
      sandboxCleanupFailed: sandbox.cleanupFailed,
      persistenceStatus: persistence.status,
      persistenceOutput: persistence.output,
      cleanupFailed: persistence.cleanupFailed,
    });
  });
  const verdict = deriveCandidateVerdict(reports, operatorSelection);
  const report = {
    image,
    expectedVersion,
    targetContract,
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
      "operator selection is environment-sourced and unauthenticated",
      "OCI Config.User and Config.WorkingDir are diagnostic only; effective runtime identity and workdir are blocking",
      "no deployment, production Compose, image pin, or provisioning reference was modified",
      "root-bootstrap is diagnostic only and excluded from qualification, promotion, and deployment verdicts",
      "P-SEC/P-OPS/P-E2E and Gate 1 remain open",
    ],
  };
  process.stdout.write(JSON.stringify(report) + "\n");
  process.exitCode = verdict.exitCode;
}

if (import.meta.main) {
  try {
    main();
  } catch (error) {
    const report = toCandidateFailureReport(error);
    process.stdout.write(JSON.stringify({
      ...report,
      limitations: ["candidate matrix did not complete; no promotion or deployment is possible"],
    }) + "\n");
    process.exitCode = report.exitCode;
  }
}
