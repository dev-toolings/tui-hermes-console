/**
 * Cohérence du routage OAuth local, vérifiée au démarrage.
 *
 * `GOOGLE_REDIRECT_URI` est une URL figée à trois endroits : ce dépôt, le
 * fichier `.env.local` hors git, et la console Google Cloud. Rien ne les
 * resynchronise. Quand le port du SPA a bougé de 1420 à 1470, le `.env.local`
 * est resté en arrière, et l'échec n'est apparu qu'à la toute fin du parcours :
 * Google renvoie le navigateur sur un port que ce serveur n'écoute pas, et
 * l'utilisateur reçoit un `ERR_EMPTY_RESPONSE` qui ne nomme ni la variable ni
 * le port fautif. Pire, si un autre projet local écoute sur l'ancien port, le
 * code d'autorisation lui est livré.
 *
 * Ces deux règles ne parlent que de loopback en HTTP, donc uniquement de
 * configurations de développement : une console derrière un domaine public en
 * HTTPS, ou un sidecar Tauri servant le SPA sous `tauri://`, ne les déclenche
 * jamais.
 */

import { log } from "@/observability/log";

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export type LocalOAuthRoutingProblem = {
  message: string;
  fields: Record<string, string>;
};

/**
 * Ne retient que les URL qui décrivent une console locale en clair : tout le
 * reste (HTTPS, domaine public, `tauri://`, valeur absente ou illisible) sort
 * du périmètre de ce garde et vaut `null`.
 */
function loopbackHttpUrl(raw: string | undefined): URL | null {
  const value = raw?.trim();
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "http:") return null;
  return LOOPBACK_HOSTNAMES.has(url.hostname.toLowerCase()) ? url : null;
}

/** Le port explicite, ou celui que le schéma sous-entend. */
function effectivePort(url: URL) {
  return url.port || "80";
}

/**
 * Vrai quand le parcours Google ne peut aboutir que sur la machine qui sert la
 * Console.
 *
 * Google refuse les adresses IP privées comme URI de redirection, donc
 * `GOOGLE_REDIRECT_URI` reste en loopback en développement. Un navigateur
 * distant qui lance le parcours part chez Google, puis revient sur SON propre
 * loopback, où rien n'écoute. L'échec arrive à la toute fin, sur une page morte
 * qui ne nomme ni la cause ni le chemin qui, lui, fonctionne.
 *
 * Le SPA a besoin de le savoir pour ne pas proposer cette impasse. Il complète
 * avec ce que lui seul connaît de façon fiable : l'hôte que le navigateur a
 * réellement demandé. En production le callback est un domaine en HTTPS, cette
 * fonction vaut `false`, et le bouton Google reste le chemin normal.
 */
export function googleCallbackRequiresLoopback(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return loopbackHttpUrl(env.GOOGLE_REDIRECT_URI) !== null;
}

export function findLocalOAuthRoutingProblem(
  serverPort: number,
  env: Record<string, string | undefined> = process.env,
): LocalOAuthRoutingProblem | null {
  const callback = loopbackHttpUrl(env.GOOGLE_REDIRECT_URI);
  if (!callback) return null;

  // Deux ports atteignent l'API en développement : celui du serveur, et celui
  // de Vite, qui proxifie `/api` jusqu'ici. Les autres ne mènent nulle part.
  const webPort = env.CONSOLE_WEB_PORT?.trim();
  const reachable = [String(serverPort), ...(webPort ? [webPort] : [])];
  const callbackPort = effectivePort(callback);
  if (!reachable.includes(callbackPort)) {
    return {
      message: "Le callback OAuth vise un port que la Console n'écoute pas",
      fields: {
        callbackPort,
        reachable: reachable.join(" ou "),
        action: "corriger GOOGLE_REDIRECT_URI dans apps/server/.env.local, puis l'URI de redirection côté Google Cloud",
      },
    };
  }

  // Les cookies ignorent le port mais pas l'hôte : `hc_oidc_state`, posé lors
  // de l'appel initial sur l'origine du SPA, ne serait pas renvoyé à un
  // callback qui change de `localhost` à `127.0.0.1`. La vérification du state
  // échouerait alors sans jamais dire pourquoi.
  const appOrigin = loopbackHttpUrl(env.CONSOLE_APP_ORIGIN);
  if (appOrigin && appOrigin.hostname.toLowerCase() !== callback.hostname.toLowerCase()) {
    return {
      message: "Le callback OAuth et le SPA n'utilisent pas le même hôte local",
      fields: {
        callbackHost: callback.hostname,
        appOriginHost: appOrigin.hostname,
        action: "utiliser le même hôte dans GOOGLE_REDIRECT_URI et CONSOLE_APP_ORIGIN : les cookies de session ne traversent pas localhost ↔ 127.0.0.1",
      },
    };
  }

  return null;
}

/**
 * Refuse de démarrer plutôt que d'exposer un parcours de connexion condamné.
 * Même contrat que `assertSchemaMigrated` : une ligne actionnable, puis sortie.
 */
export function assertLocalOAuthRouting(
  serverPort: number,
  env: Record<string, string | undefined> = process.env,
): void {
  const problem = findLocalOAuthRoutingProblem(serverPort, env);
  if (!problem) return;
  log.error(problem.message, problem.fields);
  process.exit(1);
}
