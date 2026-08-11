import { LOCALES, type Locale } from "./config"
import type { LocaleMessages, MessageMap } from "./messages/types"

/**
 * Merges a per-app list of domain message modules into one dictionary per
 * locale. Each app keeps its own `dictionaries.ts` (the manifest of which
 * modules it ships) and just calls this with the list.
 */
export function buildDictionaries(modules: LocaleMessages[]): Record<Locale, MessageMap> {
  function mergeLocale(locale: Locale): MessageMap {
    return Object.assign({}, ...modules.map((m) => m[locale]))
  }

  return Object.fromEntries(LOCALES.map((locale) => [locale, mergeLocale(locale)])) as Record<Locale, MessageMap>
}
