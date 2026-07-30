import { z } from "zod";
import { apiErrorResponse } from "@/modules/api/errors";
import {
  deleteConnector,
  isConnectorType,
  saveConnector,
} from "@/modules/connectors/repository";
import type { ConnectorType } from "@/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const putConnectorSchema = z.object({
  label: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().email().max(320),
  imapHost: z.string().trim().max(255).optional(),
  imapPort: z.number().int().min(1).max(65_535).optional(),
  password: z.string().trim().min(1).max(2_000).optional(),
});

export async function PUT(
  request: Request,
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
    const input = putConnectorSchema.parse(await request.json());
    const connector = await saveConnector({
      type: type as ConnectorType,
      ...input,
    });
    return Response.json({ connector });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(
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
    await deleteConnector(type as ConnectorType);
    return new Response(null, { status: 204 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
