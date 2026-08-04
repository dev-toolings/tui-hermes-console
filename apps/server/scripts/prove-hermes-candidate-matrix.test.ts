import { describe, expect, test } from "bun:test";
import {
  CANDIDATE_EXIT_CODES,
  InvalidCandidateInputError,
  classifyCandidateProbe,
  createCandidateProfiles,
  deriveCandidateVerdict,
  parseSandboxDaemonInspection,
  resolveOperatorSelection,
  resolveTargetContract,
  toCandidateFailureReport,
  type CandidateProbeObservations,
  type CandidateProbeResult,
  type CandidateProfile,
} from "./prove-hermes-candidate-matrix";

const digest = `sha256:${"a".repeat(64)}`;
const image = `nousresearch/hermes-agent:v2026.7.30@${digest}`;
const expectedVersion = "0.19.1";

function profiles(targetEnvironment: Record<string, string | undefined> = {}) {
  return createCandidateProfiles(resolveTargetContract(targetEnvironment));
}

function profileById(
  id: CandidateProfile["id"],
  targetEnvironment: Record<string, string | undefined> = {},
) {
  const profile = profiles(targetEnvironment).find((candidate) => candidate.id === id);
  if (!profile) throw new Error(`missing fixture profile ${id}`);
  return profile;
}

function observations(
  profile: CandidateProfile,
  overrides: Partial<CandidateProbeObservations> = {},
): CandidateProbeObservations {
  return {
    ociConfig: { user: "root", workingDir: "/opt/hermes" },
    versionStatus: 0,
    versionOutput: `Hermes Agent v${expectedVersion}`,
    sandboxStatus: 0,
    sandboxOutput: "candidate-controlled stdout",
    sandboxInspectionStatus: 0,
    sandboxDaemonUser: profile.user,
    sandboxDaemonWorkingDir: profile.workdir,
    sandboxCleanupFailed: false,
    persistenceStatus: 0,
    persistenceOutput: "",
    cleanupFailed: false,
    ...overrides,
  };
}

function classified(
  profile: CandidateProfile,
  overrides: Partial<CandidateProbeObservations> = {},
) {
  return classifyCandidateProbe(profile, expectedVersion, observations(profile, overrides));
}

function noSelection() {
  return resolveOperatorSelection({}, { image, expectedVersion });
}

function exactSelection(overrides: Record<string, string | undefined> = {}) {
  return resolveOperatorSelection({
    HERMES_OPERATOR_SELECTED_DIGEST: digest,
    HERMES_OPERATOR_SELECTED_VERSION: expectedVersion,
    HERMES_OPERATOR_SELECTION_REF: "YODA-GO-LOT-A.1",
    ...overrides,
  }, { image, expectedVersion });
}

function greenProbes(targetEnvironment: Record<string, string | undefined> = {}) {
  return profiles(targetEnvironment).map((profile) => classified(profile));
}

