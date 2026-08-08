export type Stage = "request" | "understanding" | "plan" | "proof";

export type StageDefinition = {
  id: Stage;
  label: string;
};

export const stages: StageDefinition[] = [
  { id: "request", label: "Demande" },
  { id: "understanding", label: "Compréhension" },
  { id: "plan", label: "Plan" },
  { id: "proof", label: "Réalisation" },
];

export const stageIndex: Record<Stage, number> = {
  request: 0,
  understanding: 1,
  plan: 2,
  proof: 3,
};

export function isStage(value: string | undefined): value is Stage {
  return stages.some((stage) => stage.id === value);
}

export function previousStage(stage: Stage): Stage {
  return stages[Math.max(0, stageIndex[stage] - 1)].id;
}

export function nextStage(stage: Stage): Stage {
  return stages[Math.min(stages.length - 1, stageIndex[stage] + 1)].id;
}
