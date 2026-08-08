import { Check } from "lucide-react";
import { stageIndex, stages, type Stage } from "@hermes-console/guided-flow";

export function StageTracker({ stage }: { stage: Stage }) {
  const current = stageIndex[stage];

  return (
    <ol className="stage-tracker" aria-label="Progression de la tâche">
      {stages.map((item, index) => (
        <li key={item.id} className={index < current ? "done" : index === current ? "current" : ""}>
          <span className="stage-dot" aria-hidden="true">
            {index < current ? <Check size={13} strokeWidth={3} /> : index + 1}
          </span>
          <span className="stage-label">{item.label}</span>
        </li>
      ))}
    </ol>
  );
}
