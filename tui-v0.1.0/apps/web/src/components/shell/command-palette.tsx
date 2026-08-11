"use client";

import { ChevronRightIcon, SearchIcon, XIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { useRouter } from "@/lib/router";
import { ALL_NAV, navForCapabilities } from "./nav-config";

export function CommandPalette({
  open,
  onClose,
  capabilities,
}: {
  open: boolean;
  onClose: () => void;
  capabilities: ReadonlySet<string>;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const items = useMemo(
    () => navForCapabilities(ALL_NAV, capabilities),
    [capabilities],
  );
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("fr");
    return normalized
      ? items.filter((item) => item.label.toLocaleLowerCase("fr").includes(normalized))
      : items;
  }, [items, query]);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      setQuery("");
      setActive(0);
      inputRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [open, onClose]);

  if (!open) return null;

  const select = (href: string) => {
    router.push(href);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-neutral-950/50 p-4"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Recherche rapide"
        onMouseDown={(event) => event.stopPropagation()}
        className="grid max-h-[calc(100dvh-4rem)] w-full max-w-xl gap-3 overflow-hidden rounded-2xl border border-border bg-surface-sunken p-1 shadow-board-elevated"
      >
        <div className="flex h-12 items-center px-3">
          <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActive((value) => Math.min(value + 1, filtered.length - 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive((value) => Math.max(value - 1, 0));
              } else if (event.key === "Enter" && filtered[active]) {
                event.preventDefault();
                select(filtered[active].href);
              }
            }}
            placeholder="Rechercher une page ou une action…"
            className="h-full min-w-0 flex-1 bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground"
          />
          {query ? (
            <button
              type="button"
              aria-label="Effacer la recherche"
              onClick={() => setQuery("")}
              className="flex size-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
            >
              <XIcon className="size-4" />
            </button>
          ) : null}
        </div>

        <div
          role="listbox"
          className="max-h-80 overflow-y-auto rounded-xl bg-card p-1 shadow-board-xs scrollbar-subtle"
        >
          {filtered.length ? (
            <>
              <p className="px-2 py-1.5 text-[0.6875rem] font-medium text-muted-foreground">
                Navigation Hermes Console
              </p>
              {filtered.map((item, index) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.href}
                    type="button"
                    role="option"
                    aria-selected={active === index}
                    onMouseMove={() => setActive(index)}
                    onClick={() => select(item.href)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-start text-[0.8125rem] transition-colors",
                      active === index ? "bg-muted text-foreground" : "text-muted-foreground",
                    )}
                  >
                    <Icon className="size-4" />
                    <span className="flex-1">{item.label}</span>
                    <ChevronRightIcon className="size-3.5 opacity-50" />
                  </button>
                );
              })}
            </>
          ) : (
            <p className="px-3 py-8 text-center text-[0.8125rem] text-muted-foreground">
              Aucun résultat.
            </p>
          )}
        </div>

        <div className="flex items-center justify-between px-3 pb-2 text-[0.625rem] text-muted-foreground">
          <span>↑ ↓ naviguer · ↵ ouvrir</span>
          <span>Échap fermer</span>
        </div>
      </div>
    </div>
  );
}