describe("G1-002C candidate matrix A.1", () => {
  test("keeps target defaults and requires paired positive UID/GID values", () => {
    expect(resolveTargetContract({})).toEqual({
      uid: 65532,
      gid: 65532,
      user: "65532:65532",
      workdir: "/work",
      writableTarget: "/work",
    });

    for (const environment of [
      { HERMES_TARGET_UID: "1003" },
      { HERMES_TARGET_GID: "4242" },
      { HERMES_TARGET_UID: "0", HERMES_TARGET_GID: "4242" },
    ]) {
      expect(() => resolveTargetContract(environment)).toThrow(InvalidCandidateInputError);
    }
  });

  test("OCI root:/opt/hermes stays diagnostic when production runs as 10000:10000 in /opt/data", () => {
    const production = classified(profileById("production-reference"));

    expect(production).toMatchObject({
      profile: "production-reference",
      probePassed: true,
      effectiveUid: 10000,
      effectiveGid: 10000,
      effectiveWorkdir: "/opt/data",
      ociConfig: {
        user: "root",
        workingDir: "/opt/hermes",
        userMatchesProfile: false,
        workdirMatchesProfile: false,
      },
      failures: [],
    });

    expect(deriveCandidateVerdict(greenProbes(), noSelection())).toMatchObject({
      verdict: "DECISION_REQUIRED",
      exitCode: CANDIDATE_EXIT_CODES.DECISION_REQUIRED,
      qualificationPassed: true,
      promotionAllowed: false,
      deploymentAllowed: false,
    });
  });

  test("ignores a forged stdout identity marker and trusts only daemon sandbox inspection", () => {
    const production = classified(profileById("production-reference"), {
      sandboxOutput: "HC_G1_002C_EFFECTIVE uid=0 gid=0 pwd=/forged",
      sandboxDaemonUser: "10000:10000",
      sandboxDaemonWorkingDir: "/opt/data",
    });

    expect(production).toMatchObject({
      probePassed: true,
      effectiveUid: 10000,
      effectiveGid: 10000,
      effectiveWorkdir: "/opt/data",
      failures: [],
    });
  });

  test("never retains daemon Config secrets or raw inspect output in the report", () => {
    const sentinel = "G1_002C_SENTINEL_MUST_NOT_LEAK";
    const rawConfig = JSON.stringify({
      User: "10000:10000",
      WorkingDir: "/opt/data",
      Env: [`SECRET=${sentinel}`],
      Labels: { private: sentinel },
      Cmd: ["--token", sentinel],
    });
    const inspected = parseSandboxDaemonInspection({ status: 0, stdout: rawConfig, stderr: "" });
    const production = classified(profileById("production-reference"), {
      sandboxInspectionStatus: inspected.inspectionStatus,
      sandboxDaemonUser: inspected.daemonUser,
      sandboxDaemonWorkingDir: inspected.daemonWorkingDir,
    });

    expect(inspected).toEqual({
      inspectionStatus: 0,
      daemonUser: "10000:10000",
      daemonWorkingDir: "/opt/data",
      sanitizedError: "",
    });
    expect(JSON.stringify(production)).not.toContain(sentinel);
    expect(JSON.stringify(production)).not.toContain("SECRET=");
    expect(JSON.stringify(production)).not.toContain("Labels");
    expect(JSON.stringify(production)).not.toContain("Cmd");

    const failed = parseSandboxDaemonInspection({
      status: 7,
      stdout: rawConfig,
      stderr: `daemon error ${sentinel}`,
    });
    expect(failed).toEqual({
      inspectionStatus: 7,
      daemonUser: null,
      daemonWorkingDir: null,
      sanitizedError: "docker inspect failed with status 7",
    });
    expect(JSON.stringify(failed)).not.toContain(sentinel);
  });

  test("collects every status, version, UID, GID, and workdir failure before probePassed", () => {
    const target = profileById("target-contract");
    const result = classified(target, {
      versionStatus: 9,
      versionOutput: "Hermes Agent v0.19.0",
      sandboxStatus: 8,
      sandboxOutput: "HC_G1_002C_EFFECTIVE uid=65532 gid=65532 pwd=/work",
      sandboxInspectionStatus: 6,
      sandboxDaemonUser: "1003:4242",
      sandboxDaemonWorkingDir: "/wrong",
      sandboxCleanupFailed: true,
      persistenceStatus: 7,
      cleanupFailed: true,
    });

    expect(result.probePassed).toBe(false);
    expect(result.failures).toEqual([
      "version probe failed with status 9",
      "sandbox probe failed with status 8",
      "sandbox daemon inspection failed with status 6",
      "sandbox cleanup failed",
      "persistence probe failed with status 7",
      "persistence cleanup failed",
      "observed version 0.19.0 does not match expected 0.19.1",
      "effective UID 1003 does not match expected 65532",
      "effective GID 4242 does not match expected 65532",
      "effective workdir /wrong does not match expected /work",
    ]);
  });

  test("returns READY/0 for exact selection and green target 1003:4242", () => {
    const targetEnvironment = {
      HERMES_TARGET_UID: "1003",
      HERMES_TARGET_GID: "4242",
      HERMES_TARGET_WORKDIR: "/srv/hermes",
      HERMES_TARGET_WRITABLE_PATH: "/srv/hermes/data",
    };
    const candidateProbes = greenProbes(targetEnvironment);
    const result = deriveCandidateVerdict(candidateProbes, exactSelection());

    expect(candidateProbes.find((probe) => probe.profile === "target-contract")).toMatchObject({
      effectiveUid: 1003,
      effectiveGid: 4242,
      effectiveWorkdir: "/srv/hermes",
    });

    expect(result).toMatchObject({
      verdict: "READY",
      exitCode: CANDIDATE_EXIT_CODES.READY,
      qualificationPassed: true,
      promotionAllowed: true,
      deploymentAllowed: true,
      allProfilesPassed: true,
      operatorSelection: {
        source: "environment",
        digest,
        version: expectedVersion,
        reference: "YODA-GO-LOT-A.1",
        matched: true,
        authenticated: false,
      },
    });
    expect(result.exitCode === 0).toBe(result.promotionAllowed && result.deploymentAllowed);
  });

  test("returns SELECTED_NOT_DEPLOYABLE/3 when selected target is red", () => {
    const candidateProfiles = profiles();
    const probes = candidateProfiles.map((profile) => classified(profile, profile.id === "target-contract"
      ? { sandboxStatus: 8 }
      : {}));
    const result = deriveCandidateVerdict(probes, exactSelection());

    expect(result).toMatchObject({
      verdict: "SELECTED_NOT_DEPLOYABLE",
      exitCode: CANDIDATE_EXIT_CODES.SELECTED_NOT_DEPLOYABLE,
      qualificationPassed: true,
      promotionAllowed: true,
      deploymentAllowed: false,
    });
    expect(result.exitCode === 0).toBe(result.promotionAllowed && result.deploymentAllowed);
  });

  test("returns ASSERTION_MISMATCH/2 for a selected version mismatch", () => {
    const selection = exactSelection({ HERMES_OPERATOR_SELECTED_VERSION: "0.19.0" });
    const result = deriveCandidateVerdict(greenProbes(), selection);

    expect(result).toMatchObject({
      verdict: "ASSERTION_MISMATCH",
      exitCode: CANDIDATE_EXIT_CODES.ASSERTION_MISMATCH,
      qualificationPassed: true,
      promotionAllowed: false,
      deploymentAllowed: false,
      operatorSelection: {
        version: "0.19.0",
        matched: false,
        authenticated: false,
      },
    });
  });

  test("returns BLOCKED/1 when production-reference runtime or version is red", () => {
    for (const overrides of [
      { sandboxStatus: 8 },
      { versionOutput: "Hermes Agent v0.19.0" },
    ]) {
      const probes = profiles().map((profile) => classified(profile, profile.id === "production-reference" ? overrides : {}));
      expect(deriveCandidateVerdict(probes, exactSelection())).toMatchObject({
        verdict: "BLOCKED",
        exitCode: CANDIDATE_EXIT_CODES.BLOCKED,
        qualificationPassed: false,
        promotionAllowed: false,
        deploymentAllowed: false,
      });
    }
  });

  test("requires exactly one probe for each profile", () => {
    const valid = greenProbes();
    const extra = {
      ...valid[0]!,
      profile: "unexpected-profile",
    } as unknown as CandidateProbeResult;
    for (const invalid of [valid.slice(0, 2), [...valid, valid[0]!], [...valid, extra]]) {
      expect(deriveCandidateVerdict(invalid, noSelection())).toMatchObject({
        verdict: "INVALID_INPUT",
        exitCode: CANDIDATE_EXIT_CODES.INVALID_INPUT,
        qualificationPassed: false,
        promotionAllowed: false,
        deploymentAllowed: false,
      });
    }
  });

  test("root-bootstrap failures change diagnostics but never the READY verdict", () => {
    const probes = profiles().map((profile) => classified(profile, profile.id === "root-bootstrap"
      ? { versionStatus: 9, sandboxStatus: 8, persistenceStatus: 7 }
      : {}));

    expect(deriveCandidateVerdict(probes, exactSelection())).toMatchObject({
      verdict: "READY",
      exitCode: CANDIDATE_EXIT_CODES.READY,
      promotionAllowed: true,
      deploymentAllowed: true,
      allProfilesPassed: false,
    });
  });

  test("requires selection assertions to be all absent or all valid and present", () => {
    expect(noSelection()).toEqual({
      source: "environment",
      digest: null,
      version: null,
      reference: null,
      matched: false,
      authenticated: false,
    });

    const invalidEnvironments = [
      { HERMES_OPERATOR_SELECTED_DIGEST: digest },
      {
        HERMES_OPERATOR_SELECTED_DIGEST: digest,
        HERMES_OPERATOR_SELECTED_VERSION: expectedVersion,
        HERMES_OPERATOR_SELECTION_REF: "ab",
      },
      {
        HERMES_OPERATOR_SELECTED_DIGEST: "not-a-digest",
        HERMES_OPERATOR_SELECTED_VERSION: expectedVersion,
        HERMES_OPERATOR_SELECTION_REF: "YODA-GO",
      },
      {
        HERMES_OPERATOR_SELECTED_DIGEST: digest,
        HERMES_OPERATOR_SELECTED_VERSION: "latest",
        HERMES_OPERATOR_SELECTION_REF: "YODA-GO",
      },
      {
        HERMES_OPERATOR_SELECTED_DIGEST: digest,
        HERMES_OPERATOR_SELECTED_VERSION: expectedVersion,
        HERMES_OPERATOR_SELECTION_REF: "YODA GO",
      },
    ];

    for (const environment of invalidEnvironments) {
      let error: unknown;
      try {
        resolveOperatorSelection(environment, { image, expectedVersion });
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(InvalidCandidateInputError);
      expect(toCandidateFailureReport(error)).toMatchObject({
        verdict: "INVALID_INPUT",
        exitCode: CANDIDATE_EXIT_CODES.INVALID_INPUT,
      });
    }
  });
});
