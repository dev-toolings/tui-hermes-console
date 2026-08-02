"use client";

import { HermesAssistantMessage } from "@/components/run/assistant-message";
import { XuluxTooltipIconButton } from "./tooltip-icon-button";
import { XuluxMessageError } from "./message-error";
import { cn } from "@/lib/utils";
import { ActionBarPrimitive, MessagePrimitive, useAuiState } from "@assistant-ui/react";
import { PencilIcon } from "lucide-react";
import type { FC } from "react";
import { XuluxAssistantActionBar } from "./assistant-action-bar";
import { XuluxBranchPicker } from "./branch-picker";

const messageTimestampFormatter = new Intl.DateTimeFormat("fr-FR", {
  hour: "2-digit",
  minute: "2-digit",
});

const MessageTimestamp: FC<{ className?: string }> = ({ className }) => {
  const createdAt = useAuiState((s) => s.message.createdAt);
  if (!createdAt) return null;
  return (
    <time
      dateTime={createdAt.toISOString()}
      data-slot="message-timestamp"
      className={cn("text-muted-foreground text-xs tabular-nums", className)}
    >
      {messageTimestampFormatter.format(createdAt)}
    </time>
  );
};

export const XuluxUserMessage: FC = () => (
  <MessagePrimitive.Root
    data-slot="aui_user-message-root"
    data-role="user"
    className="fade-in slide-in-from-bottom-1 animate-in mx-auto grid w-full max-w-(--thread-max-width) auto-rows-auto grid-cols-[minmax(72px,1fr)_auto] content-start gap-y-2 px-2 duration-150 [&:where(>*)]:col-start-2"
  >
    <div className="aui-user-message-content-wrapper relative col-start-2 min-w-0">
      <div className="aui-user-message-content peer bg-muted text-foreground empty:hidden rounded-xl px-4 py-2 wrap-break-word">
        <MessagePrimitive.Parts
          components={{
            Text: ({ text }) => (
              <span className="whitespace-pre-wrap wrap-break-word">{text}</span>
            ),
          }}
        />
      </div>
      <div className="aui-user-action-bar-wrapper peer-empty:hidden absolute top-1/2 left-0 -translate-x-full -translate-y-1/2 pr-2">
        <ActionBarPrimitive.Root
          hideWhenRunning
          autohide="not-last"
          className="aui-user-action-bar-root flex flex-col items-end"
        >
          <ActionBarPrimitive.Edit asChild>
            <XuluxTooltipIconButton tooltip="Edit" className="aui-user-action-edit">
              <PencilIcon />
            </XuluxTooltipIconButton>
          </ActionBarPrimitive.Edit>
        </ActionBarPrimitive.Root>
      </div>
      <MessageTimestamp className="mt-1 block text-right" />
    </div>
    <XuluxBranchPicker
      data-slot="aui_user-branch-picker"
      className="col-span-full col-start-1 row-start-3 -mr-1 justify-end"
    />
  </MessagePrimitive.Root>
);

export function XuluxThreadMessage() {
  const role = useAuiState((s) => s.message.role);
  if (role === "user") return <XuluxUserMessage />;
  return <HermesAssistantMessage />;
}

export { XuluxMessageError as MessageError, XuluxAssistantActionBar };
