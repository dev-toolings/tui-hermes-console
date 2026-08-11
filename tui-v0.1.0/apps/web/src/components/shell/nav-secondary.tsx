"use client";

import type { ComponentProps } from "react";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@boardui/ui";
import { Link, usePathname } from "@/lib/router";
import { CONTROL_NAV, activeNavHref, navForCapabilities } from "./nav-config";

/**
 * Le séparateur marque le passage des objets de travail aux surfaces de
 * pilotage.
 */
export function NavSecondary({
  capabilities,
  ...props
}: ComponentProps<typeof SidebarGroup> & { capabilities: ReadonlySet<string> }) {
  const pathname = usePathname();
  const navigation = navForCapabilities(CONTROL_NAV, capabilities);
  const activeHref = activeNavHref(navigation, pathname);
  if (!navigation.length) return null;

  return (
    <SidebarGroup className="border-t border-sidebar-border pt-3" {...props}>
      <SidebarGroupLabel className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Pilotage
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu className="gap-0.5">
          {navigation.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                asChild
                tooltip={item.label}
                isActive={activeHref === item.href}
                size="sm"
              >
                <Link href={item.href}>
                  <item.icon />
                  <span>{item.label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
