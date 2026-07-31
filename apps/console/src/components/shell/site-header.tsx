"use client";

import { ChevronRightIcon, PanelLeftIcon, SearchIcon } from "lucide-react";
import { Separator, useSidebar } from "@boardui/ui";
import { Link, usePathname } from "@/lib/router";
import { cn } from "@/lib/cn";
import { ChromeIconButton } from "./chrome-icon-button";
import { pageMeta } from "./nav-config";
import { useRuntimeStatus } from "./use-runtime-status";

export function SiteHeader({ onOpenPalette }: { onOpenPalette: () => void }) {
  const pathname = usePathname();
  const meta = pageMeta(pathname);
  const runtime = useRuntimeStatus();
  const { toggleSidebar } = useSidebar();

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <ChromeIconButton
          onClick={toggleSidebar}
          aria-label="Basculer la barre latérale"
          className="-ml-1"
        >
          <PanelLeftIcon className="size-4" />
        </ChromeIconButton>
        <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />

        <nav aria-label="Fil d’Ariane" className="flex min-w-0 items-center gap-1.5">
          {meta.parent ? (
            <>
              <Link
                href={meta.parent.href}
                className="hidden text-sm text-muted-foreground hover:text-foreground sm:inline"
              >
                {meta.parent.label}
              </Link>
              <ChevronRightIcon className="hidden size-3.5 shrink-0 text-muted-foreground sm:inline" />
            </>
          ) : null}
          <h1 className="min-w-0 truncate text-base font-medium">{meta.title}</h1>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/settings/runtime"
            title={`${runtime.title} — ${runtime.detail}`}
            className="flex items-center gap-2 rounded-lg px-2 py-1 text-[0.75rem] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <span aria-hidden className={cn("size-2 rounded-full", runtime.dotClass)} />
            <span className="hidden max-w-40 truncate sm:inline">{runtime.title}</span>
          </Link>
          <ChromeIconButton
            onClick={onOpenPalette}
            aria-label="Recherche rapide"
            className="hidden sm:inline-flex"
          >
            <SearchIcon className="size-4" />
          </ChromeIconButton>
        </div>
      </div>
    </header>
  );
}
