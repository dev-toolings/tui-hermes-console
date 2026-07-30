/**
 * i18n configuration — single source of truth for supported locales.
 * Kept dependency-free on purpose: the message maps live in `dictionaries.ts`.
 */

export const LOCALES = ["en", "fr"] as const

export type Locale = (typeof LOCALES)[number]

export const DEFAULT_LOCALE: Locale = "en"

/** Cookie that persists the visitor's language choice across sessions. */
export const LOCALE_COOKIE = "boardui_locale"

/** One year, in seconds — the cookie lifetime. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

/** Human-readable names shown in the language switcher. */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  fr: "Français",
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value)
}

/** Coerce any input to a valid locale, falling back to the default. */
export function normalizeLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE
}
