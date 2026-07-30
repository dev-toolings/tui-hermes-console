import { z } from "zod";
import { apiErrorResponse } from "@/modules/api/errors";
import { assertSameOriginMutation } from "@/modules/api/same-origin";
import { resolveHermesRuntimeConfig } from "@/modules/runtime/config";
import {
  HermesRuntimeError,
  hermesProviderAcceptsApiKey,
  listHermesModelOptions,
} from "@/modules/runtime/hermes-adapter";
import {
  assertLocalHermesRuntime,
  replaceConsoleManagedApiKey,
} from "@/modules/runtime/local-management";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const apiKeySchema = z.object({
  apiKey: z.string().trim().min(8).max(4_096),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  try {
    assertSameOriginMutation(request);
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 8_192) {
      throw new HermesRuntimeError(
        "La requête de credential est trop volumineuse.",
        413,
        "HERMES_CREDENTIAL_TOO_LARGE",
      );
    }

    const { provider: rawProvider } = await params;
    const provider = rawProvider.trim().toLowerCase();
    const input = apiKeySchema.parse(await request.json());
    const config = await assertLocalHermesRuntime(
      "La gestion des clés API depuis la Console",
    );
    const catalog = await listHermesModelOptions(config);
    const catalogProvider = catalog.providers.find((item) => item.slug === provider);
    if (!catalogProvider) {
      throw new HermesRuntimeError(
        "Ce provider n’existe pas dans le catalogue Hermes.",
        404,
        "HERMES_PROVIDER_NOT_FOUND",
      );
    }
    if (!hermesProviderAcceptsApiKey(catalogProvider)) {
      throw new HermesRuntimeError(
        "Ce provider n’accepte pas de clé API manuelle.",
        409,
        "HERMES_PROVIDER_API_KEY_UNSUPPORTED",
      );
    }

    const result = await replaceConsoleManagedApiKey({
      provider,
      apiKey: input.apiKey,
    });
    const refreshed = await listHermesModelOptions(
      await resolveHermesRuntimeConfig(),
    );
    const refreshedProvider = refreshed.providers.find((item) => item.slug === provider);

    return Response.json(
      {
        ok: true,
        provider,
        authenticated: refreshedProvider?.authenticated === true,
        modelCount: refreshedProvider?.models.length ?? 0,
        replacedConsoleCredentials: result.replacedConsoleCredentials,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
