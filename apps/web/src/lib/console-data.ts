import type { RunStatus } from "./run-status";

/** Conservé pour la démo fixture `run_*` (écran lecture seule). */
export const DEMO_RUN_ID = "run_03d76f8cfc8e4880bb12e66620534248";

export const RUNS: Array<{
  id: string;
  title: string;
  agent: string;
  status: RunStatus;
  createdAt: string;
  duration: string;
  tokens: number | null;
  artifacts: number;
}> = [
  {
    id: DEMO_RUN_ID,
    title: "Additionner les valeurs du fichier notes.txt",
    agent: "Opérateur fichiers",
    status: "completed",
    createdAt: "Aujourd’hui, 15:41",
    duration: "13,8 s",
    tokens: 38_737,
    artifacts: 1,
  },
];

export const ARTIFACTS = [
  {
    id: "artifact-total",
    filename: "total.txt",
    runId: DEMO_RUN_ID,
    agent: "Opérateur fichiers",
    kind: "Sortie",
    size: "2 o",
    createdAt: "Aujourd’hui, 15:41",
  },
  {
    id: "artifact-notes",
    filename: "notes.txt",
    runId: DEMO_RUN_ID,
    agent: "Opérateur fichiers",
    kind: "Entrée",
    size: "8 o",
    createdAt: "Aujourd’hui, 15:41",
  },
] as const;
