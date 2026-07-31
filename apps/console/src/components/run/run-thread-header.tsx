"use client";

import { XuluxTooltipIconButton } from "@/components/xulux-chat/tooltip-icon-button";
import { useRunPageChromeActions } from "@/components/run/run-page-chrome";
import { useSidebar } from "@boardui/ui";
import { MenuIcon, PanelRightIcon } from "lucide-react";
import type { FC, ReactNode } from "react";
import type { ThreadPhase } from "./use-live-thread";

export const RunThreadHeader: FC<{
  title: string;
  trailing?: ReactNode;
  phase?: ThreadPhase;
}> = ({ title, trailing, phase = "ready" }) => {
  const { setOpenMobile } = useSidebar();
  const { openDetails } = useRunPageChromeActions();
  // Le titre appartient à l'en-tête dès qu'il est connu, même si le transcript
  // arrive encore : c'est tout l'intérêt de la phase `warm`.
  const showContent = phase !== "cold" && Boolean(title);

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 px-4">
      <button
        type="button"
        onClick={() => setOpenMobile(true)}
        aria-label="Ouvrir la navigation"
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-current transition-colors hover:bg-muted md:hidden"
      >
        <MenuIcon className="size-4" />
      </button>

      {showContent ? (
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{title}</span>
      ) : (
        <span className="h-4 min-w-0 flex-1 max-w-md animate-pulse rounded bg-muted" aria-hidden />
      )}

      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        {showContent ? trailing : null}
        <XuluxTooltipIconButton
          tooltip="Détails de la mission"
          onClick={openDetails}
          className="size-8"
          aria-label="Détails de la mission"
        >
          <PanelRightIcon className="size-4" />
        </XuluxTooltipIconButton>
      </div>
    </header>
  );
};
