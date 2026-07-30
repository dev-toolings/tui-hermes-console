import * as React from "react"

import { DEFAULT_LOCALE, type Locale } from "./config"
import type { MessageMap } from "./messages/types"

/** Replaces `{name}` placeholders in a message with the provided values. */
function interpolate(message: string, vars?: Record<string, string | number>): string {
  if (!vars) return message
  return message.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match
  )
}

export type TranslateFn = (key: string, vars?: Record<string, string | number>) => string

type I18nContextValue = {
  locale: Locale
  t: TranslateFn
}

const I18nContext = React.createContext<I18nContextValue | null>(null)

export function I18nProvider({
  locale,
  dictionaries,
  children,
}: {
  locale: Locale
  /** The merged per-locale dictionary — built per app via `buildDictionaries`. */
  dictionaries: Record<Locale, MessageMap>
  children: React.ReactNode
}) {
  const value = React.useMemo<I18nContextValue>(() => {
    const dict = dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE]
    const t: TranslateFn = (key, vars) => interpolate(dict[key] ?? key, vars)
    return { locale, t }
  }, [locale, dictionaries])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const ctx = React.useContext(I18nContext)
  if (!ctx) throw new Error("useI18n must be used within an <I18nProvider>")
  return ctx
}

/** Convenience hook returning just the translate function. */
export function useT(): TranslateFn {
  return useI18n().t
}
