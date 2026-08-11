import { createServerFn } from "@tanstack/react-start"
import { getCookie, setCookie } from "@tanstack/react-start/server"

import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  normalizeLocale,
  type Locale,
} from "./config"

/** Read the persisted locale from the request cookie (runs during SSR). */
export const getLocale = createServerFn({ method: "GET" }).handler((): Locale => {
  return normalizeLocale(getCookie(LOCALE_COOKIE))
})

/** Persist the chosen locale in a year-long cookie, then return the applied value. */
export const setLocale = createServerFn({ method: "POST" })
  .validator((data: unknown): Locale => normalizeLocale(data))
  .handler(({ data }): Locale => {
    setCookie(LOCALE_COOKIE, data, {
      path: "/",
      maxAge: LOCALE_COOKIE_MAX_AGE,
      sameSite: "lax",
      // readable by client code if ever needed; not a security-sensitive value
      httpOnly: false,
    })
    return data ?? DEFAULT_LOCALE
  })
