"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BellIcon,
  Building2Icon,
  CheckIcon,
  ChevronDownIcon,
  LogOutIcon,
  PaletteIcon,
  SettingsIcon,
  UserCircleIcon,
} from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@boardui/ui";
import { useRouter } from "@/lib/router";
import { selectSitePayload, type AuthSiteContext } from "@/lib/auth-site-context";

type AuthUser = {
  email: string;
  name: string | null;
};

type AuthState = {
  user: AuthUser;
  siteContext: AuthSiteContext;
};

function csrfToken() {
  return document.cookie
    .split("; ")
    .find((cookie) => cookie.startsWith("hc_csrf="))
    ?.split("=")[1];
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toLocaleUpperCase();
}

/**
 * Pied du rail : l’identité appartient désormais au fournisseur Google et la
 * fermeture de session invalide aussi le jeton côté Console.
 */
export function NavUser() {
  const { isMobile } = useSidebar();
  const router = useRouter();
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [switchingSite, setSwitchingSite] = useState<string | null>(null);
  const [siteSwitchError, setSiteSwitchError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetch("/api/auth", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json()) as {
          authenticated?: boolean;
          user?: AuthUser | null;
          siteContext?: AuthSiteContext | null;
        };
        if (response.ok && body.authenticated && body.user?.email && body.siteContext) {
          return { user: body.user, siteContext: body.siteContext };
        }
        return null;
      })
      .then((nextAuth) => {
        if (active) setAuth(nextAuth);
      })
      .catch(() => {
        if (active) setAuth(null);
      });
    return () => {
      active = false;
    };
  }, []);

  const user = auth?.user ?? null;
  const displayName = useMemo(() => user?.name?.trim() || user?.email?.split("@")[0] || "Compte Google", [user]);
  const email = user?.email ?? "Identité vérifiée par Google";

  const switchSite = async (siteId: string) => {
    if (siteId === auth?.siteContext.activeSite?.id || switchingSite) return;
    setSwitchingSite(siteId);
    setSiteSwitchError(null);
    try {
      const response = await fetch("/api/auth?action=select-site", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Hermes-Toast": "0" },
        body: JSON.stringify(selectSitePayload(siteId)),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setSiteSwitchError(body?.error?.message ?? "Le changement de site a échoué.");
        return;
      }
      // Un reload complet ferme les SSE et purge tous les états dérivés du site précédent.
      window.location.assign("/");
    } finally {
      setSwitchingSite(null);
    }
  };

  const signOut = async () => {
    setSigningOut(true);
    try {
      const response = await fetch("/api/auth?action=logout", {
        method: "POST",
        headers: { "X-Hermes-Toast": "0", "X-CSRF-Token": decodeURIComponent(csrfToken() ?? "") },
      });
      if (response.ok) router.replace("/setup");
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="h-auto cursor-pointer rounded-xl border-2 border-transparent bg-muted py-2 pl-2.5 pr-3 transition-colors hover:border-border hover:bg-muted data-open:border-border data-open:bg-muted data-open:text-foreground"
            >
              <Avatar className="size-8 rounded-full">
                <AvatarFallback className="rounded-full bg-primary/12 text-[0.6875rem] font-semibold text-primary">
                  {initials(displayName)}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{displayName}</span>
                <span className="truncate text-xs text-muted-foreground">{email}</span>
              </div>
              <span className="ml-auto grid size-4 place-items-center rounded-[3px] bg-input text-muted-foreground">
                <ChevronDownIcon className="size-3 transition-transform duration-200 group-data-[state=open]:rotate-180" aria-hidden />
              </span>
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[265px] rounded-2xl border-border bg-card p-2.5 shadow-[var(--shadow-elevated)]"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={8}
          >
            <DropdownMenuLabel className="px-2 pb-2 pt-1 font-normal">
              <div className="flex items-center gap-2 text-left">
                <Avatar className="size-8 rounded-full">
                  <AvatarFallback className="rounded-full bg-primary/12 text-[0.6875rem] font-semibold text-primary">
                    {initials(displayName)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground">{displayName}</span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">{email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            {auth?.siteContext.activeSite ? (
              <>
                <DropdownMenuSeparator className="-mx-2.5 my-2.5 bg-muted" />
                <DropdownMenuGroup className="space-y-1">
                  <DropdownMenuLabel className="px-2 pb-0 pt-1 text-xs font-medium text-muted-foreground">
                    Site actif
                  </DropdownMenuLabel>
                  {auth.siteContext.memberships.map((site) => {
                    const activeSite = site.id === auth.siteContext.activeSite?.id;
                    return (
                      <DropdownMenuItem
                        key={site.id}
                        className="gap-2 rounded-[10px] p-2 text-foreground/80 focus:bg-muted"
                        disabled={activeSite || switchingSite !== null}
                        onSelect={() => void switchSite(site.id)}
                      >
                        <Building2Icon className="size-5 text-muted-foreground" aria-hidden />
                        <span className="min-w-0 flex-1 truncate">{site.name}</span>
                        {activeSite ? <CheckIcon className="size-4 text-primary" aria-label="Site actif" /> : null}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuGroup>
                {siteSwitchError ? (
                  <DropdownMenuLabel
                    role="alert"
                    className="px-2 py-1 text-xs font-normal leading-4 text-destructive"
                  >
                    {siteSwitchError}
                  </DropdownMenuLabel>
                ) : null}
              </>
            ) : null}
            <DropdownMenuSeparator className="-mx-2.5 my-2.5 bg-muted" />
            <DropdownMenuGroup className="space-y-1">
              <DropdownMenuItem className="gap-2 rounded-[10px] p-2 text-foreground/80 focus:bg-muted" onSelect={() => router.push("/settings")}>
                <UserCircleIcon className="size-5 text-muted-foreground" />
                Paramètres
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2 rounded-[10px] p-2 text-foreground/80 focus:bg-muted" onSelect={() => router.push("/settings/appearance")}>
                <PaletteIcon className="size-5 text-muted-foreground" />
                Apparence
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2 rounded-[10px] p-2 text-foreground/80 focus:bg-muted" onSelect={() => router.push("/settings/notifications")}>
                <BellIcon className="size-5 text-muted-foreground" />
                Notifications
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator className="-mx-2.5 my-2.5 bg-muted" />
            <DropdownMenuGroup className="space-y-1">
              <DropdownMenuLabel className="px-2 pb-0 pt-1 text-sm font-medium text-muted-foreground">Console</DropdownMenuLabel>
              <DropdownMenuItem className="gap-2 rounded-[10px] p-2 text-foreground/80 focus:bg-muted" onSelect={() => router.push("/settings/runtime")}>
                <SettingsIcon className="size-5 text-muted-foreground" />
                Runtime Hermes
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2 rounded-[10px] p-2 text-foreground/80 focus:bg-muted" disabled={signingOut} onSelect={() => void signOut()}>
                <LogOutIcon className="size-5 text-muted-foreground" />
                {signingOut ? "Déconnexion…" : "Se déconnecter"}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
