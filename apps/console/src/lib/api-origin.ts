/**
 * Origine de l'API, résolue à l'exécution.
 *
 * Le SPA appelle des chemins relatifs (`/api/…`), et ça suffit dans les deux
 * cas où il est servi par le serveur lui-même : le navigateur sur `:3170`, et
 * le développement derrière le proxy Vite. Empaquetée, la fenêtre charge depuis
 * le protocole `tauri://` : un `/api/…` relatif y résout vers
 * `tauri://localhost/api/…`, que le protocole d'assets ne connaît pas. Il
 * renvoie l'`index.html`, et le premier `response.json()` lève sous WebKit
 * « The string did not match the expected pattern. » — l'écran affiche une
 * erreur de syntaxe là où le vrai problème est une requête jamais arrivée.
 *
 * L'origine n'est donc pas codée en dur : Rust l'injecte dans la fenêtre avant
 * tout script de l'application (`open_main_window`, src-tauri/src/lib.rs). Elle
 * vaut le sidecar local par défaut, et n'importe quelle URL — un VPS — dès que
 * `CONSOLE_API_ORIGIN` est renseigné dans `console.env`. Le SPA n'a pas à être
 * reconstruit pour changer de serveur.
 *
 * Hors Tauri, rien n'est injecté : les chemins restent relatifs, et une Console
 * servie derrière un reverse-proxy continue de parler à sa propre origine.
 */

const API_PREFIX = "/api/";

declare global {
  var __CONSOLE_API_ORIGIN__: string | undefined;
}

function resolveOrigin(): string {
  const injected = globalThis.__CONSOLE_API_ORIGIN__;
  if (typeof injected !== "string") return "";
  // Le `/` final dupliquerait celui du chemin : `https://api//api/agents`.
  return injected.trim().replace(/\/+$/, "");
}

/** Vide hors Tauri — les appels restent alors sur l'origine de la page. */
export const apiOrigin = resolveOrigin();

/** Préfixe un chemin d'API. Sans origine injectée, le chemin sort inchangé. */
export function apiUrl(path: string): string {
  return apiOrigin && path.startsWith(API_PREFIX) ? apiOrigin + path : path;
}

/**
 * Réécrit les `fetch("/api/…")` vers l'origine configurée, une bonne fois.
 *
 * Le choix d'un point unique plutôt que d'un `apiUrl()` sur chacun des ~40
 * appels du SPA est délibéré : c'est exactement l'oubli d'un seul d'entre eux
 * qui produirait de nouveau ce bug, silencieusement, et seulement dans
 * l'application empaquetée — la configuration qu'on teste le moins.
 *
 * Ne couvre que les appels passant une chaîne, ce qu'ils font tous. Un
 * `fetch(new Request(…))` échapperait à la réécriture ; il faudrait alors
 * passer par `apiUrl()`.
 */
export function installApiOrigin(): void {
  if (!apiOrigin) return;

  const inner = globalThis.fetch;
  const rewrite = (input: RequestInfo | URL, init?: RequestInit) =>
    typeof input === "string" && input.startsWith(API_PREFIX)
      ? inner(apiUrl(input), init)
      : inner(input, init);

  // `fetch` porte des propriétés selon l'environnement (`preconnect` sous Bun) :
  // les recopier garde le remplaçant substituable au vrai `fetch`.
  globalThis.fetch = Object.assign(rewrite, inner);
}
