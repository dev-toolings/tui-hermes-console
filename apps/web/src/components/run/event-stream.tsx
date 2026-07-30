"use client";

import { useMemo } from "react";
import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  type AppendMessage,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import type { RunEvent } from "@/lib/hermes-events";
import { buildMessages } from "@/lib/thread-messages";
import { HermesThread } from "@/components/assistant-ui/thread";
import { XuluxThread } from "@/components/xulux-chat/thread";
import { HermesToolCallUI } from "./hermes-tool-ui";

/** @deprecated Prefer `buildMessages` from `@/lib/thread-messages`. */
export { buildMessages } from "@/lib/thread-messages";

export function EventStream({
  prompt,
  events,
  isRunning,
  messages: externalMessages,
  runStatus,
  runError,
  onNew,
  onCancel,
  loading = false,
  layout = "default",
  modelLabel,
}: {
  prompt?: string;
  events?: RunEvent[];
  isRunning: boolean;
  messages?: ThreadMessageLike[];
  runStatus?: string;
  runError?: string | null;
  onNew?: (message: string, files?: File[]) => Promise<void>;
  onCancel?: () => Promise<void>;
  loading?: boolean;
  layout?: "default" | "xulux";
  modelLabel?: string;
}) {
  const messages = useMemo(() => {
    if (externalMessages) return externalMessages;
    const built = buildMessages(prompt ?? "", events ?? []);
    const assistant = built[1];
    if (!assistant || assistant.role !== "assistant") return built;
    const status =
      runStatus === "failed"
        ? ({
            type: "incomplete" as const,
            reason: "error" as const,
            error: runError ?? "Erreur Hermes.",
          })
        : runStatus === "cancelled"
          ? ({ type: "incomplete" as const, reason: "cancelled" as const })
          : isRunning
            ? ({ type: "running" as const })
            : ({ type: "complete" as const, reason: "stop" as const });
    return [built[0], { ...assistant, status }];
  }, [events, externalMessages, isRunning, prompt, runError, runStatus]);

  const runtime = useExternalStoreRuntime({
    messages,
    isRunning,
    convertMessage: (m: ThreadMessageLike) => m,
    onNew: async (message: AppendMessage) => {
      if (!onNew) {
        throw new Error(
          "Cette démonstration est en lecture seule. Créez une nouvelle conversation.",
        );
      }
      const text = message.content
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("\n")
        .trim();
      const files = extractAttachmentFiles(message);
      if (text || files.length > 0) {
        await onNew(text || "(fichier joint)", files);
      }
    },
    ...(onCancel ? { onCancel } : {}),
  });

  const thread =
    layout === "xulux" ? (
      <XuluxThread
        showComposer={Boolean(onNew)}
        loading={loading}
        openingExisting={layout === "xulux"}
        modelLabel={modelLabel}
      />
    ) : (
      <HermesThread showComposer={Boolean(onNew)} loading={loading} />
    );

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <HermesToolCallUI />
      {thread}
    </AssistantRuntimeProvider>
  );
}

function extractAttachmentFiles(message: AppendMessage): File[] {
  const files: File[] = [];
  const attachments = (
    message as AppendMessage & {
      attachments?: Array<{ file?: File; name?: string }>;
    }
  ).attachments;
  if (!attachments) return files;
  for (const attachment of attachments) {
    if (attachment.file instanceof File) files.push(attachment.file);
  }
  return files;
}
