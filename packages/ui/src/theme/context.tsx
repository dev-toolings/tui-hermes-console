"use client"

import * as React from "react"

import {
  MEDIA_DARK,
  THEME_ACCENT_ATTR,
  THEME_MODE_ATTR,
  type AccentId,
  type ResolvedMode,
  type Theme,
  type ThemeMode,
} from "./config"
import { setTheme } from "./server"

type ThemeContextValue = Theme & {
  /** `mode` with `system` already resolved against the OS preference. */
  resolved: ResolvedMode
  setMode: (next: ThemeMode) => void
  setAccent: (next: AccentId) => void
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null)

const REDUCE_MOTION = "(prefers-reduced-motion: reduce)"
const THEME_TRANSITION_MS = 340

function subscribeToSystem(onChange: () => void) {
  const query = window.matchMedia(MEDIA_DARK)
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}

const getSystemDark = () => window.matchMedia(MEDIA_DARK).matches

/** The server cannot know the OS preference; light is the documented default. */
const getServerSystemDark = () => false

function resolveMode(mode: ThemeMode, systemDark: boolean): ResolvedMode {
  return mode === "system" ? (systemDark ? "dark" : "light") : mode
}

function paintDocument(resolved: ResolvedMode, mode: ThemeMode, accent: AccentId) {
  const root = document.documentElement
  root.classList.toggle("dark", resolved === "dark")
  root.setAttribute(THEME_MODE_ATTR, mode)
  root.setAttribute(THEME_ACCENT_ATTR, accent)
}

function prefersReducedMotion() {
  return window.matchMedia(REDUCE_MOTION).matches
}

/**
 * Soft theme flip: View Transitions API when available (Chrome/Edge/Safari 18+),
 * otherwise a short-lived `.theme-transitioning` class that eases color tokens.
 * Instant snap under `prefers-reduced-motion`.
 */
function withThemeTransition(paint: () => void) {
  if (prefersReducedMotion()) {
    paint()
    return
  }

  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => { finished: Promise<void> }
  }

  if (typeof doc.startViewTransition === "function") {
    doc.startViewTransition(paint)
    return
  }

  const root = document.documentElement
  root.classList.add("theme-transitioning")
  paint()
  window.setTimeout(() => root.classList.remove("theme-transitioning"), THEME_TRANSITION_MS)
}

/**
 * Theme state for the whole shell.
 *
 * Persistence mirrors the locale switcher (`@/i18n`): the choice lives in a
 * cookie, so the very first server render already carries the right class and
 * there is no flash. The extra piece here is the optimistic local state — the
 * repaint happens on click and the cookie round-trip only persists it, with no
 * router invalidation (which would flash the previous theme back on re-render).
 *
 * The document attributes are driven from an effect rather than from the
 * `<html>` JSX: the head script may have added `.dark` on its own, and React
 * would not know to remove it when a prop it never saw change goes stale.
 */
export function ThemeProvider({ mode, accent, children }: Theme & { children: React.ReactNode }) {
  const [theme, setLocalTheme] = React.useState<Theme>({ mode, accent })

  // re-sync if the server context ever changes under us (navigation, other tab)
  React.useEffect(() => {
    setLocalTheme({ mode, accent })
  }, [mode, accent])

  const systemDark = React.useSyncExternalStore(subscribeToSystem, getSystemDark, getServerSystemDark)
  const resolved: ResolvedMode = resolveMode(theme.mode, systemDark)

  // Keep <html> in sync for OS-driven `system` flips (no user click → no VT).
  React.useEffect(() => {
    paintDocument(resolved, theme.mode, theme.accent)
  }, [resolved, theme.mode, theme.accent])

  const apply = React.useCallback((next: Theme, { animate }: { animate: boolean }) => {
    // The class toggle already repaints — the appearance is fully driven by
    // `.dark` + `data-accent` on <html>, not by a re-render. So we only need
    // to persist: NO `router.invalidate()`. Invalidating would re-render the
    // root <html className> from the still-stale server context for a frame,
    // flashing the previous theme back in. The cookie keeps the next SSR right.
    const nextResolved = resolveMode(next.mode, getSystemDark())
    const paint = () => {
      paintDocument(nextResolved, next.mode, next.accent)
      setLocalTheme(next)
    }
    if (animate) withThemeTransition(paint)
    else paint()
    void setTheme({ data: next })
  }, [])

  const value = React.useMemo<ThemeContextValue>(
    () => ({
      ...theme,
      resolved,
      // Mode flips the whole palette → animate. Accent is a local hue swap → snap.
      setMode: (next) => next !== theme.mode && apply({ ...theme, mode: next }, { animate: true }),
      setAccent: (next) => next !== theme.accent && apply({ ...theme, accent: next }, { animate: false }),
    }),
    [theme, resolved, apply]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext)
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider")
  return ctx
}
