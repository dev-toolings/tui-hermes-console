import { apiErrorResponse } from "@/modules/api/errors";
import { getFileLimits, getStorageStats } from "@/modules/settings/storage-stats";
import type { AuthenticatedRouteContext } from "@/modules/api/route-context";

/**
 * Occupation disque et limites de fichiers, pour l'écran Rétention.
 *
 * `formatBytes` reste côté UI : c'est du formatage, pas de la donnée.
 */
export async function GET(_request: Request, context: AuthenticatedRouteContext) {
  try {
    const [stats, limits] = await Promise.all([
      getStorageStats(context.siteContext),
      Promise.resolve(getFileLimits()),
    ]);
    return Response.json({ stats, limits });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
