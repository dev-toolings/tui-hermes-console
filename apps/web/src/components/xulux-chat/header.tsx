"use client";

import Link from "next/link";
import { PanelLeftIcon, SettingsIcon, ShareIcon } from "lucide-react";
import type { FC, ReactNode } from "react";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";

export const XuluxChatHeader: FC<{
  title: string;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  mobileSidebar?: ReactNode;
  providerLabel?: string;
  settingsHref?: string;
  trailing?: ReactNode;
}> = ({
  title,
  sidebarCollapsed,
  onToggleSidebar,
  mobileSidebar,
  providerLabel,
  settingsHref = "/settings/runtime",
  trailing,
}) => (
  <header className="flex h-12 shrink-0 items-center gap-2 px-4">
    {mobileSidebar}
    <TooltipIconButton
      variant="ghost"
      size="icon"
      tooltip={sidebarCollapsed ? "Afficher la liste" : "Masquer la liste"}
      side="bottom"
      onClick={onToggleSidebar}
      className="hidden size-8 md:flex"
    >
      <PanelLeftIcon className="size-4" />
    </TooltipIconButton>
    <span className="min-w-0 truncate text-sm font-medium">{title}</span>
    <div className="ml-auto flex items-center gap-1.5">
      {providerLabel ? (
        <span className="text-muted-foreground hidden h-8 items-center rounded-full border border-border px-2.5 text-xs font-medium sm:inline-flex">
          {providerLabel}
        </span>
      ) : null}
      <Link
        href={settingsHref}
        aria-label="Paramètres runtime"
        title="Paramètres runtime"
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-current transition-colors hover:bg-muted"
      >
        <SettingsIcon className="size-4" />
      </Link>
      <TooltipIconButton
        variant="ghost"
        size="icon"
        tooltip="Partager"
        side="bottom"
        disabled
        className="size-8"
      >
        <ShareIcon className="size-4" />
      </TooltipIconButton>
      {trailing}
    </div>
  </header>
);
