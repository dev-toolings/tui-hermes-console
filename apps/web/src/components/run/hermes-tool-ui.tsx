"use client";

import { createElement, useCallback, useRef, useState } from "react";
import { Collapsible } from "radix-ui";
import { makeAssistantToolUI, useScrollLock } from "@assistant-ui/react";
import { formatDuration } from "@console/core/lib/run-status";
import {
  ChevronRightIcon,
  FileTextIcon,
  FilePenIcon,
  FolderOpenIcon,
  GlobeIcon,
  MousePointerClickIcon,
  SearchIcon,
  TerminalIcon,
  WrenchIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { approvalDecisionLabel } from "@/lib/approval-request";
import type { ApprovalChoice } from "@console/core/lib/thread-snapshot-mutations";
import { prettyToolArgs, prettyToolOutput, summarizeToolResult } from "@/lib/tool-summary";

const ANIMATION_DURATION = 200;

type HermesToolResult = {
  durationMs?: number | null;
  error?: boolean;
  hasResultPayload?: boolean;
  output?: unknown;
};

/**
 * Rendu par défaut d'un appel d'outil.
 *
 * Les messages déjà en base portent le nom synthétique `hermes_tool` ; les
 * nouveaux portent le vrai nom de l'outil. Les deux passent par le même
 * composant, qui lit `args.tool` — présent dans les deux cas.
 */
export const HermesToolCallUI = makeAssistantToolUI<Record<string, unknown>, HermesToolResult>({
  toolName: "hermes_tool",
  render: (props) => <HermesToolPart {...props} />,
});

export function HermesToolPart({
  toolName,
  args,
  result,
  status,
}: {
  toolName: string;
  args: unknown;
  result?: unknown;
  status: { type: string };
}) {
  const argsRecord = (args ?? {}) as Record<string, unknown>;
  const tool = String(argsRecord.tool ?? toolName);
  const payload =
    result != null && typeof result === "object" ? (result as HermesToolResult) : null;
  const running = status.type === "running" || !payload;
  const approval = (argsRecord.approval ?? null) as { choice?: string } | null;

  return (
    <HermesToolRow
      tool={tool}
      target={argsRecord.preview == null ? "" : String(argsRecord.preview)}
      toolArgs={argsRecord.arguments}
      running={running}
      failed={payload?.error === true}
      durationMs={payload?.durationMs ?? null}
      hasResultPayload={payload?.hasResultPayload ?? null}
      output={payload?.output}
      approvalChoice={(approval?.choice ?? null) as ApprovalChoice | null}
    />
  );
}

export function HermesToolRow({
  tool,
  target,
  toolArgs,
  running,
  failed,
  durationMs,
  hasResultPayload,
  output,
  approvalChoice = null,
}: {
  tool: string;
  target: string;
  toolArgs?: unknown;
  running: boolean;
  failed: boolean;
  durationMs: number | null;
  hasResultPayload: boolean | null;
  output?: unknown;
  /** Décision humaine qui a débloqué — ou bloqué — cet appel. */
  approvalChoice?: ApprovalChoice | null;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const lockScroll = useScrollLock(rootRef, ANIMATION_DURATION);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      lockScroll();
      setOpen(next);
    },
    [lockScroll],
  );

  const parameters = prettyToolArgs(toolArgs);
  const result = hasResultPayload === true && output != null ? prettyToolOutput(output) : null;
  const expandable = !running && (parameters !== "" || result !== null);

  // La ligne repliée doit dire ce qui est revenu, pas prouver que ça a répondu.
  const summary = failed
    ? "Échec"
    : running
      ? ""
      : hasResultPayload === false
        ? "Sortie non transmise"
        : summarizeToolResult(tool, output, target || null);

  const row = (
    <>
      <ToolIcon tool={tool} failed={failed} />
      <span
        className={cn(
          "shrink-0 font-mono text-[0.8125rem]",
          failed ? "text-destructive" : "text-foreground",
        )}
      >
        {tool}
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-[0.75rem]",
          failed ? "text-destructive" : "text-ai-icon-secondary",
        )}
      >
        {[target, summary].filter(Boolean).join(" · ")}
      </span>
      {/* La décision reste lisible après coup : c'est la seule trace de qui a
          autorisé quoi, l'événement du runtime n'étant affiché nulle part ailleurs. */}
      {approvalChoice ? (
        <span
          className={cn(
            "shrink-0 rounded-full px-1.5 py-0.5 text-[0.6875rem] font-medium",
            approvalChoice === "deny"
              ? "bg-destructive/10 text-destructive"
              : "bg-warn-700/10 text-warn-700",
          )}
        >
          {approvalDecisionLabel(approvalChoice)}
        </span>
      ) : null}
      <span
        className={cn(
          "shrink-0 tabular text-[0.75rem]",
          failed ? "text-destructive" : "text-ai-icon-secondary",
        )}
      >
        {running ? "en cours…" : durationMs != null ? formatDuration(durationMs) : ""}
      </span>
      <ChevronRightIcon
        aria-hidden
        className={cn(
          "size-3 shrink-0 text-ai-icon-tertiary transition-transform motion-reduce:transition-none",
          "duration-(--animation-duration) ease-[cubic-bezier(0.32,0.72,0,1)]",
          "group-data-[state=open]/tool-row:rotate-90",
          !expandable && "invisible",
        )}
      />
    </>
  );

  const rowClassName =
    "flex min-h-7 w-full items-center gap-2 rounded-md px-1.5 text-left text-muted-foreground";

  if (!expandable) {
    return <div className={rowClassName}>{row}</div>;
  }

  return (
    <Collapsible.Root
      ref={rootRef}
      open={open}
      onOpenChange={handleOpenChange}
      style={{ "--animation-duration": `${ANIMATION_DURATION}ms` } as React.CSSProperties}
    >
      <Collapsible.Trigger
        className={cn(rowClassName, "group/tool-row transition-colors hover:bg-muted/50")}
      >
        {row}
      </Collapsible.Trigger>
      <Collapsible.Content
        className={cn(
          "overflow-hidden",
          "data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up",
        )}
      >
        {/* Aligné sous le nom de l'outil, pas sous son icône. */}
        <div className="my-1 ml-6 space-y-2">
          {parameters ? <ToolSection label="Paramètres" body={parameters} /> : null}
          {result ? (
            <ToolSection
              label="Résultat"
              body={result.text}
              note={result.external ? "source externe · traité comme donnée" : undefined}
            />
          ) : null}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

function ToolSection({
  label,
  body,
  note,
}: {
  label: string;
  body: string;
  note?: string;
}) {
  return (
    <div className="space-y-1">
      <p className="flex items-center gap-2 text-[10px] font-medium tracking-wide text-ai-icon-tertiary uppercase">
        {label}
        {note ? <span className="normal-case tracking-normal">{note}</span> : null}
      </p>
      <pre className="max-h-60 overflow-auto overscroll-contain rounded-md bg-muted/50 p-2.5 font-mono text-[11px] leading-relaxed break-words whitespace-pre-wrap text-muted-foreground scrollbar-subtle">
        {body}
      </pre>
    </div>
  );
}

const TOOL_ICONS: Array<[RegExp, LucideIcon]> = [
  [/^browser_(navigate|open|goto)/, GlobeIcon],
  [/^browser_/, MousePointerClickIcon],
  [/^(read_file|cat|open_file)$/, FileTextIcon],
  [/^(write_file|edit_file|apply_patch)$/, FilePenIcon],
  [/^(execute_code|bash|shell|terminal|run)$/, TerminalIcon],
  [/^(grep|glob|search|web_search)$/, SearchIcon],
  [/^(list_dir|ls|tree)$/, FolderOpenIcon],
];

/**
 * `createElement` plutôt qu'une variable locale en majuscule rendue en JSX :
 * ce dernier motif se lit comme un composant défini pendant le rendu.
 */
function ToolIcon({ tool, failed }: { tool: string; failed: boolean }) {
  const icon = TOOL_ICONS.find(([pattern]) => pattern.test(tool))?.[1] ?? WrenchIcon;
  return createElement(icon, {
    "aria-hidden": true,
    className: cn("size-3.5 shrink-0", failed ? "text-destructive" : "text-ai-icon-secondary"),
  });
}

