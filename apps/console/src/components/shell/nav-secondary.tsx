"use client";

import type { ComponentProps } from "react";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@boardui/ui";
import { Link, usePathname } from "@/lib/router";
import { cn } from "@/lib/cn";
import { SECONDARY_NAV, activeNavHref, navForCapabilities } from "./nav-config";
import { useRuntimeStatus } from "./use-runtime-status";

/**
 * Bloc bas du rail (`mt-auto`). L'entrée Runtime porte la pastille d'état :
 * elle remplace la carte de statut de l'ancien rail, qui disparaissait
 * entièrement en mode icône.
 */
export function NavSecondary({
  capabilities,
  ...props
}: ComponentProps<typeof SidebarGroup> & { capabilities: ReadonlySet<string> }) {
  const pathname = usePathname();
  const navigation = navForCapabilities(SECONDARY_NAV, capabilities);
  const activeHref = activeNavHref(navigation, pathname);
  const runtime = useRuntimeStatus();

  return (
    <SidebarGroup {...props}>
      <SidebarGroupContent>
        <SidebarMenu>
          {navigation.map((item) => {
            const isRuntime = item.href === "/settings/runtime";
            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  asChild
                  tooltip={isRuntime ? `${item.label} — ${runtime.title}` : item.label}
                  isActive={activeHref === item.href}
                >
                  <Link
                    href={item.href}
                    aria-label={isRuntime ? `${item.label} — ${runtime.title}` : undefined}
                  >
                    <span className="relative flex shrink-0 items-center">
                      <item.icon />
                      {isRuntime ? (
                        <span
                          aria-hidden
                          className={cn(
                            "absolute -right-1 -bottom-0.5 size-2 rounded-full border-2 border-sidebar",
                            runtime.dotClass,
                          )}
                        />
                      ) : null}
                    </span>
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
