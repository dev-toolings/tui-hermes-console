import { HermesRuntimeError } from "@/modules/runtime/hermes-adapter";
import { isAllowedOrigin } from "./origins";

/**
 * Refuse les mutations déclenchées depuis un site tiers (CSRF).
 *
 * La règle n'est plus « même origine » : le SPA a la sienne depuis qu'il est
 * séparé de l'API. On s'appuie sur la liste partagée avec CORS — voir
 * `origins.ts` pour ce qu'elle autorise et pourquoi.
 */
export function assertSameOriginMutation(request: Request) {
  const fetchSite = request.headers.get("sec-fetch-site");
  // `cross-site` est posé par le navigateur lui-même : plus fiable qu'`Origin`,
  // qu'une page tierce ne contrôle pas non plus mais qui peut être absent.
  if (fetchSite === "cross-site") {
    throw new HermesRuntimeError(
      "Cette action doit être déclenchée depuis la Console.",
      403,
      "CROSS_SITE_MUTATION_REJECTED",
    );
  }

  const origin = request.headers.get("origin");
  // Pas d'`Origin` : requête same-origin d'un navigateur, ou client non-navigateur
  // (curl, script). Le garde protège du CSRF, pas de l'accès direct — la Console
  // n'a de toute façon pas encore d'authentification.
  if (!origin) return;

  if (!isAllowedOrigin(origin, request)) {
    throw new HermesRuntimeError("Origine de requête refusée.", 403, "ORIGIN_REJECTED");
  }
}
