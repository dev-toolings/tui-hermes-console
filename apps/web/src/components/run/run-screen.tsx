"use client";

import { useEffect, useState } from "react";
import { useRouter } from "@/lib/router";
import { RunChatShell } from "./run-chat-shell";
import { useLiveThread } from "./use-live-thread";
import { useRunReplay } from "./use-run-replay";
import {
  artifactDeliveryFailureMessage,
  RUN_STATUS,
  runStatusStyle,
} from "@console/core/lib/run-status";
import { formatInactivityLabel } from "@/lib/inactivity";
import {
  buildRunDeliveryNotice,
  buildRunExecutionDetails,
  displayRunHeaderModel,
} from "@/lib/run-execution-details";
import { cn } from "@/lib/cn";
import { ApprovalCard } from "./approval-card";
import { ConnectorGapBanner } from "./connector-gap-banner";
import { useRuntimeStatus } from "@/components/shell/use-runtime-status";
import { ButtonLink } from "@/components/ui/boardui";
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
        beforeComposer: state.approval ? (
          <ApprovalCard
            command={state.approval.command}
            description={state.approval.description}
            choices={state.approval.choices}
            status={state.status}
            onRespond={respondApproval}
          />
        ) : null,
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
    phase,
    loading,
    error,
    sendMessage,
    cancel,
    retry,
    respondApproval,
  } = useLiveThread(threadId);
  const runtime = useRuntimeStatus();
  const workspaceBlocked =
    runtime.runtime?.transport === "ssh" && runtime.runtime.workspaceStatus !== "ready";
  /**
   * On ne ferme la porte que sur un runtime explicitement injoignable. « Jamais
   * testé » n'est pas « hors ligne » : une mission qui attend une autorisation
   * prouve à elle seule que le runtime répondait il y a un instant.
   */
  const runtimeReachable =
    runtime.runtime?.lastHealthStatus !== "unreachable" && !workspaceBlocked;

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

  const canRetry = Boolean(latestRun && RUN_STATUS[latestRun.status]?.terminal);
  const deliveryNotice = buildRunDeliveryNotice(latestRun);

  return (
    <RunChatShell
      surface={surface}
      // Plus de « … » : une chaîne vide dit « je ne sais pas », et c'est
      // l'en-tête qui décide d'en faire un squelette. Un caractère de
      // remplissage, lui, se lit comme un titre — le sien.
      title={snapshot?.title ?? ""}
      model={snapshot && latestRun ? displayRunHeaderModel(snapshot, latestRun) : ""}
      threadSnapshot={snapshot}
      phase={phase}
      trailing={
        // Aucun run connu : rien à dire sur son statut. Un badge « en attente »
        // par défaut affichait une donnée fausse le temps du chargement.
        latestRun ? (
          <RunStatusTrailing
            status={latestRun.status}
            error={latestRun.error}
            lastEventAt={
              isRunning && latestRun.status !== "awaiting_approval"
                ? latestRun.lastEventAt
                : null
            }
            actionLabel={canRetry ? "Relancer" : undefined}
            onAction={canRetry ? retry : undefined}
          />
        ) : null
      }
      alerts={
        <>
          <ConnectorGapBanner gaps={connectorGaps} />
          {deliveryNotice ? (
            <div
              role="alert"
              className="shrink-0 border-b border-destructive/25 bg-neg-100 px-4 py-3 text-sm text-neg-700"
            >
              <strong className="font-semibold">
                {deliveryNotice.title}
              </strong>{" "}
              {deliveryNotice.message}
            </div>
          ) : null}
          {error ? (
            <div
              role="alert"
              className="shrink-0 border-b border-destructive/20 bg-destructive/5 px-4 py-2 text-sm text-destructive"
            >
              {error}
            </div>
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
        inputArtifacts: (snapshot?.artifacts ?? [])
          .filter((item) => !latestRun || item.runId === latestRun.id)
          .filter((item) => item.direction === "input")
          .map((item) => ({
            id: item.id,
            filename: item.filename,
            sizeBytes: item.sizeBytes,
            downloadUrl: `/api/files/${encodeURIComponent(item.id)}`,
          })),
        error:
          artifactDeliveryFailureMessage(latestRun?.error) ??
          latestRun?.error ??
          null,
      }}
      streamProps={{
        messages,
        isRunning,
        onNew: workspaceBlocked ? async () => undefined : sendMessage,
        onCancel: cancel,
        // Au ras du composer : c'est là que le regard est quand la mission
        // attend une décision, pas en tête d'un fil qu'on vient de dérouler.
        beforeComposer: workspaceBlocked ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-warn-soft p-3 text-[0.75rem] text-warn-700">
            <p className="min-w-0 flex-1">
              Le dossier de travail Hermes doit être configuré avant tout nouveau message.
            </p>
            <ButtonLink href="/settings/runtime">Configurer</ButtonLink>
          </div>
        ) : approval ? (
          <ApprovalCard
            command={approval.command}
            description={approval.description}
            choices={approval.choices}
            status={latestRun?.status ?? null}
            connected={runtimeReachable}
            onRespond={respondApproval}
          />
        ) : null,
      }}
    />
  );
}

function RunStatusTrailing({
  status,
  actionLabel,
  onAction,
  lastEventAt,
  error,
}: {
  status: keyof typeof RUN_STATUS;
  actionLabel?: string;
  onAction?: () => void | Promise<void>;
  lastEventAt?: string | null;
  error?: string | null;
}) {
  const style = runStatusStyle(status, error);
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
