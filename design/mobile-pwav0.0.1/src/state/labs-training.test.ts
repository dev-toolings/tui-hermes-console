// Bun exposes this module at runtime; the project deliberately has no Bun type package.
// @ts-expect-error Bun test types are not part of the application build.
import { describe, expect, test } from "bun:test";
import type { TrainingProgress } from "./labs-store";
import {
  PURGE_GATE_ID,
  STAGING_GATE_ID,
  correctDecisionCount,
  isGraduated,
  verdictFor,
  visibleTrainingEvents,
} from "./labs-training";

const progress = (
  decisions: TrainingProgress["decisions"] = {},
): TrainingProgress => ({ decisions, graduatedAt: null });

describe("training disclosure", () => {
  test("the trap gate stays hidden until the staging gate is correctly approved", () => {
    const ids = (p: TrainingProgress) => visibleTrainingEvents(p).map((event) => event.id);
    expect(ids(progress())).toContain(STAGING_GATE_ID);
    expect(ids(progress())).not.toContain(PURGE_GATE_ID);
    expect(ids(progress({ [STAGING_GATE_ID]: "refused" }))).not.toContain(PURGE_GATE_ID);
    expect(ids(progress({ [STAGING_GATE_ID]: "approved" }))).toContain(PURGE_GATE_ID);
  });

  test("the closing event only appears at graduation", () => {
    const before = visibleTrainingEvents(
      progress({ [STAGING_GATE_ID]: "approved", [PURGE_GATE_ID]: "approved" }),
    );
    const after = visibleTrainingEvents(
      progress({ [STAGING_GATE_ID]: "approved", [PURGE_GATE_ID]: "refused" }),
    );
    expect(before.map((event) => event.id)).not.toContain("tr-05");
    expect(after.map((event) => event.id)).toContain("tr-05");
  });
});

describe("graduation contract", () => {
  test("the production purge gate must be refused to graduate", () => {
    expect(
      isGraduated(progress({ [STAGING_GATE_ID]: "approved", [PURGE_GATE_ID]: "approved" })),
    ).toBe(false);
    expect(
      isGraduated(progress({ [STAGING_GATE_ID]: "approved", [PURGE_GATE_ID]: "refused" })),
    ).toBe(true);
  });

  test("approving the trap yields a wrong verdict, refusing the safe gate too", () => {
    expect(verdictFor(PURGE_GATE_ID, "approved").correct).toBe(false);
    expect(verdictFor(PURGE_GATE_ID, "refused").correct).toBe(true);
    expect(verdictFor(STAGING_GATE_ID, "refused").correct).toBe(false);
    expect(verdictFor(STAGING_GATE_ID, "approved").correct).toBe(true);
  });

  test("progress counts only the expected decisions", () => {
    expect(correctDecisionCount(progress())).toBe(0);
    expect(correctDecisionCount(progress({ [STAGING_GATE_ID]: "refused" }))).toBe(0);
    expect(correctDecisionCount(progress({ [STAGING_GATE_ID]: "approved" }))).toBe(1);
    expect(
      correctDecisionCount(
        progress({ [STAGING_GATE_ID]: "approved", [PURGE_GATE_ID]: "refused" }),
      ),
    ).toBe(2);
  });
});

describe("trap fixture", () => {
  test("the trap gate really is irreversible and out of the mission scope", () => {
    const trap = visibleTrainingEvents(progress({ [STAGING_GATE_ID]: "approved" })).find(
      (event) => event.id === PURGE_GATE_ID,
    );
    expect(trap?.blastRadius).toMatchObject({
      environment: "production",
      irreversible: true,
    });
  });
});
