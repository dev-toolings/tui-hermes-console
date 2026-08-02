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
import { CONTROL_NAV, activeNavHref, navForCapabilities } from "./nav-config";

/**
 * Le séparateur marque le passage des objets de travail aux surfaces de
 * pilotage. Aucun titre de groupe n'est nécessaire dans ce rail compact.
 */
export function NavSecondary({
  capabilities,
  ...props
}: ComponentProps<typeof SidebarGroup> & { capabilities: ReadonlySet<string> }) {
  const pathname = usePathname();
  const navigation = navForCapabilities(CONTROL_NAV, capabilities);
  const activeHref = activeNavHref(navigation, pathname);

  return (
    <SidebarGroup className="border-t border-sidebar-border pt-3" {...props}>
      <SidebarGroupContent>
        <SidebarMenu>
          {navigation.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                asChild
                tooltip={item.label}
                isActive={activeHref === item.href}
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
