import { MEDIA_DARK } from "./config"

/**
 * Anti-flash script, inlined in <head> before the stylesheet is applied.
 *
 * The server renders `.dark` itself for the explicit light/dark modes, so this
 * only has to handle `system`: it is the one case the request cookie cannot
 * answer. Kept to a single statement — it runs render-blocking on every load.
 */
export const THEME_SCRIPT = `(function(){var d=document.documentElement;if(d.getAttribute("data-theme-mode")==="system"&&window.matchMedia("${MEDIA_DARK}").matches)d.classList.add("dark")})()`
