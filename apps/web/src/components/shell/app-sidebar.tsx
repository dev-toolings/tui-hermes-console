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
        <SidebarMenu>
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
