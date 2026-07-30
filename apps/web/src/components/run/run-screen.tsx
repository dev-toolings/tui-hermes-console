"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RunChatShell } from "./run-chat-shell";
import { useLiveThread } from "./use-live-thread";
import { useRunReplay } from "./use-run-replay";
import { RUN_STATUS } from "@/lib/run-status";
import { formatInactivityLabel } from "@/lib/inactivity";
import { buildRunExecutionDetails, displayRunHeaderModel } from "@/lib/run-execution-details";
import { cn } from "@/lib/cn";
import { ConnectorGapBanner } from "./connector-gap-banner";
import { XuluxButton } from "@/components/xulux-chat/button";

export function RunScreen({
  runId,
  surface = "mission",
}: {
  runId: string;
  surface?: "chat" | "mission";
}) {
  return runId.startsWith("thr_") ? (
    <LiveThreadScreen threadId={runId} surface={surface} />
  ) : (
    <FixtureRunScreen runId={runId} surface={surface} />
  );
}

function FixtureRunScreen({
  runId,
  surface = "mission",
}: {
  runId: string;
  surface?: "chat" | "mission";
}) {
  const { state, restart, respondApproval, run } = useRunReplay();
  const style = RUN_STATUS[state.status];

  return (
    <RunChatShell
      surface={surface}
      title={run.prompt.slice(0, 80) || "Mission fixture"}
      model={run.model}
      trailing={
        <RunStatusTrailing
          status={state.status}
          actionLabel="Rejouer"
          onAction={restart}
        />
      }
      alerts={
        state.approval ? (
          <ApprovalBanner
            command={state.approval.command}
            description={state.approval.description}
            onRespond={respondApproval}
          />
        ) : null
      }
      details={{
        execution: {
          requestedModel: run.model,
          activeModel: run.model,
          reasoningTokens: null,
          toolCallCount: state.events.filter((event) => event.type === "tool.call").length,
          reasoningExposed: state.events.some((event) => event.type === "agent.reasoning"),
        },
        instructions: run.instructions,
        output: state.output,
        usage: state.usage,
        artifacts: run.artifacts,
        error: state.error,
      }}
      streamProps={{
        prompt: run.prompt,
        events: state.events,
        isRunning: !style.terminal,
        runStatus: state.status,
        runError: state.error,
      }}
    />
  );
}

