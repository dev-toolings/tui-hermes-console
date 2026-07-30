"use client";

import {
  ActionBarPrimitive,
  AuiIf,
  ErrorPrimitive,
  MessagePrimitive,
} from "@assistant-ui/react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { TooltipIconButton } from "./tooltip-icon-button";

export function MessageError() {
  return (
    <MessagePrimitive.Error>
      <ErrorPrimitive.Root className="aui-message-error-root mt-2 rounded-2xl border border-destructive/30 bg-neg-soft px-3 py-2 text-[0.8125rem] text-neg-700">
        <ErrorPrimitive.Message className="aui-message-error-message line-clamp-4" />
      </ErrorPrimitive.Root>
    </MessagePrimitive.Error>
  );
}

export function AssistantActionBar() {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="aui-assistant-action-bar-root -ms-1 flex gap-1 text-ai-icon-secondary"
    >
      <ActionBarPrimitive.Copy asChild>
        <TooltipIconButton tooltip="Copier la réponse" aria-label="Copier la réponse">
          <AuiIf condition={(s) => s.message.isCopied}>
            <CheckIcon className="size-3.5" />
          </AuiIf>
          <AuiIf condition={(s) => !s.message.isCopied}>
            <CopyIcon className="size-3.5" />
          </AuiIf>
        </TooltipIconButton>
      </ActionBarPrimitive.Copy>
    </ActionBarPrimitive.Root>
  );
}
