"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { formatTokens } from "@console/core/lib/run-status";
import { PanelLeftIcon } from "lucide-react";
import {
  clampResultPanelWidth,
  RESULT_PANEL_WIDTH,
} from "./panel-resize-handle";

const RAIL_WIDTH = 40;

const TOGGLE_PANEL_PATH =
  "M3 3H21C21.5523 3 22 3.44772 22 4V20C22 20.5523 21.5523 21 21 21H3C2.44772 21 2 20.5523 2 20V4C2 3.44772 2.44772 3 3 3ZM8 5H4V19H8V5ZM10 5V19H20V5H10Z";

export type ResultPanelProps = {
  width: number;
  collapsed: boolean;
  resizing?: boolean;
  onToggleCollapsed: () => void;
  execution: RunExecutionDetails | null;
  instructions: string;
  output: string | null;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number } | null;
  artifacts: { id?: string; filename: string; content: string; sizeBytes?: number; downloadUrl?: string }[];
  error: string | null;
  className?: string;
};

export type RunExecutionDetails = {
  requestedModel: string;
  activeModel: string | null;
  activeLabel?: string;
  reasoningTokens: number | null;
  toolCallCount: number | null;
  reasoningExposed: boolean;
};

export function ResultPanel({
  width,
  collapsed,
  resizing = false,
  onToggleCollapsed,
  execution,
  instructions,
  usage,
  artifacts,
  error,
  className,
}: ResultPanelProps) {
  return (
    <aside
      style={{ width: collapsed ? RAIL_WIDTH : width }}
      className={cn(
        "h-full shrink-0 flex-col overflow-hidden border-l border-ai-separator bg-background xl:flex",
        !resizing &&
          "transition-[width] duration-300 ease-[cubic-bezier(0.34,1.2,0.64,1)] will-change-[width]",
        className,
      )}
      aria-label="Détails de la mission"
    >
      <div
        className={cn(
          "flex min-h-10 shrink-0 items-center border-b border-ai-separator px-2",
          collapsed ? "justify-center" : "justify-end",
        )}
      >
        <button
          type="button"
          aria-label={collapsed ? "Afficher le panneau Résultat" : "Masquer le panneau Résultat"}
          aria-pressed={collapsed}
          title={collapsed ? "Afficher le panneau" : "Masquer le panneau"}
          onClick={onToggleCollapsed}
          className="flex size-8 items-center justify-center rounded-lg text-ai-icon-secondary transition-colors hover:bg-ai-tertiary hover:text-foreground"
        >
          {collapsed ? (
            <PanelLeftIcon className="size-4" />
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="size-4">
              <path d={TOGGLE_PANEL_PATH} />
            </svg>
          )}
        </button>
      </div>

      {collapsed ? null : (
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-subtle">
          <ResultPanelContent
            execution={execution}
            instructions={instructions}
            usage={usage}
            artifacts={artifacts}
            error={error}
          />
        </div>
      )}
    </aside>
  );
}

