"use client";

import { useState, type ReactNode } from "react";
import {
  MessagePrimitive,
  useAuiState,
  type EnrichedPartState,
} from "@assistant-ui/react";
import { DotMatrix } from "@boardui/ui";
import { BrainIcon, ChevronDownIcon, LoaderIcon } from "lucide-react";
import { XuluxMessageError } from "@/components/xulux-chat/message-error";
import { XuluxAssistantActionBar } from "@/components/xulux-chat/assistant-action-bar";
import { XuluxBranchPicker } from "@/components/xulux-chat/branch-picker";
import { cn } from "@/lib/cn";
import { XuluxMarkdownText } from "@/components/xulux-chat/markdown-text";
import { hermesMessageGroupBy } from "./message-grouping";
import { HermesToolPart } from "./hermes-tool-ui";
import { HermesToolGroup } from "./tool-group";
import { HERMES_WIDGETS, HermesWidgetFallback } from "./generative-ui";
import { lookupRunMessageMeta, useRunThreadMeta } from "./run-thread-meta";

export function HermesAssistantMessage() {
  const isRunning = useAuiState((state) => state.message.status?.type === "running");
  const hasText = useAuiState((state) =>
    state.message.content.some(
      (part) => part.type === "text" && part.text.trim().length > 0,
    ),
  );
  const hasReasoning = useAuiState((state) =>
    state.message.content.some(
      (part) => part.type === "reasoning" && part.text.trim().length > 0,
    ),
  );
  const hasToolCall = useAuiState((state) =>
    state.message.content.some((part) => part.type === "tool-call"),
  );
  const isLast = useAuiState((state) => state.message.isLast);
  const showPending =
    isRunning && isLast && !hasText && !hasReasoning && !hasToolCall;

  return (
    <MessagePrimitive.Root
      data-slot="aui_assistant-message-root"
      data-role="assistant"
      className="fade-in slide-in-from-bottom-1 animate-in relative mx-auto w-full max-w-(--thread-max-width) duration-150 text-foreground"
    >
      <div data-slot="aui_assistant-message-content" className="text-foreground px-2 leading-relaxed wrap-break-word">
        {showPending ? <PendingIndicator /> : null}
        {hasText || hasReasoning || hasToolCall || !showPending ? <HermesMessageParts /> : null}
        <XuluxMessageError />
      </div>

      <div
        data-slot="aui_assistant-message-footer"
        className="ml-2 flex min-h-7 items-center pt-1.5"
      >
        <XuluxBranchPicker />
        {!isRunning ? <XuluxAssistantActionBar /> : null}
        {!isRunning ? <AssistantMessageTimestamp /> : null}
      </div>
    </MessagePrimitive.Root>
  );
}

const assistantTimestampFormatter = new Intl.DateTimeFormat("fr-FR", {
  hour: "2-digit",
  minute: "2-digit",
});

function AssistantMessageTimestamp() {
  const messageId = useAuiState((s) => s.message.id);
  const createdAt = useAuiState((s) => s.message.createdAt);
  const snapshot = useRunThreadMeta();
  const meta = lookupRunMessageMeta(snapshot, messageId);
  const finishedAt = meta?.endedAt ? new Date(meta.endedAt) : null;

  // Uniquement après fin de stream : heure de clôture run, pas le début.
  if (!finishedAt && meta) return null;
  const at = finishedAt ?? createdAt;
  if (!at) return null;

  return (
    <time
      dateTime={at.toISOString()}
      className="text-muted-foreground ml-auto pr-2 text-xs tabular-nums animate-in fade-in duration-200"
    >
      {assistantTimestampFormatter.format(at)}
    </time>
  );
}

function HermesMessageParts() {
  return (
    <MessagePrimitive.GroupedParts groupBy={hermesMessageGroupBy} indicator="no-text">
      {({ part, children }) => {
        switch (part.type) {
          case "group-reasoning":
            return (
              <ReasoningAccordion status={part.status} indices={part.indices}>
                {children}
              </ReasoningAccordion>
            );
          case "group-tool":
            return (
              <HermesToolGroup
                indices={part.indices}
                running={part.status.type === "running"}
              >
                {children}
              </HermesToolGroup>
            );
          case "text":
            return <XuluxMarkdownText />;
          case "reasoning":
            return <ReasoningPart text={part.text} />;
          case "tool-call": {
            const toolPart = part as Extract<EnrichedPartState, { type: "tool-call" }>;
            return toolPart.toolUI ?? <HermesToolPart {...toolPart} />;
          }
          case "generative-ui":
            return (
              <MessagePrimitive.GenerativeUI
                components={HERMES_WIDGETS}
                Fallback={HermesWidgetFallback}
              />
            );
          case "indicator":
            return <PendingIndicator />;
          default:
            return null;
        }
      }}
    </MessagePrimitive.GroupedParts>
  );
}

function PendingIndicator() {
  return (
    <p className="flex items-center gap-2 py-1 text-[0.8125rem]" aria-live="polite">
      <DotMatrix state="thinking" aria-hidden className="text-muted-foreground" />
      <span className="ai-chat-shimmer-text inline-block">Hermes prépare la mission…</span>
    </p>
  );
}

function ReasoningAccordion({
  children,
  status,
  indices,
}: {
  children?: ReactNode;
  status: { type: string };
  indices: readonly number[];
}) {
  const isRunning = status.type === "running";
  const [open, setOpen] = useState(false);
  const expanded = isRunning || open;

  const count = indices.length;

  return (
    <div className="my-2 overflow-hidden rounded-xl border border-border bg-muted/30">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => {
          if (!isRunning) setOpen((value) => !value);
        }}
        className="flex min-h-9 w-full items-center gap-2 px-3 py-2 text-start text-sm transition-colors hover:bg-muted/60"
      >
        <span className="text-muted-foreground">
          {isRunning ? (
            <LoaderIcon className="size-3.5 animate-spin" />
          ) : (
            <BrainIcon className="size-3.5" />
          )}
        </span>
        <span className="min-w-0 flex-1 font-medium">
          {isRunning ? "Réflexion en cours…" : count > 1 ? `Réflexion · ${count} étapes` : "Réflexion"}
        </span>
        <ChevronDownIcon
          className={cn(
            "size-3.5 shrink-0 text-ai-icon-tertiary transition-transform",
            expanded && "rotate-180",
          )}
        />
      </button>
      {expanded ? (
        <div className="space-y-2 border-t border-border px-2 py-2">{children}</div>
      ) : null}
    </div>
  );
}

function ReasoningPart({ text }: { text: string }) {
  if (!text.trim()) return null;
  return (
    <div className="whitespace-pre-wrap px-1 text-sm leading-5 text-muted-foreground">
      {text}
    </div>
  );
}
