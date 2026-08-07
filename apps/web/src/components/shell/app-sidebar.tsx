"use client";

import type { ComponentProps } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
} from "@boardui/ui";
import { Link } from "@/lib/router";
import { NavFooter } from "./nav-footer";
import { NavMain } from "./nav-main";
import { NavSecondary } from "./nav-secondary";
import { NavUser } from "./nav-user";
import { RuntimeStatusCard } from "./runtime-status-card";
import { DEFAULT_CONSOLE_PATH } from "./nav-config";

export function AppSidebar({
  capabilities,
  ...props
}: ComponentProps<typeof Sidebar> & {
  capabilities: ReadonlySet<string>;
}) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <div className="flex items-center gap-1">
          <SidebarMenu className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <SidebarMenuItem>
              <SidebarMenuButton asChild className="data-[slot=sidebar-menu-button]:p-1.5!">
                <Link href={DEFAULT_CONSOLE_PATH}>
                  <img
                    src="/brand/hermes-console-favicon.png"
                    alt=""
                    width="24"
                    height="24"
                    className="size-6 shrink-0 rounded-md object-contain"
                  />
                  <span className="text-base font-semibold">Hermes Console</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <SidebarTrigger
            aria-label="Basculer la barre latérale"
            title="Basculer la barre latérale"
            className="size-8 shrink-0"
          />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <NavMain capabilities={capabilities} />
        <NavSecondary capabilities={capabilities} />
      </SidebarContent>

      <SidebarFooter>
        <NavFooter capabilities={capabilities} />
        <RuntimeStatusCard />
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}
