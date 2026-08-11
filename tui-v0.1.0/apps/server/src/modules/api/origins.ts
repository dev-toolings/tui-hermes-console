/**
 * Les origines autorisées à parler à cette API.
 *
 * Tant que la Console était une seule application Next, l'UI et l'API
 * partageaient une origine : « même origine » suffisait comme règle, pour CORS
 * comme pour la protection CSRF. Depuis la séparation, le SPA vit ailleurs —
 * `:1420` en développement, `tauri://localhost` une fois empaqueté — et cette
 * règle refusait toutes les mutations.
 *
 * La liste est donc explicite, et partagée entre CORS et le garde anti-CSRF :
 * deux listes divergentes laisseraient passer en CORS ce que le garde refuse,
 * ou l'inverse.
 */

/**
 * Le serveur Vite du SPA.
 *
 * Fermé en production : une fois l'application empaquetée, plus rien ne sert le
 * SPA sur :1420, et garder l'origine ouverte n'offrirait qu'une porte de plus à
 * une page locale malveillante. Tauri pose `NODE_ENV=production` sur le sidecar.
 */
const DEV_ORIGINS =
  process.env.NODE_ENV === "production"
    ? []
    : ["http://localhost:1420", "http://127.0.0.1:1420"];

/**
 * Une fenêtre Tauri sert son front sous un schéma dédié. macOS et Linux
 * utilisent `tauri://localhost`, Windows `http://tauri.localhost`.
 */
function isTauriOrigin(origin: string): boolean {
  return origin.startsWith("tauri://") || origin === "http://tauri.localhost";
}

/**
 * `request.url` derrière un reverse-proxy porte l'hôte interne, pas celui que
 * le navigateur a demandé. Sans cette lecture, une Console servie derrière
 * Caddy refuserait ses propres requêtes.
 */
function forwardedOrigin(request: Request, requestUrl: URL): string | null {
  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  if (!host) return null;
  const protocol =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    requestUrl.protocol.replace(":", "");
  return `${protocol}://${host}`;
}

/**
 * `origin` est l'en-tête `Origin` brut ; `request` sert à lire les en-têtes de
 * reverse-proxy et l'origine réelle de la requête.
 */
export function isAllowedOrigin(origin: string, request: Request): boolean {
  if (isTauriOrigin(origin)) return true;
  if (DEV_ORIGINS.includes(origin)) return true;

  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }

  const requestUrl = new URL(request.url);
  if (parsed.origin === requestUrl.origin) return true;

  const forwarded = forwardedOrigin(request, requestUrl);
  return forwarded !== null && parsed.origin === forwarded;
}
