"use client";

import { type ReactNode } from "react";
import type { ThreadSnapshot } from "@/modules/runs/types";
import { OpenClawChatShell } from "@/components/chat/openclaw-shell";
import { EventStream } from "./event-stream";
import { RunDetailsRegistrar, type RunPageDetails } from "./run-page-chrome";
import { RunThreadHeader } from "./run-thread-header";
import { RunThreadMetaProvider } from "./run-thread-meta";

type StreamProps = Omit<
  React.ComponentProps<typeof EventStream>,
  "layout" | "modelLabel" | "loading"
>;

export function RunChatShell({
  title,
  model,
  trailing,
  alerts,
  details,
  streamProps,
  threadSnapshot = null,
  loading = false,
  surface = "mission",
}: {
  title: string;
  model: string;
  trailing?: ReactNode;
  alerts?: ReactNode;
  details: RunPageDetails;
  streamProps: StreamProps;
  threadSnapshot?: ThreadSnapshot | null;
  loading?: boolean;
  surface?: "chat" | "mission";
}) {
  const stream = (
    <EventStream {...streamProps} layout="xulux" modelLabel={model} loading={loading} />
  );

  if (surface === "chat") {
    return (
      <RunDetailsRegistrar details={details}>
        <RunThreadMetaProvider snapshot={threadSnapshot}>
          <OpenClawChatShell
            sessionId={threadSnapshot?.id}
            title={loading ? "…" : title}
            modelLabel={model}
            trailing={trailing}
            alerts={alerts}
          >
            {stream}
          </OpenClawChatShell>
        </RunThreadMetaProvider>
      </RunDetailsRegistrar>
    );
  }

  return (
    <RunDetailsRegistrar details={details}>
      <RunThreadMetaProvider snapshot={threadSnapshot}>
        <div className="xulux-chat-root flex h-full min-h-0 flex-col overflow-hidden bg-background font-sans antialiased">
          <RunThreadHeader title={title} trailing={trailing} loading={loading} />
          {alerts}
          <div className="min-h-0 flex-1 overflow-hidden">{stream}</div>
        </div>
      </RunThreadMetaProvider>
    </RunDetailsRegistrar>
  );
}