function LiveThreadScreen({
  threadId,
  surface = "mission",
}: {
  threadId: string;
  surface?: "chat" | "mission";
}) {
  const router = useRouter();
  const {
    snapshot,
    latestRun,
    messages,
    isRunning,
    approval,
    connectorGaps,
    loading,
    error,
    sendMessage,
    cancel,
    retry,
    respondApproval,
  } = useLiveThread(threadId);

  useEffect(() => {
    if (!snapshot || loading) return;
    if (surface === "chat" && snapshot.source === "mission") {
      router.replace(`/runs/${threadId}`);
      return;
    }
    if (surface === "mission" && snapshot.source === "chat") {
      router.replace(`/chat/${threadId}`);
    }
  }, [loading, router, snapshot, surface, threadId]);

  if (!loading && snapshot && surface === "chat" && snapshot.source === "mission") {
    return null;
  }
  if (!loading && snapshot && surface === "mission" && snapshot.source === "chat") {
    return null;
  }

  if (!loading && (!snapshot || !latestRun)) {
    return (
      <div className="bg-muted/30 grid h-full place-items-center p-6">
        <div className="max-w-md rounded-lg border border-border bg-background p-6 text-center shadow-sm">
          <h1 className="font-medium">Conversation indisponible</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {error ?? "Cette conversation n’existe pas ou n’est plus accessible."}
          </p>
        </div>
      </div>
    );
  }

  const status = latestRun?.status ?? "pending";
  const canRetry = Boolean(latestRun && RUN_STATUS[status]?.terminal);

  return (
    <RunChatShell
      surface={surface}
      title={snapshot?.title ?? "…"}
      model={snapshot && latestRun ? displayRunHeaderModel(snapshot, latestRun) : "…"}
      threadSnapshot={snapshot}
      loading={loading}
      trailing={
        <RunStatusTrailing
          status={status}
          lastEventAt={isRunning && status !== "awaiting_approval" ? latestRun?.lastEventAt : null}
          actionLabel={canRetry ? "Relancer" : undefined}
          onAction={canRetry ? retry : undefined}
        />
      }
      alerts={
        <>
          <ConnectorGapBanner gaps={connectorGaps} />
          {error ? (
            <div
              role="alert"
              className="shrink-0 border-b border-destructive/20 bg-destructive/5 px-4 py-2 text-sm text-destructive"
            >
              {error}
            </div>
          ) : null}
          {approval ? (
            <ApprovalBanner
              command={approval.command}
              description={approval.description}
              onRespond={(approved) => {
                void respondApproval(approved);
              }}
            />
          ) : null}
        </>
      }
      details={{
        execution:
          snapshot && latestRun ? buildRunExecutionDetails(snapshot, latestRun) : null,
        instructions: snapshot?.instructions ?? "",
        output: latestRun?.output ?? null,
        usage: latestRun?.usage ?? null,
        artifacts: (snapshot?.artifacts ?? [])
          .filter((item) => !latestRun || item.runId === latestRun.id)
          .filter((item) => item.direction === "output")
          .map((item) => ({
            id: item.id,
            filename: item.filename,
            content: "",
            sizeBytes: item.sizeBytes,
            downloadUrl: `/api/files/${encodeURIComponent(item.id)}`,
          })),
        error: latestRun?.error ?? null,
      }}
      streamProps={{
        messages,
        isRunning,
        onNew: sendMessage,
        onCancel: cancel,
      }}
    />
  );
}

function ApprovalBanner({
  command,
  description,
  onRespond,
}: {
  command: string | null;
  description: string | null;
  onRespond: (approved: boolean) => void;
}) {
  return (
    <div
      role="alertdialog"
      aria-live="assertive"
      className="shrink-0 border-b border-warning/35 bg-warning/5 px-4 py-3"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-warn-700">L&apos;agent demande une autorisation</p>
          {description ? <p className="text-sm">{description}</p> : null}
          {command ? (
            <code className="mt-2 block overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-xs">
              {command}
            </code>
          ) : null}
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => onRespond(false)}
            className="min-h-9 rounded-full border border-border px-3 text-sm font-medium hover:bg-muted"
          >
            Refuser
          </button>
          <button
            type="button"
            onClick={() => onRespond(true)}
            className="min-h-9 rounded-full bg-primary px-3 text-sm font-medium text-primary-foreground"
          >
            Autoriser
          </button>
        </div>
      </div>
    </div>
  );
}

function RunStatusTrailing({
  status,
  actionLabel,
  onAction,
  lastEventAt,
}: {
  status: keyof typeof RUN_STATUS;
  actionLabel?: string;
  onAction?: () => void | Promise<void>;
  lastEventAt?: string | null;
}) {
  const style = RUN_STATUS[status] ?? RUN_STATUS.pending;
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!lastEventAt) return;
    const timer = window.setInterval(() => setNowMs(Date.now()), 5_000);
    return () => window.clearInterval(timer);
  }, [lastEventAt]);

  const inactivityLabel = formatInactivityLabel(lastEventAt, nowMs);

  return (
    <>
      {inactivityLabel ? (
        <span className="hidden text-xs text-muted-foreground sm:inline">{inactivityLabel}</span>
      ) : null}
      <span
        className={cn(
          "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
          style.badge,
        )}
      >
        <span
          aria-hidden
          className={cn("size-1.5 rounded-full", style.dot, style.live && "animate-pulse")}
        />
        {style.label}
      </span>
      {actionLabel && onAction ? (
        <XuluxButton
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void onAction()}
          className="h-8 rounded-full px-3 text-xs"
        >
          {actionLabel}
        </XuluxButton>
      ) : null}
    </>
  );
}
