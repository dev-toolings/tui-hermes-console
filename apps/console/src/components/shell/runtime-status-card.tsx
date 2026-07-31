"use client";

import { ServerIcon } from "lucide-react";
import { Link } from "@/lib/router";
import { cn } from "@/lib/cn";
import { runtimeTransportLabel } from "@console/core/lib/runtime/target";
import { useRuntimeStatus } from "./use-runtime-status";

/**
 * Carte de connexion au runtime Hermes, en pied de rail.
 *
 * PRODUCT.md, « Montrer la vérité du runtime » : la pastille de `NavSecondary`
 * dit seulement si ça va, la carte dit *à quoi* la Console est branchée —
 * l'hôte réel (en tunnel, `kev@vps → 127.0.0.1:8642`) et la nature du lien.
 * Elle disparaît en mode icône, où la pastille prend le relais.
 */
export function RuntimeStatusCard() {
  const runtime = useRuntimeStatus();

  return (
    <Link
      href="/settings/runtime"
      title={`${runtime.title} — ${runtime.detail}`}
      className="block rounded-lg border border-sidebar-border bg-sidebar-accent/40 p-3 transition-colors group-data-[collapsible=icon]:hidden hover:bg-sidebar-accent"
    >
      <div className="flex items-center gap-2.5">
        <span className="relative flex size-7 shrink-0 items-center justify-center rounded-lg bg-info-soft text-info-700">
          <ServerIcon className="size-3.5" />
          <span
            aria-hidden
            className={cn(
              "absolute -right-0.5 -bottom-0.5 size-2 rounded-full border-2 border-sidebar",
              runtime.dotClass,
            )}
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium">{runtime.title}</span>
          <span className="block truncate text-[0.6875rem] text-muted-foreground">
            {runtime.detail}
          </span>
        </span>
      </div>

      {runtime.runtime?.configured ? (
        <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-sidebar-border pt-2 text-[0.6875rem] text-muted-foreground">
          <span className="truncate">{runtimeTransportLabel(runtime.runtime)}</span>
          <span className={cn("shrink-0", !runtime.runtime.tokenConfigured && "text-warning")}>
            {runtime.runtime.tokenConfigured ? "Token en place" : "Token manquant"}
          </span>
        </div>
      ) : null}
    </Link>
  );
}
