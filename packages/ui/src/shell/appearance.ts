import * as React from "react"

/**
 * User-tunable shell dimensions, persisted in localStorage.
 *
 * - `contentWidth` → overrides `--container-content` (the `max-w-content` cap)
 * - `sidebarWidth` → overrides `--sidebar-width` (the expanded rail)
 * - `uiScale`      → root font-size, so every rem-based Tailwind size (text,
 *                    padding, gap, icon) scales together, sidebar included
 *
 * Same store idiom as the layout variant: `useSyncExternalStore` over
 * localStorage plus a window event, so every subscriber updates at once.
 *
 * `createAppearance` is a factory rather than a fixed store: each app calls it
 * once with its own `storageKey` (must stay distinct — a shared key would
 * silently merge the two apps' settings) and its own `defaults` (the classic
 * dashboard and the SaaS shell disagree on the default `contentWidth`).
 */

export type AppearanceKey = "contentWidth" | "sidebarWidth" | "uiScale"

export type SettingSpec = { min: number; max: number; step: number; default: number }

export type Appearance = Record<AppearanceKey, number>

/** Ranges are shared design-system constants; only the defaults vary per app. */
const RANGES: Record<AppearanceKey, Omit<SettingSpec, "default">> = {
  /** The top of the range means "no cap" rather than 2560px. */
  contentWidth: { min: 960, max: 2560, step: 20 },
  sidebarWidth: { min: 200, max: 360, step: 4 },
  /** Percentage of the 16px browser root size. */
  uiScale: { min: 85, max: 125, step: 5 },
}

/** Root font-size the `uiScale` percentage maps to. */
export const BASE_FONT_SIZE = 16

const CHANGE_EVENT = "boardui-appearance-change"

export function createAppearance({ storageKey, defaults }: { storageKey: string; defaults: Appearance }) {
  const APPEARANCE: Record<AppearanceKey, SettingSpec> = {
    contentWidth: { ...RANGES.contentWidth, default: defaults.contentWidth },
    sidebarWidth: { ...RANGES.sidebarWidth, default: defaults.sidebarWidth },
    uiScale: { ...RANGES.uiScale, default: defaults.uiScale },
  }

  const DEFAULT_APPEARANCE: Appearance = { ...defaults }

  const clampSetting = (key: AppearanceKey, value: number) => {
    const { min, max, step } = APPEARANCE[key]
    return Math.min(max, Math.max(min, Math.round(value / step) * step))
  }

  /** At the top of its range the pages span the whole shell. */
  const isFullWidth = (width: number) => width >= APPEARANCE.contentWidth.max

  const contentWidthCss = (width: number) => (isFullWidth(width) ? "100%" : `${width}px`)

  function parse(raw: string | null): Appearance {
    if (!raw) return DEFAULT_APPEARANCE
    try {
      const stored = JSON.parse(raw) as Partial<Appearance>
      return {
        contentWidth: clampSetting("contentWidth", stored.contentWidth ?? DEFAULT_APPEARANCE.contentWidth),
        sidebarWidth: clampSetting("sidebarWidth", stored.sidebarWidth ?? DEFAULT_APPEARANCE.sidebarWidth),
        uiScale: clampSetting("uiScale", stored.uiScale ?? DEFAULT_APPEARANCE.uiScale),
      }
    } catch {
      return DEFAULT_APPEARANCE
    }
  }

  // cached so getSnapshot stays referentially stable between store changes
  let cachedRaw: string | null = null
  let cached: Appearance = DEFAULT_APPEARANCE

  function getSnapshot(): Appearance {
    const raw = window.localStorage.getItem(storageKey)
    if (raw !== cachedRaw) {
      cachedRaw = raw
      cached = parse(raw)
    }
    return cached
  }

  /** Server render always uses the defaults, matching the CSS declarations. */
  const getServerSnapshot = (): Appearance => DEFAULT_APPEARANCE

  function subscribe(onStoreChange: () => void) {
    window.addEventListener("storage", onStoreChange)
    window.addEventListener(CHANGE_EVENT, onStoreChange)
    return () => {
      window.removeEventListener("storage", onStoreChange)
      window.removeEventListener(CHANGE_EVENT, onStoreChange)
    }
  }

  function useAppearance(): Appearance {
    return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  }

  function setAppearance(key: AppearanceKey, value: number) {
    const next = { ...getSnapshot(), [key]: clampSetting(key, value) }
    window.localStorage.setItem(storageKey, JSON.stringify(next))
    window.dispatchEvent(new Event(CHANGE_EVENT))
  }

  function resetAppearance() {
    window.localStorage.removeItem(storageKey)
    window.dispatchEvent(new Event(CHANGE_EVENT))
  }

  /** Applies the UI scale to the document root; rem-based sizes follow. */
  function useApplyUiScale(scale: number) {
    React.useEffect(() => {
      const root = document.documentElement
      if (scale === DEFAULT_APPEARANCE.uiScale) root.style.removeProperty("font-size")
      else root.style.fontSize = `${(BASE_FONT_SIZE * scale) / 100}px`
      return () => {
        root.style.removeProperty("font-size")
      }
    }, [scale])
  }

  return {
    APPEARANCE,
    DEFAULT_APPEARANCE,
    STORAGE_KEY: storageKey,
    clampSetting,
    isFullWidth,
    contentWidthCss,
    useAppearance,
    setAppearance,
    resetAppearance,
    useApplyUiScale,
  }
}
