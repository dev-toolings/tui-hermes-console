"use client";

import { cn } from "@/lib/utils";
import {
  AuiIf,
  type ComposerRuntime,
  type ComposerState,
  ComposerPrimitive,
  useAui,
  useAuiState,
} from "@assistant-ui/react";
import { ArrowUpIcon, PlusIcon, SquareIcon } from "lucide-react";
import { useRef, type FC, type RefObject } from "react";
import { XuluxButton } from "./button";
import { XuluxTooltipIconButton } from "./tooltip-icon-button";
import { ComposerAttachments } from "@/components/assistant-ui/attachment";
import { XuluxComposerSuggestions } from "./composer-suggestions";
import type { ThreadSource } from "@console/core/types/domain";

const composerShellClass =
  "border-border/60 data-[dragging=true]:border-ring focus-within:border-border dark:border-muted-foreground/15 dark:focus-within:border-muted-foreground/30 flex w-full flex-col gap-2 rounded-(--composer-radius) border bg-(--composer-bg) p-(--composer-padding) shadow-[0_4px_16px_-8px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)] transition-[border-color,box-shadow,opacity] focus-within:shadow-[0_6px_24px_-8px_rgba(0,0,0,0.12),0_1px_2px_rgba(0,0,0,0.05)] data-[dragging=true]:border-dashed data-[dragging=true]:bg-[color-mix(in_oklab,var(--color-accent)_50%,var(--color-background))] dark:shadow-none";

export const XuluxComposer: FC<{ source: ThreadSource }> = ({ source }) => {
  const composerInputRef = useRef<HTMLTextAreaElement>(null);

  return (
    <ComposerPrimitive.Unstable_TriggerPopoverRoot>
      <ComposerPrimitive.Root className="aui-composer-root relative flex w-full flex-col">
        <XuluxComposerSuggestions source={source} />
        <ComposerPrimitive.AttachmentDropzone asChild>
          <div data-slot="aui_composer-shell" className={composerShellClass}>
            <ComposerAttachments />
            <ComposerPrimitive.Input
              ref={composerInputRef}
              placeholder="Message… (@ agents, / commandes)"
              className="aui-composer-input max-h-32 min-h-10 w-full resize-none bg-transparent px-2.5 py-1 text-base outline-none placeholder:text-muted-foreground/80 scrollbar-subtle"
              rows={1}
              enterKeyHint="send"
              aria-label="Message"
            />
            <XuluxComposerAction composerInputRef={composerInputRef} />
          </div>
        </ComposerPrimitive.AttachmentDropzone>
      </ComposerPrimitive.Root>
    </ComposerPrimitive.Unstable_TriggerPopoverRoot>
  );
};

export function openXuluxAttachmentPicker(
  composer: Pick<ComposerRuntime, "addAttachment"> & {
    getState: () => Pick<ComposerState, "attachmentAccept">;
  },
  composerInput: Pick<HTMLTextAreaElement, "blur" | "focus"> | null,
) {
  composerInput?.blur();

  const input = document.createElement("input");
  input.type = "file";
  input.multiple = true;
  input.hidden = true;

  const attachmentAccept = composer.getState().attachmentAccept;
  if (attachmentAccept !== "*") input.accept = attachmentAccept;

  document.body.appendChild(input);

  input.onchange = async (event) => {
    const fileList = (event.target as HTMLInputElement).files;
    input.remove();
    composerInput?.focus({ preventScroll: true });

    if (!fileList) return;

    await Promise.all(Array.from(fileList, async (file) => {
      try {
        await composer.addAttachment(file);
      } catch {
        // The composer runtime emits composer.attachmentAddError before rejecting.
      }
    }));
  };

  input.oncancel = () => {
    input.remove();
    composerInput?.focus({ preventScroll: true });
  };

  input.click();
}

const XuluxComposerAction: FC<{
  composerInputRef: RefObject<HTMLTextAreaElement | null>;
}> = ({ composerInputRef }) => {
  const aui = useAui();
  const isEditing = useAuiState((state) => state.composer.isEditing);

  return (
    <div className="aui-composer-action-wrapper relative flex items-center justify-between">
      {/* Le modèle est descendu sous le cadre, avec le reste du contexte : il
          appartient à la ligne de méta, pas à la barre d'actions de saisie. */}
      <div className="flex items-center gap-1">
        <XuluxTooltipIconButton
          tooltip="Add Attachment"
          side="bottom"
          className="aui-composer-add-attachment hover:bg-muted-foreground/15 dark:hover:bg-muted-foreground/30 size-7 rounded-full p-1 text-xs font-semibold"
          aria-label="Add Attachment"
          disabled={!isEditing}
          onClick={() => openXuluxAttachmentPicker(aui.composer, composerInputRef.current)}
        >
          <PlusIcon className="aui-attachment-add-icon size-4.5 stroke-[1.5px]" />
        </XuluxTooltipIconButton>
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
