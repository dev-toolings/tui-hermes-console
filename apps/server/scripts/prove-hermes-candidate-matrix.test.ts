import { describe, expect, test } from "bun:test";
import {
  CANDIDATE_PROFILES,
  deriveCandidateVerdict,
  type CandidateProbeResult,
} from "./prove-hermes-candidate-matrix";

describe("G1-002C candidate matrix contract", () => {
  test("keeps the three runtime profiles explicit and distinct", () => {
    expect(CANDIDATE_PROFILES.map(({ id }) => id)).toEqual([
      "contract",
      "upstream",
      "root-bootstrap",
    ]);
    expect(CANDIDATE_PROFILES).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "contract", user: "65532:65532", workdir: "/work" }),
        expect.objectContaining({ id: "upstream", user: "10000:10000", workdir: "/opt/data" }),
        expect.objectContaining({ id: "root-bootstrap", user: "root", workdir: "/opt/data", bootstrapEntrypoint: "image-default" }),
      ]),
    );
  });

  test("never turns probe success into promotion without an explicit decision", () => {
    const probes = CANDIDATE_PROFILES.map((profile) => ({
      profile: profile.id,
      probePassed: true,
    })) as CandidateProbeResult[];

    expect(deriveCandidateVerdict(probes)).toEqual({
      verdict: "DECISION_REQUIRED",
      probePassed: true,
      promotionAllowed: false,
      decisionApproved: false,
    });
  });

  test("blocks a candidate when any profile probe fails", () => {
    const probes = CANDIDATE_PROFILES.map((profile, index) => ({
      profile: profile.id,
      probePassed: index !== 1,
    })) as CandidateProbeResult[];

    expect(deriveCandidateVerdict(probes)).toEqual({
      verdict: "BLOCKED",
      probePassed: false,
      promotionAllowed: false,
      decisionApproved: false,
    });
  });

  test("blocks a technically green probe when the observed version differs from the PRD", () => {
    const probes = CANDIDATE_PROFILES.map((profile) => ({
      profile: profile.id,
      probePassed: true,
      versionMatchesExpected: profile.id !== "upstream",
    })) as CandidateProbeResult[];

    expect(deriveCandidateVerdict(probes)).toMatchObject({
      verdict: "BLOCKED",
      probePassed: true,
      promotionAllowed: false,
      decisionApproved: false,
    });
  });
});
