import { createServerFn } from "@tanstack/react-start"
import { getCookie, setCookie } from "@tanstack/react-start/server"

import {
  normalizeAccent,
  normalizeMode,
  normalizeTheme,
  THEME_ACCENT_COOKIE,
  THEME_COOKIE_MAX_AGE,
  THEME_MODE_COOKIE,
  type Theme,
} from "./config"

/** Read the persisted theme from the request cookies (runs during SSR). */
export const getTheme = createServerFn({ method: "GET" }).handler((): Theme => {
  return {
    mode: normalizeMode(getCookie(THEME_MODE_COOKIE)),
    accent: normalizeAccent(getCookie(THEME_ACCENT_COOKIE)),
  }
})

/** Persist the chosen theme in year-long cookies, then return the applied value. */
export const setTheme = createServerFn({ method: "POST" })
  .validator((data: unknown): Theme => normalizeTheme(data))
  .handler(({ data }): Theme => {
    const options = {
      path: "/",
      maxAge: THEME_COOKIE_MAX_AGE,
      sameSite: "lax",
      // read by the anti-flash head script; not a security-sensitive value
      httpOnly: false,
    } as const
    setCookie(THEME_MODE_COOKIE, data.mode, options)
    setCookie(THEME_ACCENT_COOKIE, data.accent, options)
    return data
  })
