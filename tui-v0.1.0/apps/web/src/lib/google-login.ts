/**
 * Le parcours Google renvoie le navigateur sur `GOOGLE_REDIRECT_URI`. Tant que
 * cette URL est en loopback, elle désigne la machine du navigateur et non celle
 * qui sert la Console : depuis un téléphone ou un autre poste du réseau local,
 * le retour de connexion tombe dans le vide, après le détour par Google.
 *
 * Aucun des deux côtés ne peut trancher seul. Le serveur sait si son callback
 * est en loopback mais pas quel hôte le navigateur a demandé, puisque le proxy
 * Vite réécrit `Host` et qu'un GET same-origin n'envoie pas d'en-tête `Origin`.
 * Le navigateur sait l'inverse. Cette fonction recolle les deux moitiés.
 */
const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function isLoopbackHostname(hostname: string): boolean {
  return LOOPBACK_HOSTNAMES.has(hostname.trim().toLowerCase());
}

/**
 * `callbackRequiresLoopback` vient de `GET /api/auth`, `hostname` de
 * `window.location`. Par défaut vrai : une information d'état manquante ne doit
 * pas condamner le seul chemin de connexion d'une Console en production.
 */
export function googleLoginReachable(
  callbackRequiresLoopback: boolean | undefined,
  hostname: string,
): boolean {
  if (!callbackRequiresLoopback) return true;
  return isLoopbackHostname(hostname);
}
