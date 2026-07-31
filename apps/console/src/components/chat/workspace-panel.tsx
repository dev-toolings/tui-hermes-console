"use client";

import { FileIcon, FolderIcon, HardDriveIcon, PanelRightIcon } from "lucide-react";
import { useRunDetails } from "@/components/run/run-page-chrome";
import { useRuntimeStatus } from "@/components/shell/use-runtime-status";
import { runtimeTargetLabel, runtimeTransportLabel } from "@console/core/lib/runtime/target";
import { formatTokens } from "@console/core/lib/run-status";
import { cn } from "@/lib/cn";

function formatSize(bytes?: number) {
  if (bytes == null) return null;
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

/**
 * Troisième panneau de la surface chat : l'espace de travail de la mission.
 *
 * Il répond à une question que l'UI laissait sans réponse — « ce fichier, il
 * est écrit où ? ». En tunnel SSH, `in/` et `out/` vivent sur la machine
 * distante, pas sur celle qui affiche la Console ; l'en-tête nomme donc l'hôte
 * réel d'exécution.
 */
export function WorkspacePanel({ onCollapse }: { onCollapse: () => void }) {
  const details = useRunDetails();
  const runtime = useRuntimeStatus();

  const outputs = details?.artifacts ?? [];
  const inputs = details?.inputArtifacts ?? [];
  const usage = details?.usage ?? null;

  // Même traitement que la sidebar de sessions : cette colonne vit dans le
  // panneau `inset`, elle en prend le fond pour ne pas masquer l'arête
  // arrondie du panneau, et se sépare du transcript par un simple filet.
  return (
    <aside className="flex h-full w-full flex-col border-l border-border bg-[var(--oc-sidebar-bg,#efeae2)] dark:bg-background">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border/60 px-3">
        <p className="min-w-0 flex-1 truncate text-[0.6875rem] font-semibold tracking-wider text-muted-foreground uppercase">
          Espace de travail
        </p>
        <button
          type="button"
          onClick={onCollapse}
          aria-label="Masquer l’espace de travail"
          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
        >
          <PanelRightIcon className="size-3.5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 scrollbar-subtle">
        <section>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-md bg-info-soft text-info-700",
              )}
            >
              <HardDriveIcon className="size-3.5" />
            </span>
            <div className="min-w-0">
              <p className="text-[0.6875rem] text-muted-foreground">Exécuté sur</p>
              <p className="truncate font-mono text-[0.75rem]" title={runtimeTargetLabel(runtime.runtime ?? EMPTY_RUNTIME)}>
                {runtime.runtime ? runtimeTargetLabel(runtime.runtime) : "…"}
              </p>
            </div>
          </div>
          {runtime.runtime ? (
            <p className="mt-1 pl-8 text-[0.6875rem] text-muted-foreground">
              {runtimeTransportLabel(runtime.runtime)}
            </p>
          ) : null}
        </section>

        <FileGroup label="in/" empty="Aucune pièce jointe" files={inputs} />
        <FileGroup label="out/" empty="Aucun fichier produit" files={outputs} />
      </div>

      {usage ? (
        <div className="shrink-0 border-t border-border/60 px-3 py-2.5">
          <p className="text-[0.6875rem] font-semibold tracking-wider text-muted-foreground uppercase">
            Tokens
          </p>
          {/* Empilé, pas côte à côte : dans 16 rem, « 79 846 in · 755 out »
              débordait hors du panneau. */}
          <p className="mt-1 font-mono text-sm tabular-nums">
            {formatTokens(usage.totalTokens)}
          </p>
          {/* Pas d'anneau de contexte : le runtime n'expose aucune taille de
              fenêtre, et un pourcentage inventé serait une donnée fausse. */}
          <p className="font-mono text-[0.6875rem] text-muted-foreground tabular-nums">
            {formatTokens(usage.inputTokens)} in · {formatTokens(usage.outputTokens)} out
          </p>
        </div>
      ) : null}
    </aside>
  );
}

const EMPTY_RUNTIME = {
  transport: "direct" as const,
  baseUrl: null,
  sshHost: null,
  sshPort: 22,
  sshUser: null,
};

function FileGroup({
  label,
  empty,
  files,
}: {
  label: string;
  empty: string;
  files: Array<{ id?: string; filename: string; sizeBytes?: number; downloadUrl?: string }>;
}) {
  return (
    <section className="mt-4">
      <div className="flex items-center gap-1.5 px-0.5">
        <FolderIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="font-mono text-[0.75rem] font-medium">{label}</span>
        <span className="text-[0.6875rem] text-muted-foreground tabular-nums">
          {files.length}
        </span>
      </div>

      {files.length === 0 ? (
        <p className="mt-1 pl-5 text-[0.6875rem] text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-1 flex flex-col gap-0.5">
          {files.map((file) => {
            const size = formatSize(file.sizeBytes);
            const row = (
              <>
                <FileIcon className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{file.filename}</span>
                {size ? (
                  <span className="shrink-0 text-[0.625rem] text-muted-foreground tabular-nums">
                    {size}
                  </span>
                ) : null}
              </>
            );
            return (
              <li key={file.id ?? file.filename}>
                {file.downloadUrl ? (
                  <a
                    href={file.downloadUrl}
                    className="flex items-center gap-1.5 rounded-md px-1.5 py-1 pl-3.5 text-[0.75rem] transition-colors hover:bg-muted"
                  >
                    {row}
                  </a>
                ) : (
                  <span className="flex items-center gap-1.5 px-1.5 py-1 pl-3.5 text-[0.75rem]">
                    {row}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
