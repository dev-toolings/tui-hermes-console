"use client";

import { useState } from "react";
import { Trash2Icon } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/boardui";
import { deleteArtifact } from "@/lib/api";
import { cn } from "@/lib/utils";

type DeleteArtifactButtonProps = {
  artifactId: string;
  filename: string;
  onDeleted: () => void;
  compact?: boolean;
};

export function DeleteArtifactButton({
  artifactId,
  filename,
  onDeleted,
  compact = false,
}: DeleteArtifactButtonProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmDeletion() {
    setPending(true);
    setError(null);
    try {
      await deleteArtifact(artifactId);
      setOpen(false);
      onDeleted();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Suppression impossible.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          compact ? "size-8" : "h-9 gap-2 px-3 text-sm font-medium",
        )}
        aria-label={`Supprimer ${filename}`}
      >
        <Trash2Icon className="size-4" aria-hidden />
        {compact ? null : "Supprimer"}
      </button>
      <Dialog
        open={open}
        onClose={() => {
          if (!pending) setOpen(false);
        }}
        title="Supprimer définitivement ce fichier ?"
        description={filename}
        footer={
          <>
            <Button variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button
              variant="danger"
              disabled={pending}
              leadingIcon={Trash2Icon}
              onClick={() => void confirmDeletion()}
            >
              {pending ? "Suppression…" : "Supprimer de partout"}
            </Button>
          </>
        }
      >
        <p>
          Le contenu sera retiré du coffre Console et de tous les espaces de travail Hermes.
          Le chat conservera seulement la mention que la pièce jointe a été supprimée.
        </p>
        {error ? (
          <p role="alert" className="mt-3 text-destructive">
            {error}
          </p>
        ) : null}
      </Dialog>
    </>
  );
}
