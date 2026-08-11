import * as React from "react"

import { cn } from "../lib/utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/ui/tooltip"
import { Ico } from "./icons"

/* -------------------------------------------------------------------------- */
/*                            sidebar/layout context                          */
/* -------------------------------------------------------------------------- */

export type LayoutVariant = "boardui" | "inset"

export type LayoutOption = { value: LayoutVariant; number: string; label: string }

type Ctx = {
  collapsed: boolean
  setCollapsed: (v: boolean) => void
  mobileOpen: boolean
  setMobileOpen: (v: boolean) => void
  layout: LayoutVariant
  setLayout: (layout: LayoutVariant) => void
  locked: boolean
}

const SidebarCtx = React.createContext<Ctx | null>(null)

export function useBui() {
  const c = React.useContext(SidebarCtx)
  if (!c) throw new Error("useBui must be used within BuiSidebarProvider")
  return c
}

const LAYOUT_CHANGE_EVENT = "boardui-layout-change"

function getLayoutSnapshot(
  storageKey: string,
  fallback: LayoutVariant
): LayoutVariant {
  const stored = window.localStorage.getItem(storageKey)
  if (stored === "inset" || stored === "boardui") return stored
  return fallback
}

function subscribeToLayout(onStoreChange: () => void) {
  const notify = () => onStoreChange()
  window.addEventListener("storage", notify)
  window.addEventListener(LAYOUT_CHANGE_EVENT, notify)
  return () => {
    window.removeEventListener("storage", notify)
    window.removeEventListener(LAYOUT_CHANGE_EVENT, notify)
  }
}

export function BuiSidebarProvider({
  children,
  forcedLayout,
  defaultLayout = "boardui",
  storageKey,
  autoCollapseOnTabletPortrait = false,
}: {
  children: React.ReactNode
  /** Pin the shell to a single layout and hide the layout switcher (e.g. the SaaS app locks to "inset" / Sidebar 08). */
  forcedLayout?: LayoutVariant
  /** Layout used until the user picks one — the stored choice still wins. */
  defaultLayout?: LayoutVariant
  /** localStorage key the layout choice persists under — must stay distinct per app. */
  storageKey: string
  /** Collapse the rail on entering tablet portrait (768–1023px) — opt-in, the SaaS shell wants it, classic doesn't. */
  autoCollapseOnTabletPortrait?: boolean
}) {
  const [collapsed, setCollapsedState] = React.useState(false)
  const [mobileOpen, setMobileOpen] = React.useState(false)
  const tabletManualOverride = React.useRef(false)

  const setCollapsed = React.useCallback((value: boolean | ((prev: boolean) => boolean)) => {
    setCollapsedState((prev) => {
      const next = typeof value === "function" ? value(prev) : value
      if (window.matchMedia("(min-width: 768px) and (max-width: 1023.98px)").matches) {
        tabletManualOverride.current = true
      }
      return next
    })
  }, [])

  // tablet portrait (768–1023px) is wide enough for the fixed rail but not for the
  // 260px expanded one — it would leave ~470px of content. Collapse on entering that
  // range and restore on leaving it; a manual toggle inside the range still wins.
  React.useEffect(() => {
    if (!autoCollapseOnTabletPortrait) return
    const mql = window.matchMedia("(min-width: 768px) and (max-width: 1023.98px)")
    const apply = () => {
      if (mql.matches) {
        if (!tabletManualOverride.current) setCollapsedState(true)
        return
      }
      tabletManualOverride.current = false
      setCollapsedState(false)
    }
    apply()
    mql.addEventListener("change", apply)
    return () => mql.removeEventListener("change", apply)
  }, [autoCollapseOnTabletPortrait])

  const storedLayout = React.useSyncExternalStore(
    subscribeToLayout,
    () => getLayoutSnapshot(storageKey, defaultLayout),
    (): LayoutVariant => defaultLayout
  )
  const layout = forcedLayout ?? storedLayout
  const setLayout = React.useCallback(
    (nextLayout: LayoutVariant) => {
      if (forcedLayout) return
      window.localStorage.setItem(storageKey, nextLayout)
      window.dispatchEvent(new Event(LAYOUT_CHANGE_EVENT))
    },
    [forcedLayout, storageKey]
  )
  return (
    <SidebarCtx.Provider
      value={{ collapsed, setCollapsed, mobileOpen, setMobileOpen, layout, setLayout, locked: Boolean(forcedLayout) }}
    >
      {children}
    </SidebarCtx.Provider>
  )
}

/* -------------------------------------------------------------------------- */
/*                                layout frame                                */
/* -------------------------------------------------------------------------- */

