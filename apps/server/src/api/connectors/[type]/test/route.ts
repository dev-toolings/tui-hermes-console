import { apiErrorResponse } from "@/modules/api/errors";
import { isConnectorType, testConnector } from "@/modules/connectors/repository";
import type { ConnectorType } from "@/db/schema";

export async function POST(
  _request: Request,
  context: { params: Promise<{ type: string }> },
) {
  try {
    const { type } = await context.params;
    if (!isConnectorType(type)) {
      return Response.json(
        { error: { code: "CONNECTOR_INVALID_TYPE", message: "Type de connecteur invalide." } },
        { status: 400 },
      );
    }
    const connector = await testConnector(type as ConnectorType);
    return Response.json({ connector, ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
