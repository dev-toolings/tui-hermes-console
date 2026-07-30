"use client";

import { type ReactNode, useState } from "react";
import { MenuIcon } from "lucide-react";
import { XuluxChatHeader } from "./header";
import { XuluxChatSidebar, XuluxMobileSidebar } from "./sidebar";

/** Shell exact de v1-xulux/d/chat — Base export. */
export function XuluxChatBase({
  threadId,
  title,
  providerLabel,
  main,
  trailing,
  alerts,
  showSidebar = false,
}: {
  threadId?: string;
  title: string;
  providerLabel?: string;
  main: ReactNode;
  trailing?: ReactNode;
  alerts?: ReactNode;
  /** Affiche la liste des conversations (surface Chat). */
  showSidebar?: boolean;
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const sidebarVisible = showSidebar || Boolean(threadId);

  return (
    <div className="bg-muted/30 flex h-full min-h-0 w-full">
      {sidebarVisible ? (
        <div className="hidden md:block">
          <XuluxChatSidebar
            activeId={threadId ?? ""}
            collapsed={sidebarCollapsed}
          />
        </div>
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-2 md:pl-0">
        <div className="bg-background flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg">
          <XuluxChatHeader
            title={title}
            sidebarCollapsed={sidebarCollapsed}
            onToggleSidebar={() => setSidebarCollapsed((value) => !value)}
            providerLabel={providerLabel}
            trailing={trailing}
            mobileSidebar={
              sidebarVisible ? (
                <button
                  type="button"
                  aria-label="Ouvrir les conversations"
                  onClick={() => setMobileOpen(true)}
                  className="flex size-8 shrink-0 items-center justify-center rounded-md md:hidden"
                >
                  <MenuIcon className="size-4" />
                </button>
              ) : null
            }
          />
          {alerts}
          <main className="min-h-0 flex-1 overflow-hidden">{main}</main>
        </div>
      </div>

      {mobileOpen && sidebarVisible ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Fermer"
            className="absolute inset-0 bg-neutral-950/50"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 shadow-lg">
            <XuluxMobileSidebar
              activeId={threadId ?? ""}
              onClose={() => setMobileOpen(false)}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
