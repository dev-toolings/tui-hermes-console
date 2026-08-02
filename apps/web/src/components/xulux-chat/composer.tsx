"use client";

import { cn } from "@/lib/utils";
import { AuiIf, ComposerPrimitive } from "@assistant-ui/react";
import { ArrowUpIcon, PlusIcon, SquareIcon } from "lucide-react";
import type { FC } from "react";
import { XuluxButton } from "./button";
import { XuluxTooltipIconButton } from "./tooltip-icon-button";

const composerShellClass =
  "border-border/60 data-[dragging=true]:border-ring focus-within:border-border dark:border-muted-foreground/15 dark:focus-within:border-muted-foreground/30 flex w-full flex-col gap-2 rounded-(--composer-radius) border bg-(--composer-bg) p-(--composer-padding) shadow-[0_4px_16px_-8px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)] transition-[border-color,box-shadow,opacity] focus-within:shadow-[0_6px_24px_-8px_rgba(0,0,0,0.12),0_1px_2px_rgba(0,0,0,0.05)] data-[dragging=true]:border-dashed data-[dragging=true]:bg-[color-mix(in_oklab,var(--color-accent)_50%,var(--color-background))] dark:shadow-none";

export const XuluxComposer: FC = () => (
  <ComposerPrimitive.Root className="aui-composer-root relative flex w-full flex-col">
    <ComposerPrimitive.AttachmentDropzone asChild>
      <div data-slot="aui_composer-shell" className={composerShellClass}>
        <ComposerPrimitive.Input
          placeholder="Send a message... (@ to mention, / for commands)"
          className="aui-composer-input max-h-32 min-h-10 w-full resize-none bg-transparent px-2.5 py-1 text-base outline-none placeholder:text-muted-foreground/80 scrollbar-subtle"
          rows={1}
          enterKeyHint="send"
          aria-label="Message"
        />
        <XuluxComposerAction />
      </div>
    </ComposerPrimitive.AttachmentDropzone>
  </ComposerPrimitive.Root>
);

const XuluxComposerAction: FC = () => {
  return (
    <div className="aui-composer-action-wrapper relative flex items-center justify-between">
      {/* Le modèle est descendu sous le cadre, avec le reste du contexte : il
          appartient à la ligne de méta, pas à la barre d'actions de saisie. */}
      <div className="flex items-center gap-1">
        <ComposerPrimitive.AddAttachment asChild>
          <XuluxTooltipIconButton
            tooltip="Add Attachment"
            side="bottom"
            className="aui-composer-add-attachment hover:bg-muted-foreground/15 dark:hover:bg-muted-foreground/30 size-7 rounded-full p-1 text-xs font-semibold"
            aria-label="Add Attachment"
          >
            <PlusIcon className="aui-attachment-add-icon size-4.5 stroke-[1.5px]" />
          </XuluxTooltipIconButton>
        </ComposerPrimitive.AddAttachment>
      </div>
      <div className="flex items-center gap-1.5">
        <AuiIf condition={(s) => !s.thread.isRunning}>
          <ComposerPrimitive.Send asChild>
            <XuluxTooltipIconButton
              tooltip="Send message"
              side="bottom"
              className={cn(
                "aui-composer-send size-7 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground disabled:opacity-50",
              )}
              aria-label="Send message"
            >
              <ArrowUpIcon className="aui-composer-send-icon size-4.5" strokeWidth={2.25} />
            </XuluxTooltipIconButton>
          </ComposerPrimitive.Send>
        </AuiIf>
        <AuiIf condition={(s) => s.thread.isRunning}>
          <ComposerPrimitive.Cancel asChild>
            <XuluxButton
              type="button"
              variant="default"
              size="icon"
              className="aui-composer-cancel size-7 rounded-full"
              aria-label="Stop generating"
            >
              <SquareIcon className="aui-composer-cancel-icon size-3.5 fill-current" />
            </XuluxButton>
          </ComposerPrimitive.Cancel>
        </AuiIf>
      </div>
    </div>
  );
};