export function BuiLayoutFrame({
  children,
  sidebarWidth,
  layoutOptions,
  labels,
  background,
}: {
  children: React.ReactNode
  sidebarWidth: number
  layoutOptions: LayoutOption[]
  /** Layout-switcher copy — resolved by the caller (translated in classic, static in SaaS today). */
  labels: { tooltip: string; choose: string; choices: string }
  /** Shell background per layout — the two apps use different surface tokens. */
  background: { default: string; inset: string }
}) {
  const { layout, setLayout, locked } = useBui()
  const isInset = layout === "inset"
  const [layoutMenuOpen, setLayoutMenuOpen] = React.useState(false)

  return (
    <div
      style={{ "--sidebar-width": `${sidebarWidth}px` } as React.CSSProperties}
      className={cn(
        "flex h-dvh w-full overflow-hidden transition-colors duration-200",
        isInset ? background.inset : background.default
      )}
    >
      {children}
      {!locked && (
        <div
          className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[55] flex flex-col items-end gap-2"
          onKeyDown={(event) => {
            if (event.key === "Escape") setLayoutMenuOpen(false)
          }}
        >
          {layoutMenuOpen && (
            <div id="boardui-layout-options" aria-label={labels.choices} className="flex flex-col gap-2 animate-in fade-in slide-in-from-bottom-2 duration-200 motion-reduce:animate-none">
              {layoutOptions.map((option) => {
                const active = layout === option.value
                const tooltipId = `layout-tooltip-${option.value}`
                return (
                  <div key={option.value} className="group relative flex items-center">
                    <span
                      id={tooltipId}
                      role="tooltip"
                      className="pointer-events-none absolute right-full mr-2 rounded-lg bg-foreground px-2.5 py-1.5 text-xs font-medium whitespace-nowrap text-background opacity-0 shadow-[var(--shadow-elevated)] transition-[opacity,transform] duration-150 ease-out group-hover:-translate-x-0.5 group-hover:opacity-100 group-focus-within:-translate-x-0.5 group-focus-within:opacity-100 motion-reduce:transform-none"
                    >
                      {option.label}
                    </span>
                    <button
                      type="button"
                      aria-describedby={tooltipId}
                      aria-pressed={active}
                      onClick={() => {
                        setLayout(option.value)
                        setLayoutMenuOpen(false)
                      }}
                      className={cn(
                        "inline-flex size-11 items-center justify-center rounded-full border font-mono text-xs font-semibold shadow-[var(--shadow-elevated)] outline-none transition-[transform,background-color,color,border-color] duration-150 ease-out hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transform-none",
                        active
                          ? "border-ring bg-[image:var(--gradient-primary)] text-primary-foreground"
                          : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
                      )}
                    >
                      {option.number}
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          <div className="group relative flex items-center">
            <span
              id="layout-trigger-tooltip"
              role="tooltip"
              className="pointer-events-none absolute right-full mr-2 rounded-lg bg-foreground px-2.5 py-1.5 text-xs font-medium whitespace-nowrap text-background opacity-0 shadow-[var(--shadow-elevated)] transition-[opacity,transform] duration-150 ease-out group-hover:-translate-x-0.5 group-hover:opacity-100 group-focus-within:-translate-x-0.5 group-focus-within:opacity-100 motion-reduce:transform-none"
            >
              {labels.tooltip}
            </span>
            <button
              type="button"
              aria-label={labels.choose}
              aria-describedby="layout-trigger-tooltip"
              aria-expanded={layoutMenuOpen}
              aria-controls="boardui-layout-options"
              onClick={() => setLayoutMenuOpen((open) => !open)}
              className="inline-flex size-11 items-center justify-center rounded-full border border-border bg-popover text-muted-foreground shadow-[var(--shadow-elevated)] outline-none transition-[transform,background-color,color] duration-200 ease-out hover:-translate-y-0.5 hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transform-none"
            >
              <svg viewBox="0 0 24 24" fill="none" aria-hidden className="size-5">
                <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.8" />
                <path d="M8.5 3V21" stroke="currentColor" strokeWidth="1.8" />
                <path
                  d={isInset ? "M11.5 6H18.5V18H11.5Z" : "M11.5 7H18.5M11.5 12H18.5M11.5 17H16"}
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Content column: `--container-content` drives every `max-w-content` below
 * (header rows + page containers). `containerContent` is resolved by the
 * caller from its own appearance store (`contentWidthCss(contentWidth)`).
 */
export function BuiContentFrame({ children, containerContent }: { children: React.ReactNode; containerContent: string }) {
  const { layout } = useBui()
  return (
    <div
      style={{ "--container-content": containerContent } as React.CSSProperties}
      className={cn(
        "flex min-w-0 flex-1 flex-col bg-panel transition-[margin,border-radius,box-shadow] duration-200 ease-out",
        layout === "inset" &&
          "md:my-2 md:mr-2 md:ml-0 md:overflow-hidden md:rounded-r-3xl md:border md:border-border md:shadow-[var(--shadow-elevated)]"
      )}
    >
      {children}
    </div>
  )
}

export function BuiSidebarTrigger({
  className,
  label,
  hoverClassName = "hover:bg-accent hover:text-foreground",
}: {
  className?: string
  label: string
  /** Hover fill — classic uses `accent`, SaaS uses the slightly subtler `muted`. */
  hoverClassName?: string
}) {
  const { setMobileOpen } = useBui()
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => setMobileOpen(true)}
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors",
        hoverClassName,
        className
      )}
    >
      <Ico name="panel" />
    </button>
  )
}

/* instant tooltip (right side) — only shown when the sidebar is collapsed */
export function SidebarTip({ show, label, children }: { show: boolean; label: string; children: React.ReactElement }) {
  if (!show) return children
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={12}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

/* platform-aware ⌘K / Ctrl K label. Initial state matches SSR (mac) then corrects on mount. */
export function useShortcutLabel() {
  const [isMac, setIsMac] = React.useState(true)
  React.useEffect(() => {
    const p = navigator.platform || navigator.userAgent
    setIsMac(/mac|iphone|ipad|ipod/i.test(p))
  }, [])
  return isMac ? "⌘K" : "Ctrl K"
}
