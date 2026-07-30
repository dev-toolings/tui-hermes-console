"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { RunDto, ThreadSnapshot } from "@console/core/modules/runs/types";
import { displayRunHeaderModel } from "@/lib/run-execution-details";

export type RunMessageMeta = {
  model: string;
  durationMs: number | null;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number } | null;
  toolCallCount: number | null;
  isRunning: boolean;
  endedAt: string | null;
};

const RunThreadMetaContext = createContext<ThreadSnapshot | null>(null);

export function RunThreadMetaProvider({
  snapshot,
  children,
}: {
  snapshot: ThreadSnapshot | null;
  children: ReactNode;
}) {
  return (
    <RunThreadMetaContext.Provider value={snapshot}>{children}</RunThreadMetaContext.Provider>
  );
}

export function useRunThreadMeta() {
  return useContext(RunThreadMetaContext);
}

export function runIdFromAssistantMessageId(messageId: string) {
  if (messageId.startsWith("assistant_")) return messageId.slice("assistant_".length);
  return null;
}

export function buildRunMessageMeta(
  snapshot: ThreadSnapshot,
  run: RunDto,
  nowMs = Date.now(),
): RunMessageMeta {
  const startedAt = run.startedAt ? new Date(run.startedAt).getTime() : null;
  const endedAt = run.endedAt ? new Date(run.endedAt).getTime() : null;
  const isRunning = run.status === "pending" || run.status === "starting" || run.status === "running";

  return {
    model: displayRunHeaderModel(snapshot, run),
    durationMs: startedAt ? (endedAt ?? nowMs) - startedAt : null,
    usage: run.usage,
    toolCallCount: run.runtimeSession?.toolCallCount ?? null,
    isRunning,
    endedAt: run.endedAt,
  };
}

export function lookupRunMessageMeta(
  snapshot: ThreadSnapshot | null,
  messageId: string,
  nowMs = Date.now(),
): RunMessageMeta | null {
  if (!snapshot) return null;
  const runId = runIdFromAssistantMessageId(messageId);
  if (!runId) return null;
  const run = snapshot.runs.find((item) => item.id === runId);
  if (!run) return null;
  return buildRunMessageMeta(snapshot, run, nowMs);
}
