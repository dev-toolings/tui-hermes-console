"use client";

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@boardui/ui";
import { Link, usePathname } from "@/lib/router";
import type { NavItem } from "./nav-config";
import { WORK_NAV, activeNavHref, navForCapabilities } from "./nav-config";

function groupBySection(items: NavItem[]) {
  const grouped = new Map<string, NavItem[]>();

  for (const item of items) {
    const section = item.section ?? "Navigation";
    const bucket = grouped.get(section);
    if (bucket) {
      bucket.push(item);
    } else {
      grouped.set(section, [item]);
    }
  }

  return [...grouped.entries()].map(([section, groupedItems]) => ({
    section,
    items: groupedItems,
  }));
}

/**
 * Les objets de travail sont les premiers repères du rail. Les actions de
 * création restent dans Chat et Sessions ; la recherche globale reste dans
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
  const sections = groupBySection(navigation);

  return (
    <>
      {sections.map((section, index) => (
        <SidebarGroup key={section.section} className={index === 0 ? "mt-0" : "mt-1"}>
          <SidebarGroupLabel className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {section.section}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {section.items.map((item) => (
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
      ))}
    </>
  );
}