export function ResultPanelContent({
  execution,
  instructions,
  usage,
  artifacts,
  error,
}: Omit<ResultPanelProps, "width" | "collapsed" | "resizing" | "onToggleCollapsed" | "className" | "output">) {
  return (
    <div className="divide-y divide-ai-separator">
      {execution ? (
        <Section title="Exécution">
          <dl className="space-y-1.5 text-[0.8125rem]">
            <Row
              label={execution.activeLabel ?? "LLM actif"}
              value={
                execution.activeModel ? (
                  <code className="break-all font-mono text-[0.75rem]">
                    {execution.activeModel}
                  </code>
                ) : (
                  "Non exposé"
                )
              }
              strong
            />
            {execution.activeModel !== execution.requestedModel ? (
              <Row
                label="Modèle Console"
                value={
                  <code className="break-all font-mono text-[0.75rem]">
                    {execution.requestedModel}
                  </code>
                }
              />
            ) : null}
            <Row
              label="Reasoning"
              value={
                execution.reasoningTokens == null
                  ? "Non mesuré"
                  : `${formatTokens(execution.reasoningTokens)} tokens`
              }
            />
            <Row
              label="Outils"
              value={
                execution.toolCallCount == null
                  ? "Non mesuré"
                  : `${execution.toolCallCount} appel${execution.toolCallCount > 1 ? "s" : ""}`
              }
            />
          </dl>
          {execution.activeModel &&
          execution.activeModel !== execution.requestedModel ? (
            <p className="mt-2 text-[0.75rem] leading-5 text-muted-foreground">
              Le réglage Console actuel diffère du modèle réellement utilisé par Hermes sur
              cette mission.
            </p>
          ) : null}
          {execution.reasoningTokens != null &&
          execution.reasoningTokens > 0 &&
          !execution.reasoningExposed ? (
            <p className="mt-2 text-[0.75rem] leading-5 text-muted-foreground">
              Hermes mesure le raisonnement, mais ce protocole n&apos;en expose pas le contenu.
            </p>
          ) : null}
        </Section>
      ) : null}

      {error ? (
        <Section title="Erreur">
          <p className="rounded-2xl bg-neg-soft px-3 py-2 text-neg-700">{error}</p>
        </Section>
      ) : null}

      <Section title={`Fichiers produits (${artifacts.length})`}>
        {artifacts.length === 0 ? (
          <p className="text-muted-foreground">Aucun fichier produit.</p>
        ) : (
          <ul className="space-y-1">
            {artifacts.map((artifact) => (
              <li key={artifact.id ?? artifact.filename}>
                {artifact.downloadUrl ? (
                  <a
                    href={artifact.downloadUrl}
                    download={artifact.filename}
                    className="flex min-h-10 w-full items-center gap-2 rounded-2xl border border-ai-separator bg-ai-primary px-3 text-start shadow-board-xs transition-colors hover:bg-ai-tertiary"
                  >
                    <span className="font-mono text-[0.8125rem]">{artifact.filename}</span>
                    <span className="ms-auto text-[0.75rem] text-ai-icon-secondary">
                      {artifact.sizeBytes ?? new Blob([artifact.content]).size} o
                    </span>
                  </a>
                ) : (
                  <button
                    type="button"
                    className="flex min-h-10 w-full items-center gap-2 rounded-2xl border border-ai-separator bg-ai-primary px-3 text-start shadow-board-xs transition-colors hover:bg-ai-tertiary"
                  >
                    <span className="font-mono text-[0.8125rem]">{artifact.filename}</span>
                    <span className="ms-auto text-[0.75rem] text-ai-icon-secondary">
                      {new Blob([artifact.content]).size} o
                    </span>
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Consommation">
        {usage ? (
          <dl className="space-y-1 text-[0.8125rem]">
            <Row label="Entrée" value={formatTokens(usage.inputTokens)} />
            <Row label="Sortie" value={formatTokens(usage.outputTokens)} />
            <Row label="Total" value={formatTokens(usage.totalTokens)} strong />
            <p className="pt-1 text-[0.75rem] text-muted-foreground">
              Le prompt système d&apos;Hermes et ses outils sont refacturés à chaque mission.
            </p>
          </dl>
        ) : (
          <p className="text-muted-foreground">—</p>
        )}
      </Section>

      <Section title="Instructions de l'agent">
        <p className="whitespace-pre-wrap text-[0.8125rem] text-muted-foreground">{instructions}</p>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="px-4 py-4">
      <h2 className="mb-2 text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-ai-icon-secondary">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`tabular-nums ${strong ? "font-medium" : ""}`}>{value}</dd>
    </div>
  );
}

export function useResultPanelLayout() {
  const [width, setWidth] = useState<number>(RESULT_PANEL_WIDTH.default);
  const [collapsed, setCollapsed] = useState(false);
  const [resizing, setResizing] = useState(false);

  return {
    width,
    collapsed,
    resizing,
    setCollapsed,
    onResize: (delta: number) => {
      setWidth((current) => clampResultPanelWidth(current + delta));
    },
    onResizeStart: () => setResizing(true),
    onResizeEnd: () => setResizing(false),
  };
}
