"use client";

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@boardui/ui";
import { Link, usePathname } from "@/lib/router";
import { WORK_NAV, activeNavHref, navForCapabilities } from "./nav-config";

/**
 * Les objets de travail sont les premiers repères du rail. Les actions de
 * création restent dans Chat et Missions ; la recherche globale reste dans
 * l'en-tête et avec ⌘K, sans contrôle dupliqué ici.
 */
export function NavMain({
  capabilities,
}: {
  capabilities: ReadonlySet<string>;
}) {
  const pathname = usePathname();
  const navigation = navForCapabilities(WORK_NAV, capabilities);
  const activeHref = activeNavHref(navigation, pathname);

  return (
    <SidebarGroup>
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
