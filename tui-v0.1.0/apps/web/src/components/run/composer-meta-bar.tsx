"use client";

import { FileIcon, HardDriveIcon, PanelRightIcon } from "lucide-react";
import { useRunDetails, useRunPageChromeActions } from "@/components/run/run-page-chrome";
import { useRuntimeStatus } from "@/components/shell/use-runtime-status";
import { formatXuluxModelLabel } from "@/components/xulux-chat/format-model-label";
import { runtimeTargetLabel } from "@console/core/lib/runtime/target";
import { formatTokens } from "@console/core/lib/run-status";
import { resolveContextModel } from "@console/core/lib/context-window";
import { threadContextModel, threadTotalTokens } from "@/lib/run-execution-details";
import { useRunThreadMeta } from "./run-thread-meta";
import { TokenRing } from "./token-ring";
import { useRuntimeSelectedModel } from "./use-runtime-selected-model";
import type { ThreadPhase } from "./use-live-thread";

/**
 * La ligne de contexte, sous le composer.
 *
 * Elle remplace la troisième colonne. Le panneau de droite prenait 16 rem en
 * permanence pour trois nombres et deux dossiers vides, et il ne pouvait
 * exister qu'au-dessus de 1280 px — la même information disparaissait donc sur
 * un écran plus étroit. Ici elle vit là où se porte le regard au moment d'agir,
 * juste sous la zone de saisie, et elle survit à toutes les largeurs.
 *
 * Elle ne montre que ce qui tient sur une ligne. Le détail complet — sortie,
 * instructions, artefacts téléchargeables, erreur — reste dans la feuille
 * « Détails de la mission », que chaque élément d'ici sait ouvrir.
 */
export function ComposerMetaBar({
  modelLabel,
  phase = "ready",
}: {
  modelLabel?: string;
  phase?: ThreadPhase;
}) {
  const details = useRunDetails();
  const runtime = useRuntimeStatus();
  const snapshot = useRunThreadMeta();
  const runtimeModel = useRuntimeSelectedModel();
  const { openDetails } = useRunPageChromeActions();

  const pending = phase === "cold" || !details || details.phase === "cold";
  const model = formatXuluxModelLabel(modelLabel);
  const inputs = details?.inputArtifacts?.length ?? 0;
  const outputs = details?.artifacts?.length ?? 0;
  // Le fil entier, pas le dernier run : c'est la conversation qui consomme la
  // fenêtre, et c'est elle qu'on relance message après message.
  const threadTokens = threadTotalTokens(snapshot);
  /**
   * Un agent Hermes peut tourner sous un alias (`hermes-agent`) qui ne dit rien
   * de sa fenêtre : c'est le modèle réellement servi par le fournisseur qui la
   * fixe. On propose donc les pistes dans l'ordre, et `resolveContextModel`
   * retient la première identifiable.
   */
  const contextModel = resolveContextModel([
    threadContextModel(snapshot),
    runtimeModel,
  ]);

  return (
    <div className="mx-auto flex w-full max-w-(--thread-max-width) items-center gap-2 px-3 pt-2 text-[0.6875rem] text-muted-foreground">
      {model ? (
        <span className="inline-flex h-5 max-w-[9rem] shrink-0 items-center truncate rounded-full bg-muted/70 px-2 font-medium">
          {model}
        </span>
      ) : pending ? (
        <span aria-hidden className="h-5 w-24 shrink-0 animate-pulse rounded-full bg-muted" />
      ) : null}

      {runtime.runtime ? (
        <span
          className="hidden min-w-0 items-center gap-1.5 sm:inline-flex"
          title={runtimeTargetLabel(runtime.runtime)}
        >
          <HardDriveIcon className="size-3 shrink-0" />
          <span className="truncate font-mono">{runtimeTargetLabel(runtime.runtime)}</span>
        </span>
      ) : (
        <span aria-hidden className="hidden h-3 w-32 animate-pulse rounded bg-muted sm:block" />
      )}

      <span className="ml-auto flex shrink-0 items-center gap-2">
        {pending ? (
          <span aria-hidden className="h-3 w-24 animate-pulse rounded bg-muted" />
        ) : (
          <>
            {/* Les compteurs restent affichés à zéro : une fois la conversation
                chargée, « aucun fichier » est une réponse, pas une absence. */}
            <button
              type="button"
              onClick={openDetails}
              className="inline-flex items-center gap-1 rounded px-1 py-0.5 font-mono transition-colors hover:bg-muted hover:text-foreground"
              title="Fichiers de la mission"
            >
              <FileIcon className="size-3" />
              in/{inputs} · out/{outputs}
            </button>
            {threadTokens != null ? (
              <span className="hidden font-mono tabular-nums sm:inline" title="Tokens cumulés">
                {formatTokens(threadTokens)} tk
              </span>
            ) : null}
            {/* L'anneau ne remplace pas le nombre : il lui donne une échelle.
                Absent si la fenêtre du modèle n'est pas connue. */}
            <TokenRing totalTokens={threadTokens} model={contextModel} />
          </>
        )}

        <button
          type="button"
          onClick={openDetails}
          aria-label="Détails de la mission"
          className="inline-flex size-5 items-center justify-center rounded transition-colors hover:bg-muted hover:text-foreground"
        >
          <PanelRightIcon className="size-3.5" />
        </button>
      </span>
    </div>
  );
}
