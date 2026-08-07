import { z } from "zod";

import { apiErrorResponse } from "@/modules/api/errors";
import { assertSameOriginMutation } from "@/modules/api/same-origin";
import { assertCsrf, createMobilePairing, exchangeMobilePairing, getSession, AuthError } from "@/modules/auth/service";

const exchangeSchema = z.object({ pairingCode: z.string().trim().min(20).max(512) }).strict();

export async function POST(request: Request) {
  try {
    const action = new URL(request.url).searchParams.get("action");
    if (action === "create") {
      const session = await getSession(request);
      if (!session) throw new AuthError("Authentification requise.", 401, "AUTH_REQUIRED");
      assertSameOriginMutation(request);
      assertCsrf(request, session);
      const pairing = await createMobilePairing(session);
      return Response.json({ pairingCode: pairing.pairingCode, expiresAt: pairing.expiresAt.toISOString() }, { status: 201 });
    }
    if (action === "exchange") {
      const { pairingCode } = exchangeSchema.parse(await request.json());
      const exchanged = await exchangeMobilePairing(pairingCode);
      return Response.json({ sessionToken: exchanged.sessionToken, expiresAt: exchanged.expiresAt.toISOString() });
    }
    throw new AuthError("Action mobile inconnue.", 404, "MOBILE_AUTH_ACTION_NOT_FOUND");
  } catch (error) {
    return apiErrorResponse(error);
  }
}
