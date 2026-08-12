export const LABS_STORAGE_KEY = "hermes-console:labs:v1";
export const LABS_STATE_VERSION = 1;

export type LabsExperimentId = "training" | "layout-lab";
export type TrainingDecision = "approved" | "refused";

export type TrainingProgress = {
  /** gateId → decision; a wrong decision stays recorded until « Réessayer » clears it. */
  decisions: Record<string, TrainingDecision>;
  graduatedAt: string | null;
};

export type LabsState = {
  version: typeof LABS_STATE_VERSION;
  /** Opt-in is per workspace, like every other console preference. */
  workspaces: Record<string, { enabled: LabsExperimentId[] }>;
  training: Record<string, TrainingProgress>;
};

export type LabsExperiment = {
  id: LabsExperimentId;
  title: string;
  description: string;
  statusLabel: string;
  tone: "warn" | "info";
  path: string;
};

/** The static registry the Labs page renders; enabling one is a per-workspace choice. */
export const EXPERIMENTS: LabsExperiment[] = [
  {
    id: "training",
    title: "Terrain d'entraînement",
    description:
      "Une mission fictive pour apprendre à lire une timeline et à trancher des gates — dont une qu'il faudra savoir refuser.",
    statusLabel: "expérimental",
    tone: "warn",
    path: "/labs/training",
  },
  {
    id: "layout-lab",
    title: "Layout lab",
    description: "Dix compositions de la surface mission, à comparer.",
    statusLabel: "design",
    tone: "info",
    path: "/labs/layout-lab",
  },
];

const EXPERIMENT_IDS = EXPERIMENTS.map((experiment) => experiment.id);

export function createInitialLabsState(): LabsState {
  return { version: LABS_STATE_VERSION, workspaces: {}, training: {} };
}

export function createInitialTrainingProgress(): TrainingProgress {
  return { decisions: {}, graduatedAt: null };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isExperimentId(value: unknown): value is LabsExperimentId {
  return EXPERIMENT_IDS.includes(value as LabsExperimentId);
}

function isTrainingDecision(value: unknown): value is TrainingDecision {
  return value === "approved" || value === "refused";
}

function isTrainingProgress(value: unknown): value is TrainingProgress {
  if (!isRecord(value)) return false;
  if (value.graduatedAt !== null && typeof value.graduatedAt !== "string") return false;
  if (!isRecord(value.decisions)) return false;
  return Object.values(value.decisions).every(isTrainingDecision);
}

/** Converts persisted state without consulting localStorage, for tests and import paths. */
export function migrateLabsState(value: unknown): LabsState | null {
  if (!isRecord(value) || value.version !== LABS_STATE_VERSION) return null;
  if (!isRecord(value.workspaces) || !isRecord(value.training)) return null;
  const workspaces: LabsState["workspaces"] = {};
  for (const [workspaceId, entry] of Object.entries(value.workspaces)) {
    if (!isRecord(entry) || !Array.isArray(entry.enabled)) return null;
    workspaces[workspaceId] = { enabled: entry.enabled.filter(isExperimentId) };
  }
  const training: LabsState["training"] = {};
  for (const [workspaceId, progress] of Object.entries(value.training)) {
    if (!isTrainingProgress(progress)) return null;
    training[workspaceId] = progress;
  }
  return { version: LABS_STATE_VERSION, workspaces, training };
}

export function isExperimentEnabled(
  state: LabsState,
  workspaceId: string,
  id: LabsExperimentId,
): boolean {
  return state.workspaces[workspaceId]?.enabled.includes(id) ?? false;
}

export function setExperimentEnabled(
  state: LabsState,
  workspaceId: string,
  id: LabsExperimentId,
  enabled: boolean,
): LabsState {
  const current = state.workspaces[workspaceId]?.enabled ?? [];
  if (enabled === current.includes(id)) return state;
  const next = enabled ? [...current, id] : current.filter((entry) => entry !== id);
  return {
    ...state,
    workspaces: { ...state.workspaces, [workspaceId]: { enabled: next } },
  };
}

export function trainingProgressFor(state: LabsState, workspaceId: string): TrainingProgress {
  return state.training[workspaceId] ?? createInitialTrainingProgress();
}

function withProgress(
  state: LabsState,
  workspaceId: string,
  progress: TrainingProgress,
): LabsState {
  return { ...state, training: { ...state.training, [workspaceId]: progress } };
}

export function recordTrainingDecision(
  state: LabsState,
  workspaceId: string,
  gateId: string,
  decision: TrainingDecision,
): LabsState {
  const progress = trainingProgressFor(state, workspaceId);
  return withProgress(state, workspaceId, {
    ...progress,
    decisions: { ...progress.decisions, [gateId]: decision },
  });
}

export function clearTrainingDecision(
  state: LabsState,
  workspaceId: string,
  gateId: string,
): LabsState {
  const progress = trainingProgressFor(state, workspaceId);
  if (!(gateId in progress.decisions)) return state;
  const decisions = { ...progress.decisions };
  delete decisions[gateId];
  return withProgress(state, workspaceId, { ...progress, decisions });
}

/** `at` is injected so the reducer stays pure; graduation is recorded once. */
export function markGraduated(state: LabsState, workspaceId: string, at: string): LabsState {
  const progress = trainingProgressFor(state, workspaceId);
  if (progress.graduatedAt) return state;
  return withProgress(state, workspaceId, { ...progress, graduatedAt: at });
}

export function resetTraining(state: LabsState, workspaceId: string): LabsState {
  if (!(workspaceId in state.training)) return state;
  const training = { ...state.training };
  delete training[workspaceId];
  return { ...state, training };
}

export function loadLabsState(): LabsState {
  try {
    const raw = localStorage.getItem(LABS_STORAGE_KEY);
    if (!raw) return createInitialLabsState();
    const parsed: unknown = JSON.parse(raw);
    return migrateLabsState(parsed) ?? createInitialLabsState();
  } catch {
    return createInitialLabsState();
  }
}

export function saveLabsState(state: LabsState) {
  try {
    localStorage.setItem(LABS_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* the labs surface remains usable when storage is unavailable */
  }
}
