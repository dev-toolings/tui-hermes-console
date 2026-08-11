import { apiErrorResponse } from "@/modules/api/errors";
import { listHermesAchievements } from "@/modules/runtime/hermes-achievements";

export async function GET() {
  try {
    return Response.json(
      { achievements: await listHermesAchievements() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
