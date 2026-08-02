"use client";

import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@boardui/ui";
import { Link, usePathname } from "@/lib/router";
import { FOOTER_NAV, activeNavHref, navForCapabilities } from "./nav-config";

export function NavFooter({ capabilities }: { capabilities: ReadonlySet<string> }) {
  const pathname = usePathname();
  const navigation = navForCapabilities(FOOTER_NAV, capabilities);
  const activeHref = activeNavHref(navigation, pathname);

  return (
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
  );
}
