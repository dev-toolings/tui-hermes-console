/**
 * Theme configuration — single source of truth for the colour scheme and the
 * accent hue. Kept dependency-free on purpose (same idiom as `@/i18n/config`),
 * so the anti-flash script and the server functions can both import it.
 *
 * The accent ids match the `[data-accent="…"]` blocks in `styles/app.css`.
 */

export const THEME_MODES = ["light", "dark", "system"] as const

export type ThemeMode = (typeof THEME_MODES)[number]

/** What the shell renders once `system` has been resolved. */
export type ResolvedMode = "light" | "dark"

export const DEFAULT_MODE: ThemeMode = "system"

export const ACCENTS = ["blue", "teal", "lime", "pink", "sky", "purple", "emerald", "yellow"] as const

export type AccentId = (typeof ACCENTS)[number]

export const DEFAULT_ACCENT: AccentId = "blue"

/** The 500 stop of each scale — drives the swatch in the picker, nothing else. */
export const ACCENT_SWATCHES: Record<AccentId, string> = {
  blue: "#3080ff",
  teal: "#00bba7",
  lime: "#7ccf00",
  pink: "#f6339a",
  sky: "#00a6f4",
  purple: "#ad46ff",
  emerald: "#00bc7d",
  yellow: "#efb100",
}

export type Theme = { mode: ThemeMode; accent: AccentId }

export const DEFAULT_THEME: Theme = { mode: DEFAULT_MODE, accent: DEFAULT_ACCENT }

/** Cookies that persist the visitor's theme across sessions. */
export const THEME_MODE_COOKIE = "boardui_theme"
export const THEME_ACCENT_COOKIE = "boardui_accent"

/** One year, in seconds — the cookie lifetime (matches the locale cookie). */
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

/** Set on <html> so the head script knows whether it must consult the OS. */
export const THEME_MODE_ATTR = "data-theme-mode"
export const THEME_ACCENT_ATTR = "data-accent"

export const MEDIA_DARK = "(prefers-color-scheme: dark)"

export function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === "string" && (THEME_MODES as readonly string[]).includes(value)
}

export function isAccent(value: unknown): value is AccentId {
  return typeof value === "string" && (ACCENTS as readonly string[]).includes(value)
}

/** Coerce any input to a valid mode, falling back to the default. */
export function normalizeMode(value: unknown): ThemeMode {
  return isThemeMode(value) ? value : DEFAULT_MODE
}

/** Coerce any input to a valid accent, falling back to the default. */
export function normalizeAccent(value: unknown): AccentId {
  return isAccent(value) ? value : DEFAULT_ACCENT
}

/** Coerce a partial `{ mode, accent }` payload to a complete theme. */
export function normalizeTheme(value: unknown): Theme {
  const raw = (value ?? {}) as Partial<Record<keyof Theme, unknown>>
  return { mode: normalizeMode(raw.mode), accent: normalizeAccent(raw.accent) }
}
