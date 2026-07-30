import { apiErrorResponse } from "@/modules/api/errors";
import { getRunActivity } from "@/modules/runs/repository";

/**
 * Activité par jour, pour le graphique de l'Aperçu.
 *
 * L'Aperçu lisait cette série en appelant `getRunActivity()` pendant son rendu
 * serveur. Le SPA n'a pas de rendu serveur : il lui faut une route.
 */
export async function GET(request: Request) {
  try {
    const raw = new URL(request.url).searchParams.get("days");
    const parsed = Number(raw);
    // Borné : la requête balaie une fenêtre glissante, un `days` arbitraire
    // depuis le client ferait scanner toute la table.
    const days = Number.isFinite(parsed) ? Math.min(Math.max(Math.trunc(parsed), 1), 365) : 30;
    return Response.json({ activity: await getRunActivity(days) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
