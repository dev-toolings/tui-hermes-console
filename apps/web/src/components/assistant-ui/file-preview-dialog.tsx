"use client";

import { Dialog } from "@/components/ui/dialog";
import { DownloadIcon, FileWarningIcon, LoaderCircleIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { DeleteArtifactButton } from "@/components/artifacts/delete-artifact-button";

export type FilePreviewKind = "pdf" | "image" | "word" | "excel" | "unsupported";

export function filePreviewKind(name: string, contentType?: string): FilePreviewKind {
  const mime = contentType?.toLowerCase() ?? "";
  const extension = name.toLowerCase().split(".").pop() ?? "";

  if (mime === "application/pdf" || extension === "pdf") return "pdf";
  if (mime.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "svg", "avif"].includes(extension)) {
    return "image";
  }
  if (
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    extension === "docx"
  ) {
    return "word";
  }
  if (
    mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    extension === "xlsx"
  ) {
    return "excel";
  }
  return "unsupported";
}

type FilePreviewDialogProps = {
  open: boolean;
  onClose: () => void;
  fileId: string;
  name: string;
  contentType?: string;
  canDelete?: boolean;
  onDeleted?: () => void;
};

type PreviewState =
  | { status: "idle" }
  | { status: "ready"; blobUrl?: string; buffer?: ArrayBuffer }
  | { status: "error"; message: string };

export function FilePreviewDialog({
  open,
  onClose,
  fileId,
  name,
  contentType,
  canDelete = false,
  onDeleted,
}: FilePreviewDialogProps) {
  const kind = filePreviewKind(name, contentType);
  const fileUrl = `/api/files/${encodeURIComponent(fileId)}`;
  const [state, setState] = useState<PreviewState>({ status: "idle" });
  const closePreview = () => {
    setState({ status: "idle" });
    onClose();
  };

  useEffect(() => {
    if (!open || kind === "unsupported") return;
    const controller = new AbortController();
    let blobUrl: string | undefined;

    void fetch(fileUrl, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Le fichier n’a pas pu être chargé.");
        const blob = await response.blob();
        if (kind === "pdf" || kind === "image") {
          blobUrl = URL.createObjectURL(blob);
          setState({ status: "ready", blobUrl });
          return;
        }
        setState({ status: "ready", buffer: await blob.arrayBuffer() });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "Le fichier n’a pas pu être chargé.",
        });
      });

    return () => {
      controller.abort();
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [fileUrl, kind, open]);

  return (
    <Dialog
      open={open}
      onClose={closePreview}
      title={name}
      description="Aperçu de la pièce jointe"
      className="h-[min(88dvh,900px)] max-w-6xl"
      footer={
        <>
          {canDelete ? (
            <DeleteArtifactButton
              artifactId={fileId}
              filename={name}
              onDeleted={() => {
                closePreview();
                onDeleted?.();
              }}
            />
          ) : null}
          <a
            href={fileUrl}
            download={name}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <DownloadIcon className="size-4" aria-hidden />
            Télécharger
          </a>
        </>
      }
    >
      <div className="flex h-full min-h-80 items-center justify-center overflow-auto rounded-lg bg-background">
        {kind === "unsupported" ? <UnsupportedPreview name={name} /> : null}
        {state.status === "idle" ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <LoaderCircleIcon className="size-4 animate-spin" aria-hidden />
            Chargement de l’aperçu…
          </div>
        ) : null}
        {state.status === "error" ? <PreviewError message={state.message} /> : null}
        {state.status === "ready" && kind === "pdf" && state.blobUrl ? (
          <iframe
            src={state.blobUrl}
            title={`Aperçu de ${name}`}
            className="h-full min-h-80 w-full border-0"
          />
        ) : null}
        {state.status === "ready" && kind === "image" && state.blobUrl ? (
          <img src={state.blobUrl} alt={name} className="max-h-full max-w-full object-contain" />
        ) : null}
        {state.status === "ready" && kind === "word" && state.buffer ? (
          <WordPreview buffer={state.buffer} />
        ) : null}
        {state.status === "ready" && kind === "excel" && state.buffer ? (
          <ExcelPreview buffer={state.buffer} />
        ) : null}
      </div>
    </Dialog>
  );
}

function WordPreview({ buffer }: { buffer: ArrayBuffer }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.replaceChildren();
    let cancelled = false;
    void import("docx-preview")
      .then(({ renderAsync }) => renderAsync(buffer.slice(0), container, undefined, {
        breakPages: true,
        ignoreWidth: false,
        ignoreHeight: false,
      }))
      .catch(() => {
        if (!cancelled) setError("L’aperçu Word n’a pas pu être généré.");
      });
    return () => {
      cancelled = true;
      container.replaceChildren();
    };
  }, [buffer]);

  if (error) return <PreviewError message={error} />;
  return <div ref={containerRef} className="docx-preview min-h-full w-full bg-neutral-200 p-4 text-neutral-950" />;
}

function ExcelPreview({ buffer }: { buffer: ArrayBuffer }) {
  const [rows, setRows] = useState<unknown[][] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void import("read-excel-file/browser")
      .then(({ readSheet }) => readSheet(buffer.slice(0)))
      .then((result) => {
        if (!cancelled) setRows(result);
      })
      .catch(() => {
        if (!cancelled) setError("L’aperçu Excel n’a pas pu être généré.");
      });
    return () => {
      cancelled = true;
    };
  }, [buffer]);

  const columns = useMemo(() => Math.max(0, ...(rows?.map((row) => row.length) ?? [0])), [rows]);
  if (error) return <PreviewError message={error} />;
  if (!rows) {
    return <LoaderCircleIcon className="size-4 animate-spin text-muted-foreground" aria-label="Chargement du tableau" />;
  }
  return (
    <div className="h-full w-full overflow-auto">
      <table className="min-w-full border-collapse text-left text-xs">
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className={rowIndex === 0 ? "bg-muted font-medium" : undefined}>
              {Array.from({ length: columns }, (_, columnIndex) => (
                <td key={columnIndex} className="border border-border px-3 py-2 align-top whitespace-pre-wrap">
                  {formatCell(row[columnIndex])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatCell(value: unknown) {
  if (value == null) return "";
  if (value instanceof Date) return new Intl.DateTimeFormat("fr-FR").format(value);
  return String(value);
}

function UnsupportedPreview({ name }: { name: string }) {
  return (
    <div className="max-w-sm px-6 text-center text-muted-foreground">
      <FileWarningIcon className="mx-auto mb-3 size-8" aria-hidden />
      <p className="font-medium text-foreground">Aperçu indisponible</p>
      <p className="mt-1 text-xs">Le format de {name} ne peut pas être affiché ici. Le téléchargement reste disponible.</p>
    </div>
  );
}

function PreviewError({ message }: { message: string }) {
  return (
    <div className="flex max-w-sm items-center gap-2 px-6 text-sm text-destructive">
      <FileWarningIcon className="size-4 shrink-0" aria-hidden />
      {message}
    </div>
  );
}
