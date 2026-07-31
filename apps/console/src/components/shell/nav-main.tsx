"use client";

import { PlusCircleIcon, SearchIcon } from "lucide-react";
import {
  Button,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@boardui/ui";
import { Link, usePathname } from "@/lib/router";
import { PRIMARY_NAV, activeNavHref } from "./nav-config";

/**
 * Bloc principal du rail, dans la disposition `nav-main` de dashboard-01 :
 * une action de création mise en avant, un déclencheur secondaire, puis la
 * navigation. Le « Quick Create » du bloc devient « Nouvelle mission », et le
 * bouton courrier devient l'entrée de la palette ⌘K.
 */
export function NavMain({ onOpenPalette }: { onOpenPalette: () => void }) {
  const pathname = usePathname();
  const activeHref = activeNavHref(PRIMARY_NAV, pathname);

  return (
    <SidebarGroup>
      <SidebarGroupContent className="flex flex-col gap-2">
        <SidebarMenu>
          <SidebarMenuItem className="flex items-center gap-2">
            <SidebarMenuButton
              asChild
              tooltip="Nouvelle mission"
              className="min-w-8 bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--shadow-xs)] duration-200 ease-linear hover:bg-[image:var(--gradient-primary-hover)] hover:text-primary-foreground active:bg-[image:var(--gradient-primary-active)] active:text-primary-foreground"
            >
              <Link href="/runs/new">
                <PlusCircleIcon />
                <span>Nouvelle mission</span>
              </Link>
            </SidebarMenuButton>
            <Button
              variant="outline"
              size="icon-sm"
              iconOnly
              onClick={onOpenPalette}
              className="size-8 group-data-[collapsible=icon]:opacity-0"
            >
              <SearchIcon className="size-4" />
              <span className="sr-only">Recherche rapide</span>
            </Button>
          </SidebarMenuItem>
        </SidebarMenu>

        <SidebarMenu>
          {PRIMARY_NAV.map((item) => (
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
