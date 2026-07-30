import type { RuntimeProbeDto } from "@console/core/modules/runtime/probe";
import { apiErrorResponse } from "@/modules/api/errors";
import { getRuntimePublic, resolveHermesRuntimeConfig } from "@/modules/runtime/config";
import { testHermesRuntimeAgainst } from "@/modules/runtime/hermes-adapter";

/**
 * Sonde le runtime Hermes et mesure sa latence, pour l'écran Support.
 *
 * ⚠️ `resolveHermesRuntimeConfig()` déchiffre le token du runtime. Il ne doit
 * jamais franchir cette frontière : la réponse ne contient que le verdict, la
 * version, la latence et les fonctionnalités annoncées. L'écran Support faisait
 * cet appel pendant son rendu serveur — porté tel quel côté client, il aurait
 * exposé le token.
 */
export async function GET() {
  try {
    const runtime = await getRuntimePublic();

    if (!runtime.configured) {
      const probe: RuntimeProbeDto = {
        ok: false,
        version: runtime.detectedVersion,
        latencyMs: null,
        error: null,
        features: [],
      };
      return Response.json({ probe });
    }

    const started = Date.now();
    try {
      const config = await resolveHermesRuntimeConfig();
      const result = await testHermesRuntimeAgainst(config);

      const features = result.capabilities.features
        ? Object.entries(result.capabilities.features)
            .filter(([, enabled]) => enabled === true)
            .map(([name]) => name)
            .slice(0, 12)
        : [];

      const health = result.health as { version?: unknown } | null;
      const version =
        typeof health === "object" && health && typeof health.version === "string"
          ? health.version
          : runtime.detectedVersion;

      const probe: RuntimeProbeDto = {
        ok: true,
        version,
        latencyMs: Date.now() - started,
        error: null,
        features,
      };
      return Response.json({ probe });
    } catch (error) {
      const probe: RuntimeProbeDto = {
        ok: false,
        version: runtime.detectedVersion,
        latencyMs: Date.now() - started,
        error: error instanceof Error ? error.message : "Probe runtime échoué.",
        features: [],
      };
      return Response.json({ probe });
    }
  } catch (error) {
    return apiErrorResponse(error);
  }
}
