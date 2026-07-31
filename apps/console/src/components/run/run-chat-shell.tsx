"use client";

import { type ReactNode } from "react";
import type { ThreadSnapshot } from "@console/core/modules/runs/types";
import { ChatPane } from "@/components/chat/openclaw-shell";
import { EventStream } from "./event-stream";
import { RunDetailsRegistrar, type RunPageDetails } from "./run-page-chrome";
import { RunThreadHeader } from "./run-thread-header";
import { RunThreadMetaProvider } from "./run-thread-meta";
import type { ThreadPhase } from "./use-live-thread";

type StreamProps = Omit<
  React.ComponentProps<typeof EventStream>,
  "layout" | "modelLabel" | "phase"
>;

export function RunChatShell({
  title,
  model,
  trailing,
  alerts,
  details,
  streamProps,
  threadSnapshot = null,
  phase = "ready",
  surface = "mission",
}: {
  title: string;
  model: string;
  trailing?: ReactNode;
  alerts?: ReactNode;
  details: RunPageDetails;
  streamProps: StreamProps;
  threadSnapshot?: ThreadSnapshot | null;
  phase?: ThreadPhase;
  surface?: "chat" | "mission";
}) {
  const stream = (
    <EventStream {...streamProps} layout="xulux" modelLabel={model} phase={phase} />
  );

  if (surface === "chat") {
    return (
      <RunDetailsRegistrar details={{ ...details, phase }}>
        <RunThreadMetaProvider snapshot={threadSnapshot}>
          <ChatPane title={title} phase={phase} trailing={trailing} alerts={alerts}>
            {stream}
          </ChatPane>
        </RunThreadMetaProvider>
      </RunDetailsRegistrar>
    );
  }

  return (
    <RunDetailsRegistrar details={{ ...details, phase }}>
      <RunThreadMetaProvider snapshot={threadSnapshot}>
        <div className="xulux-chat-root flex h-full min-h-0 flex-col overflow-hidden bg-background font-sans antialiased">
          <RunThreadHeader title={title} trailing={trailing} phase={phase} />
          {alerts}
          <div className="min-h-0 flex-1 overflow-hidden">{stream}</div>
        </div>
      </RunThreadMetaProvider>
    </RunDetailsRegistrar>
  );
}
