import { z } from "zod";
import { apiErrorResponse } from "@/modules/api/errors";
import { assertSameOriginMutation } from "@/modules/api/same-origin";
import { HermesRuntimeError } from "@/modules/runtime/hermes-adapter";
import { discoverRuntimeWorkspace } from "@/modules/runtime/workspace";

const schema = z.object({
  expectedRevision: z.number().int().positive().optional(),
}).optional();

export async function POST(request: Request) {
  try {
    assertSameOriginMutation(request);
    const raw = await request.text();
    const input = raw ? schema.parse(JSON.parse(raw)) : undefined;
    const discovery = await discoverRuntimeWorkspace(input?.expectedRevision);
    if (discovery.transport !== "ssh") {
      throw new HermesRuntimeError(
        "Cette route historique est réservée au transport SSH.",
        409,
        "RUNTIME_TRANSPORT_MISMATCH",
      );
    }
    const { transport: _, ...sshDiscovery } = discovery;
    return Response.json({ discovery: sshDiscovery }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
