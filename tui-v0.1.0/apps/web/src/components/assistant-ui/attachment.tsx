"use client";

import {
  AttachmentPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  useAuiState,
} from "@assistant-ui/react";
import { FileIcon, FileX2Icon, XIcon } from "lucide-react";
import { useState } from "react";
import { FilePreviewDialog } from "./file-preview-dialog";
import { readPersonaCapabilities } from "@/lib/persona-capabilities";
import { useRouter } from "@/lib/router";

export function ComposerAddAttachment() {
  return null;
}

export function ComposerAttachments() {
  return (
    <div className="aui-composer-attachments flex w-full flex-wrap gap-2 empty:hidden">
      <ComposerPrimitive.Attachments>
        {() => <ComposerAttachment />}
      </ComposerPrimitive.Attachments>
    </div>
  );
}

export function UserMessageAttachments() {
  return (
    <div className="aui-user-message-attachments col-start-2 row-start-1 flex min-w-0 flex-wrap justify-end gap-2 empty:hidden">
      <MessagePrimitive.Attachments>
        {() => <UserMessageAttachment />}
      </MessagePrimitive.Attachments>
    </div>
  );
}

function UserMessageAttachment() {
  const id = useAuiState((state) => state.attachment.id);
  const name = useAuiState((state) => state.attachment.name);
  const contentType = useAuiState((state) => state.attachment.contentType);
  const [previewOpen, setPreviewOpen] = useState(false);
  const router = useRouter();
  const deleted = contentType === "application/x-hermes-deleted";
  const canDelete = readPersonaCapabilities().has("artifact.delete");
  const content = (
    <>
      <FileIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 truncate">
        <AttachmentPrimitive.Name />
      </span>
    </>
  );

  return (
    <AttachmentPrimitive.Root className="aui-attachment-root min-w-0 max-w-full">
      {deleted ? (
        <span className="flex h-8 min-w-0 items-center gap-2 rounded-lg bg-muted/60 px-2 text-xs text-muted-foreground">
          <FileX2Icon className="size-3.5 shrink-0" aria-hidden />
          <span className="min-w-0 truncate"><AttachmentPrimitive.Name /></span>
          <span aria-hidden>·</span>
          <span>supprimé</span>
        </span>
      ) : id.startsWith("file_") ? (
        <>
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            className="flex h-8 min-w-0 max-w-full cursor-pointer items-center gap-2 rounded-lg bg-muted px-2 text-xs text-foreground transition-colors hover:bg-muted/80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            aria-label={`Ouvrir l’aperçu de ${name}`}
          >
            {content}
          </button>
          <FilePreviewDialog
            open={previewOpen}
            onClose={() => setPreviewOpen(false)}
            fileId={id}
            name={name}
            contentType={contentType}
            canDelete={canDelete}
            onDeleted={router.refresh}
          />
        </>
      ) : (
        <span className="flex h-8 min-w-0 items-center gap-2 rounded-lg bg-muted px-2 text-xs text-foreground">
          {content}
        </span>
      )}
    </AttachmentPrimitive.Root>
  );
}

function ComposerAttachment() {
  return (
    <AttachmentPrimitive.Root className="aui-attachment-root flex h-8 min-w-0 max-w-full items-center gap-2 rounded-lg bg-muted px-2 text-xs text-foreground">
      <FileIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 truncate">
        <AttachmentPrimitive.Name />
      </span>
      <AttachmentPrimitive.Remove asChild>
        <button
          type="button"
          className="inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
          aria-label="Retirer le fichier"
        >
          <XIcon className="size-3.5" aria-hidden />
        </button>
      </AttachmentPrimitive.Remove>
    </AttachmentPrimitive.Root>
  );
}
