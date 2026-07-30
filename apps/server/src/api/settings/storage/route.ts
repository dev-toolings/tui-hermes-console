import { apiErrorResponse } from "@/modules/api/errors";
import { getFileLimits, getStorageStats } from "@/modules/settings/storage-stats";

/**
 * Occupation disque et limites de fichiers, pour l'écran Rétention.
 *
 * `formatBytes` reste côté UI : c'est du formatage, pas de la donnée.
 */
export async function GET() {
  try {
    const [stats, limits] = await Promise.all([
      getStorageStats(),
      Promise.resolve(getFileLimits()),
    ]);
    return Response.json({ stats, limits });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
