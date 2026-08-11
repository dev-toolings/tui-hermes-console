import { apiErrorResponse } from "@/modules/api/errors";
import { getRuntimeCredentialOperation } from "@/modules/runtime/credentials";

export async function GET(
  _request: Request,
  context: { params: Promise<Record<string, string>> },
) {
  try {
    const { operationId } = await context.params;
    return Response.json(
      { operation: await getRuntimeCredentialOperation(operationId) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
