import { apiErrorResponse } from "@/modules/api/errors";
import { listConnectors } from "@/modules/connectors/repository";

export async function GET() {
  try {
    return Response.json({ connectors: await listConnectors() });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
