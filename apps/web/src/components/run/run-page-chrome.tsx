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

export type RunPageDetails = {
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

export function useRunPageChromeActions() {
  const context = useContext(RunDetailsContext);
  return {
    openDetails: () => context?.openDetails(),
  };
}
