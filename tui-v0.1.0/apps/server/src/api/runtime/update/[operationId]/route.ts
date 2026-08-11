import { apiErrorResponse } from "@/modules/api/errors";
import { getRuntimeUpdateOperation } from "@/modules/runtime/update-operations";

export async function GET(_request: Request, context: { params: Promise<Record<string, string>> }) {
  try {
    const { operationId } = await context.params;
    const operation = await getRuntimeUpdateOperation(operationId);
    if (!operation) return Response.json({ error: { code: "NOT_FOUND", message: "Opération introuvable." } }, { status: 404 });
    return Response.json({ operation }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
