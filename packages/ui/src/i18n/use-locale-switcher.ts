"use client"

import * as React from "react"
import { useRouter } from "@tanstack/react-router"

import type { Locale } from "./config"
import { useI18n } from "./context"
import { setLocale } from "./server"

/**
 * Locale switching logic, shared by any surface that offers a language picker:
 * writes the cookie server-side, then invalidates the router so the root
 * `beforeLoad` re-reads it and the tree re-renders in the new language.
 */
export function useLocaleSwitcher() {
  const { locale } = useI18n()
  const router = useRouter()
  const [pending, setPending] = React.useState<Locale | null>(null)

  const change = React.useCallback(
    async (next: Locale) => {
      if (next === locale || pending) return
      setPending(next)
      try {
        await setLocale({ data: next })
        await router.invalidate()
      } finally {
        setPending(null)
      }
    },
    [locale, pending, router]
  )

  return { locale, change, pending }
}
