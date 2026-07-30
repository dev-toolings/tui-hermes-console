import Link from "next/link";
import { DownloadIcon, FileIcon, FolderOpenIcon } from "lucide-react";
import { Badge, Card, CardSurface, PageShell, SectionHeading } from "@/components/ui/boardui";
import { listAllArtifacts } from "@/modules/artifacts/repository";
import { formatBytes } from "@/modules/settings/storage-stats";

export const dynamic = "force-dynamic";

export default async function ArtifactsPage() {
  const rows = await listAllArtifacts(100);

  return (
    <PageShell>
      <SectionHeading
        title="Fichiers de mission"
        description="Entrées déposées et sorties détectées dans l’espace de travail partagé."
      />
      <Card>
        <CardSurface className="p-0">
          <div className="flex items-center justify-between gap-3 border-b border-seam px-4 py-3.5">
            <span className="flex items-center gap-2 text-[0.8125rem] font-medium">
              <FolderOpenIcon className="size-4 text-muted-foreground" />
              Tous les artefacts
            </span>
            <Badge>{rows.length} fichiers</Badge>
          </div>
          <div className="divide-y divide-border">
            {rows.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                Aucun fichier pour l’instant. Joignez un fichier à une mission pour commencer.
              </p>
            ) : (
              rows.map((artifact) => (
                <div
                  key={artifact.id}
                  className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-ai-tertiary text-muted-foreground">
                      <FileIcon className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-mono text-[0.75rem] font-medium">
                        {artifact.filename}
                      </span>
                      <span className="mt-0.5 block truncate text-[0.6875rem] text-muted-foreground">
                        {artifact.runId} · {new Date(artifact.createdAt).toLocaleString("fr-FR")}
                      </span>
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge tone={artifact.direction === "output" ? "success" : "info"}>
                      {artifact.direction === "output" ? "Sortie" : "Entrée"}
                    </Badge>
                    <span className="font-mono text-[0.6875rem] text-muted-foreground">
                      {formatBytes(artifact.sizeBytes)}
                    </span>
                  </span>
                  <span className="flex items-center justify-end gap-1">
                    <Link
                      href={`/runs/${artifact.runId}`}
                      className="rounded-lg px-2 py-1.5 text-[0.6875rem] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      Mission
                    </Link>
                    <a
                      href={`/api/files/${encodeURIComponent(artifact.id)}`}
                      download={artifact.filename}
                      aria-label={`Télécharger ${artifact.filename}`}
                      className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <DownloadIcon className="size-4" />
                    </a>
                  </span>
                </div>
              ))
            )}
          </div>
        </CardSurface>
      </Card>
    </PageShell>
  );
}
