"use client";

import { makeAssistantToolUI } from "@assistant-ui/react";
import { formatDuration } from "@/lib/run-status";
import { cn } from "@/lib/cn";

export const HermesToolCallUI = makeAssistantToolUI<
  Record<string, unknown>,
  {
    durationMs: number | null;
    error: boolean;
    hasResultPayload: boolean;
    output?: unknown;
  }
>({
  toolName: "hermes_tool",
  render: ({ args, result, status }) => {
    const running = status.type === "running" || !result;
    const tool = String(args.tool ?? "outil");

    return (
      <HermesToolCard
        tool={tool}
        target={args.preview == null ? tool : String(args.preview)}
        running={running}
        failed={result?.error === true}
        durationMs={result?.durationMs ?? null}
        hasResultPayload={result?.hasResultPayload ?? null}
        output={result?.output}
      />
    );
  },
});

export function HermesToolCard({
  tool,
  target,
  running,
  failed,
  durationMs,
  hasResultPayload,
  output,
}: {
  tool: string;
  target: string;
  running: boolean;
  failed: boolean;
  durationMs: number | null;
  hasResultPayload: boolean | null;
  output?: unknown;
}) {
  return (
    <div
      className={cn(
        "my-1 w-[341px] max-w-full overflow-hidden rounded-2xl border bg-ai-primary text-[0.8125rem] shadow-board-xs",
        failed ? "border-destructive/40" : "border-ai-separator",
      )}
    >
      <div className="flex min-h-10 items-center gap-2 px-3 py-2">
        <ToolIcon tool={tool} failed={failed} />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-baseline gap-1.5">
            <span className="shrink-0 text-muted-foreground">{toolVerb(tool)}</span>
            <span className="min-w-0 truncate font-mono text-[0.75rem]" title={target}>
              {target}
            </span>
          </span>
        </span>
        <span
          className={cn(
            "shrink-0 tabular text-[0.75rem]",
            failed ? "text-destructive" : "text-ai-icon-secondary",
          )}
        >
          {running ? "en cours…" : durationMs != null ? formatDuration(durationMs) : ""}
        </span>
      </div>

      {failed ? (
        <p className="border-t border-destructive/20 px-3 py-2 text-destructive">
          L&apos;outil a signalé une erreur.
        </p>
      ) : null}

      {!running && hasResultPayload === false ? (
        <p className="border-t border-ai-separator px-3 py-1.5 text-[0.75rem] text-ai-icon-secondary">
          Sortie non transmise par le runtime
        </p>
      ) : null}

      {!running && hasResultPayload && output != null ? (
        // Repliée par défaut : cinq sorties d'outil dépliées poussent la
        // réponse de l'agent hors de l'écran. On montre la première ligne
        // comme aperçu, le détail reste à un clic.
        <details className="group/output border-t border-ai-separator">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-1.5 text-[0.75rem] text-ai-icon-secondary transition-colors hover:text-foreground">
            <svg
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden
              className="size-3 shrink-0 transition-transform group-open/output:rotate-90"
            >
              <path d="M9 6l6 6-6 6z" />
            </svg>
            <span className="min-w-0 flex-1 truncate font-mono">
              {previewToolOutput(output)}
            </span>
          </summary>
          <pre className="max-h-52 overflow-auto px-3 pb-2 whitespace-pre-wrap break-words font-mono text-[0.75rem] scrollbar-subtle">
            {formatToolOutput(output)}
          </pre>
        </details>
      ) : null}
    </div>
  );
}

function ToolIcon({ tool, failed }: { tool: string; failed: boolean }) {
  const path =
    tool === "read_file"
      ? "M7 6V3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h3ZM5 8v12h10V8H5Zm4-2h8v10h2V4H9v2Z"
      : tool === "write_file"
        ? "M5 3h11l3 3v15H5V3Zm2 2v14h10V7.5L14.5 5H7Zm2 8h6v2H9v-2Zm0-4h6v2H9V9Z"
        : tool === "execute_code"
          ? "m8.7 16.7-1.4 1.4L1.2 12l6.1-6.1 1.4 1.4L4 12l4.7 4.7Zm6.6 0L20 12l-4.7-4.7 1.4-1.4 6.1 6.1-6.1 6.1-1.4-1.4ZM13.9 3.5l-3.8 17-2-.4 3.8-17 2 .4Z"
          : "M10.5 3a7.5 7.5 0 1 1-4.68 13.36L2.59 19.6l-1.42-1.42 3.24-3.23A7.5 7.5 0 0 1 10.5 3Zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z";

  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className={`size-3.5 shrink-0 ${failed ? "text-destructive" : "text-ai-icon-secondary"}`}
    >
      <path d={path} />
    </svg>
  );
}

function toolVerb(tool: string) {
  const verbs: Record<string, string> = {
    read_file: "Lecture",
    write_file: "Écriture",
    execute_code: "Exécution",
    list_dir: "Parcours",
    glob: "Recherche",
    grep: "Recherche",
  };
  return verbs[tool] ?? tool;
}

/**
 * Enveloppe que Hermes pose autour de toute donnée venue de l'extérieur :
 * balise ouvrante, avertissement fixe, balise fermante. Elle est conservée dans
 * la vue dépliée — c'est la sortie réelle du runtime — mais la répéter dans
 * l'aperçu de cinq cartes n'apprendrait rien.
 */
const UNTRUSTED_PREAMBLE = [
  "<untrusted_tool_result",
  "</untrusted_tool_result>",
  "The following content was retrieved",
];

/** Première ligne porteuse d'information, pour l'aperçu replié. */
function previewToolOutput(output: unknown) {
  const value = typeof output === "string" ? output : JSON.stringify(output);
  if (!value) return "Sortie vide";
  const line = value
    .split("\n")
    .map((item) => item.trim())
    .find(
      (item) =>
        item.length > 0 && !UNTRUSTED_PREAMBLE.some((prefix) => item.startsWith(prefix)),
    );
  const preview = line ?? value.trim();
  return preview.length > 120 ? `${preview.slice(0, 117)}…` : preview;
}

function formatToolOutput(output: unknown) {
  const value = typeof output === "string" ? output : JSON.stringify(output, null, 2);
  if (!value) return "Sortie vide";
  return value.length > 12_000 ? `${value.slice(0, 12_000)}\n…` : value;
}
