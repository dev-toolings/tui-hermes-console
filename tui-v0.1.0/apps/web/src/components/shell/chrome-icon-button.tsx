"use client";

import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

/**
 * Bouton d'icône de chrome : bascule de panneau, recherche, réglages.
 *
 * Ne pas utiliser `Button variant="ghost"` pour ça. Dans BoardUI, `ghost`
 * n'est pas transparent — c'est une surface teintée accent
 * (`--button-ghost: accent-500 18%`, texte `accent-300`). Sur une barre
 * d'en-tête, elle transforme une commande de chrome en action colorée : c'est
 * ce qui faisait diverger l'en-tête du tableau de bord de celui du chat, où
 * ces boutons étaient écrits à la main.
 *
 * Une seule définition, pour que le bouton soit le même partout.
 */
export function ChromeIconButton({ className, type, ...props }: ComponentProps<"button">) {
  return (
    <button
      type={type ?? "button"}
      className={cn(
        "inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-md",
        "text-muted-foreground transition-colors hover:bg-muted",
        className,
      )}
      {...props}
    />
  );
}
