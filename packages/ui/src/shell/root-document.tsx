import * as React from "react"
import { HeadContent, Scripts } from "@tanstack/react-router"

import { cn } from "../lib/utils"
import { TooltipProvider } from "../components/ui/tooltip"
import { I18nProvider } from "../i18n/context"
import type { Locale } from "../i18n/config"
import type { MessageMap } from "../i18n/messages/types"
import { ThemeProvider } from "../theme/context"
import type { Theme } from "../theme/config"
import { THEME_SCRIPT } from "../theme/theme-script"

/**
 * Shared `head()` builder for the root route: charset/viewport meta, the
 * app's stylesheet + favicon, and the render-blocking anti-flash theme
 * script (resolves `system` before the first paint — see `theme/theme-script`).
 */
export function baseHead({
  title,
  description,
  appCssHref,
}: {
  title: string
  description: string
  appCssHref: string
}) {
  return {
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title },
      { name: "description", content: description },
    ],
    links: [
      // Inter + JetBrains Mono are self-hosted from styles/app.css — no
      // fonts.googleapis.com request to be blocked or stalled.
      { rel: "stylesheet", href: appCssHref },
      { rel: "icon", href: "/favicon.ico" },
    ],
    // render-blocking on purpose: resolves `system` before the first paint
    scripts: [{ children: THEME_SCRIPT }],
  }
}

/**
 * Shared `shellComponent` for the root route. Each app still declares its own
 * `<Route>` (own `beforeLoad`, own router-context type — the SaaS one carries
 * `session`) and just renders this with the values it read there.
 */
export function RootDocument({
  locale,
  dictionaries,
  theme,
  children,
}: {
  locale: Locale
  dictionaries: Record<Locale, MessageMap>
  theme: Theme
  children: React.ReactNode
}) {
  return (
    // `suppressHydrationWarning`: in `system` mode the head script adds `.dark`
    // before React ever sees the document (see theme/theme-script.ts).
    <html
      lang={locale}
      data-theme-mode={theme.mode}
      data-accent={theme.accent}
      className={cn("h-full antialiased", theme.mode === "dark" && "dark")}
      suppressHydrationWarning
    >
      <head>
        <HeadContent />
      </head>
      <body className="min-h-dvh flex flex-col">
        <I18nProvider locale={locale} dictionaries={dictionaries}>
          <ThemeProvider mode={theme.mode} accent={theme.accent}>
            <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
          </ThemeProvider>
        </I18nProvider>
        <Scripts />
      </body>
    </html>
  )
}
