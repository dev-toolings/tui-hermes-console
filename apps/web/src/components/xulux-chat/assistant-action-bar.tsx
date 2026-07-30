"use client";

import {
  ActionBarMorePrimitive,
  ActionBarPrimitive,
  AuiIf,
  useAuiState,
} from "@assistant-ui/react";
import {
  CheckIcon,
  CopyIcon,
  MoreHorizontalIcon,
  RefreshCwIcon,
} from "lucide-react";
import { useState, type FC } from "react";
import { formatDuration } from "@/lib/run-status";
import { formatXuluxModelLabel } from "./format-model-label";
import { XuluxTooltipIconButton } from "./tooltip-icon-button";
import { lookupRunMessageMeta, useRunThreadMeta } from "@/components/run/run-thread-meta";
import { cn } from "@/lib/cn";

export const XuluxAssistantActionBar: FC = () => {
  const snapshot = useRunThreadMeta();
  const messageId = useAuiState((state) => state.message.id);
  const [now] = useState(() => Date.now());

  const meta = lookupRunMessageMeta(snapshot, messageId, now);
  const shortModel = meta ? formatXuluxModelLabel(meta.model) : null;
  const durationLabel =
    meta?.durationMs != null ? formatDuration(meta.durationMs) : null;

  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="aui-assistant-action-bar-root text-muted-foreground animate-in fade-in col-start-3 row-start-2 -ml-1 flex gap-1 duration-200"
    >
      <ActionBarPrimitive.Copy asChild>
        <XuluxTooltipIconButton tooltip="Copier">
          <AuiIf condition={(state) => state.message.isCopied}>
            <CheckIcon className="animate-in zoom-in-50 fade-in duration-200 ease-out" />
          </AuiIf>
          <AuiIf condition={(state) => !state.message.isCopied}>
            <CopyIcon className="animate-in zoom-in-75 fade-in duration-150" />
          </AuiIf>
        </XuluxTooltipIconButton>
      </ActionBarPrimitive.Copy>
      <ActionBarPrimitive.Reload asChild>
        <XuluxTooltipIconButton tooltip="Regénérer">
          <RefreshCwIcon />
        </XuluxTooltipIconButton>
      </ActionBarPrimitive.Reload>
      {meta ? (
        <ActionBarMorePrimitive.Root>
          <ActionBarMorePrimitive.Trigger asChild>
            <XuluxTooltipIconButton
              tooltip="Détails de la réponse"
              className="data-[state=open]:bg-accent"
            >
              <MoreHorizontalIcon />
            </XuluxTooltipIconButton>
          </ActionBarMorePrimitive.Trigger>
          <ActionBarMorePrimitive.Content
            side="bottom"
            align="start"
            sideOffset={6}
            className="aui-action-bar-more-content bg-popover/95 text-popover-foreground data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:animate-out data-[side=bottom]:slide-in-from-top-2 z-50 min-w-[10rem] overflow-hidden rounded-xl border p-2 shadow-lg backdrop-blur-sm"
          >
            <div className="grid gap-1.5 text-xs">
              {shortModel ? <MetaRow label="Modèle" value={shortModel} mono /> : null}
              {durationLabel ? (
                <MetaRow
                  label={meta.isRunning ? "Durée" : "Temps"}
                  value={durationLabel}
                  mono
                />
              ) : null}
              {meta.usage ? (
                <MetaRow
                  label="Tokens"
                  value={`${meta.usage.inputTokens.toLocaleString("fr-FR")} in · ${meta.usage.outputTokens.toLocaleString("fr-FR")} out`}
                  mono
                />
              ) : null}
              {meta.toolCallCount != null ? (
                <MetaRow
                  label="Outils"
                  value={String(meta.toolCallCount)}
                  mono
                />
              ) : null}
            </div>
          </ActionBarMorePrimitive.Content>
        </ActionBarMorePrimitive.Root>
      ) : null}
    </ActionBarPrimitive.Root>
  );
};

function MetaRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn(mono && "font-mono tabular-nums")}>{value}</span>
    </div>
  );
}
