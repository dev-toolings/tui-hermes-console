"use client";

import { HermesToolRow } from "./hermes-tool-ui";
import { useHermesRun, type HermesToolActivity } from "./hermes-run-store";

const VISIBLE = 5;

export function HermesToolActivityList() {
  const tools = useHermesRun((state) => state.tools);
  if (tools.length === 0) return null;

  const shown = tools.slice(-VISIBLE);
  const hidden = tools.length - shown.length;

  return (
    <div
      className="w-full"
      aria-live="polite"
      data-testid="hermes-tool-activity"
    >
      {hidden > 0 ? (
        <p className="px-1 pb-1 text-[0.6875rem] font-medium text-ai-icon-tertiary">
          + {hidden} appel{hidden > 1 ? "s" : ""} précédent{hidden > 1 ? "s" : ""}
        </p>
      ) : null}
      {shown.map((tool) => <ActivityRow key={tool.id} tool={tool} />)}
    </div>
  );
}

function ActivityRow({ tool }: { tool: HermesToolActivity }) {
  return (
    <HermesToolRow
      tool={tool.name}
      target={tool.target}
      running={tool.status === "running"}
      failed={tool.status === "failed"}
      durationMs={tool.durationMs}
      hasResultPayload={tool.hasResultPayload}
      output={tool.output}
    />
  );
}
