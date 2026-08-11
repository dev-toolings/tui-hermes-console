import { CheckIcon, CircleIcon, LoaderCircleIcon, XIcon } from "lucide-react";
import type { ProductRunStatus } from "@console/core/modules/runs/types";
import { cn } from "@/lib/cn";

type ProgressState = "complete" | "active" | "pending" | "error";

export function GuidedRunProgress({ status }: { status: ProductRunStatus }) {
  const failed = status === "failed" || status === "cancelled";
  const steps: Array<{ label: string; state: ProgressState }> = [
    { label: "Compréhension", state: "complete" },
    {
      label: "Préparation",
      state: status === "pending" || status === "starting" ? "active" : "complete",
    },
    {
      label: status === "awaiting_approval" ? "Validation requise" : "Réalisation",
      state:
        status === "pending" || status === "starting"
          ? "pending"
          : failed
            ? "error"
            : status === "completed"
              ? "complete"
              : "active",
    },
    {
      label: "Vérification",
      state: failed ? "error" : status === "completed" ? "complete" : "pending",
    },
  ];

  return (
    <section
      aria-label="Progression de la réalisation"
      className="shrink-0 border-b border-ai-separator bg-ai-secondary px-4 py-3"
    >
      <div className="mx-auto grid max-w-4xl grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        {steps.map((step, index) => (
          <div key={`${index}-${step.label}`} className="flex min-w-0 items-center gap-2">
            <ProgressIcon state={step.state} />
            <span
              className={cn(
                "truncate text-xs",
                step.state === "active" && "font-medium text-foreground",
                step.state === "complete" && "text-pos-700",
                step.state === "pending" && "text-muted-foreground",
                step.state === "error" && "text-neg-700",
              )}
            >
              {step.label}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function ProgressIcon({ state }: { state: ProgressState }) {
  if (state === "complete") {
    return (
      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-pos-100 text-pos-700">
        <CheckIcon className="size-3" aria-hidden />
      </span>
    );
  }
  if (state === "active") {
    return (
      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-info-100 text-info-700">
        <LoaderCircleIcon className="size-3 animate-spin" aria-hidden />
      </span>
    );
  }
  if (state === "error") {
    return (
      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-neg-soft text-neg-700">
        <XIcon className="size-3" aria-hidden />
      </span>
    );
  }
  return (
    <span className="grid size-5 shrink-0 place-items-center rounded-full border border-border text-muted-foreground">
      <CircleIcon className="size-2" aria-hidden />
    </span>
  );
}
