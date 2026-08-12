// Bun exposes this module at runtime; the project deliberately has no Bun type package.
// @ts-expect-error Bun test types are not part of the application build.
import { describe, expect, test } from "bun:test";
import {
  LABS_STATE_VERSION,
  clearTrainingDecision,
  createInitialLabsState,
  isExperimentEnabled,
  markGraduated,
  migrateLabsState,
  recordTrainingDecision,
  resetTraining,
  setExperimentEnabled,
  trainingProgressFor,
} from "./labs-store";

describe("labs state migration", () => {
  test("rejects corrupted payloads instead of guessing", () => {
    expect(migrateLabsState(null)).toBeNull();
    expect(migrateLabsState("labs")).toBeNull();
    expect(migrateLabsState({ version: 99, workspaces: {}, training: {} })).toBeNull();
    expect(
      migrateLabsState({
        version: LABS_STATE_VERSION,
        workspaces: { tilvest: { enabled: "training" } },
        training: {},
      }),
    ).toBeNull();
    expect(
      migrateLabsState({
        version: LABS_STATE_VERSION,
        workspaces: {},
        training: { tilvest: { decisions: { "tr-gate-purge": "maybe" }, graduatedAt: null } },
      }),
    ).toBeNull();
  });

  test("accepts a current payload and drops unknown experiment ids", () => {
    const migrated = migrateLabsState({
      version: LABS_STATE_VERSION,
      workspaces: { tilvest: { enabled: ["training", "retired-experiment"] } },
      training: {
        tilvest: { decisions: { "tr-gate-staging": "approved" }, graduatedAt: null },
      },
    });
    expect(migrated).toMatchObject({
      workspaces: { tilvest: { enabled: ["training"] } },
      training: { tilvest: { decisions: { "tr-gate-staging": "approved" } } },
    });
  });
});

describe("experiment toggles", () => {
  test("opt-in stays isolated per workspace", () => {
    const state = setExperimentEnabled(createInitialLabsState(), "tilvest", "training", true);
    expect(isExperimentEnabled(state, "tilvest", "training")).toBe(true);
    expect(isExperimentEnabled(state, "acme", "training")).toBe(false);
  });

  test("enabling twice and disabling an absent experiment are no-ops", () => {
    const initial = createInitialLabsState();
    const enabled = setExperimentEnabled(initial, "tilvest", "training", true);
    expect(setExperimentEnabled(enabled, "tilvest", "training", true)).toBe(enabled);
    expect(setExperimentEnabled(initial, "tilvest", "layout-lab", false)).toBe(initial);
  });

  test("the kill-switch removes only the targeted experiment", () => {
    let state = createInitialLabsState();
    state = setExperimentEnabled(state, "tilvest", "training", true);
    state = setExperimentEnabled(state, "tilvest", "layout-lab", true);
    state = setExperimentEnabled(state, "tilvest", "training", false);
    expect(isExperimentEnabled(state, "tilvest", "training")).toBe(false);
    expect(isExperimentEnabled(state, "tilvest", "layout-lab")).toBe(true);
  });
});

describe("training progress", () => {
  test("records, corrects and clears one gate decision at a time", () => {
    let state = recordTrainingDecision(
      createInitialLabsState(),
      "tilvest",
      "tr-gate-purge",
      "approved",
    );
    state = recordTrainingDecision(state, "tilvest", "tr-gate-purge", "refused");
    expect(trainingProgressFor(state, "tilvest").decisions).toEqual({
      "tr-gate-purge": "refused",
    });
    state = clearTrainingDecision(state, "tilvest", "tr-gate-purge");
    expect(trainingProgressFor(state, "tilvest").decisions).toEqual({});
  });

  test("graduation is recorded once and survives further calls", () => {
    let state = markGraduated(createInitialLabsState(), "tilvest", "2026-08-12T10:00:00.000Z");
    const stamped = markGraduated(state, "tilvest", "2026-08-13T10:00:00.000Z");
    expect(trainingProgressFor(stamped, "tilvest").graduatedAt).toBe(
      "2026-08-12T10:00:00.000Z",
    );
    expect(stamped).toBe(state);
  });

  test("resetTraining wipes one workspace and leaves the others alone", () => {
    let state = recordTrainingDecision(
      createInitialLabsState(),
      "tilvest",
      "tr-gate-staging",
      "approved",
    );
    state = recordTrainingDecision(state, "acme", "tr-gate-staging", "approved");
    state = resetTraining(state, "tilvest");
    expect(trainingProgressFor(state, "tilvest").decisions).toEqual({});
    expect(trainingProgressFor(state, "acme").decisions).toEqual({
      "tr-gate-staging": "approved",
    });
  });
});
