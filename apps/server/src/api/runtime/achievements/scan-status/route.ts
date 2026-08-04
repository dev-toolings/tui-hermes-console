import { apiErrorResponse } from "@/modules/api/errors";
import { getHermesAchievementsScanStatus } from "@/modules/runtime/hermes-achievements";

export async function GET() {
  try {
    return Response.json(
      { status: await getHermesAchievementsScanStatus() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
