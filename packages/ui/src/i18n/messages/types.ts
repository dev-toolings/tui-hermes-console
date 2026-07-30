import type { Locale } from "../config"

/** A flat map of dot-path keys → translated string, for one domain. */
export type MessageMap = Record<string, string>

/** A domain module provides the same keys for every supported locale. */
export type LocaleMessages = Record<Locale, MessageMap>
