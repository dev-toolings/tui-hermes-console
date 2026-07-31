"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@boardui/ui";
import { ResultPanelContent, type RunExecutionDetails } from "./result-panel";
import type { ThreadPhase } from "./use-live-thread";

export type RunPageDetails = {
  /**
   * Sans elle, le panneau workspace ne peut pas distinguer « la mission n'a
   * produit aucun fichier » de « on ne sait pas encore » : les deux arrivent
   * ici sous la forme d'un tableau vide, et il affichait « Aucun fichier
   * produit » avant même d'avoir interrogé le serveur.
   */
  phase?: ThreadPhase;
  execution: RunExecutionDetails | null;
  instructions: string;
  output: string | null;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number } | null;
  artifacts: {
    id?: string;
    filename: string;
    content: string;
    sizeBytes?: number;
    downloadUrl?: string;
  }[];
  /** Pièces jointes fournies à la mission — affichées par le panneau workspace
   *  du chat, qui montre `in/` et `out/` comme deux dossiers réels. */
  inputArtifacts?: {
    id?: string;
    filename: string;
    sizeBytes?: number;
    downloadUrl?: string;
  }[];
  error: string | null;
};

type RunDetailsContextValue = {
  details: RunPageDetails | null;
  setDetails: (details: RunPageDetails | null) => void;
  detailsOpen: boolean;
  openDetails: () => void;
  closeDetails: () => void;
};

const RunDetailsContext = createContext<RunDetailsContextValue | null>(null);

export function RunPageChromeProvider({ children }: { children: ReactNode }) {
  const [details, setDetails] = useState<RunPageDetails | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const value = useMemo(
    () => ({
      details,
      setDetails,
      detailsOpen,
      openDetails: () => setDetailsOpen(true),
      closeDetails: () => setDetailsOpen(false),
    }),
    [details, detailsOpen],
  );

  return (
    <RunDetailsContext.Provider value={value}>
      {children}
      {details ? (
        <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}>
          <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
            <SheetHeader className="border-b border-border px-4 py-3">
              <SheetTitle className="text-base">Détails de la mission</SheetTitle>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto scrollbar-subtle">
              <ResultPanelContent {...details} />
            </div>
          </SheetContent>
        </Sheet>
      ) : null}
    </RunDetailsContext.Provider>
  );
}

function useRunDetailsContext() {
  const context = useContext(RunDetailsContext);
  if (!context) {
    throw new Error("Run details context is missing.");
  }
  return context;
}

export function RunDetailsRegistrar({
  details,
  children,
}: {
  details: RunPageDetails;
  children: ReactNode;
}) {
  const { setDetails } = useRunDetailsContext();
  const detailsKey = useMemo(() => JSON.stringify(details), [details]);

  useEffect(() => {
    setDetails(details);
    return () => setDetails(null);
  }, [details, detailsKey, setDetails]);

  return children;
}

/** Détails de la mission courante, ou `null` hors d'une page mission.
 *  Alimenté par `RunDetailsRegistrar` — le panneau workspace du chat s'y
 *  branche plutôt que de refaire descendre le snapshot dans le layout. */
export function useRunDetails(): RunPageDetails | null {
  return useContext(RunDetailsContext)?.details ?? null;
}

export function useRunPageChromeActions() {
  const context = useContext(RunDetailsContext);
  return {
    openDetails: () => context?.openDetails(),
  };
}
