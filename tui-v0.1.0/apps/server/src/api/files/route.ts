import { apiErrorResponse } from "@/modules/api/errors";
import {
  depositInputFile,
  listAllArtifacts,
  ArtifactError,
} from "@/modules/artifacts/repository";
import { ArtifactPathError } from "@/modules/artifacts/paths";
import { getRunCancelTarget, ProductRepositoryError } from "@/modules/runs/repository";
import { z } from "zod";
import type { AuthenticatedRouteContext } from "@/modules/api/route-context";

const metaSchema = z.object({
  runId: z.string().trim().min(1).max(200),
}).strict();

/**
 * Inventaire des artefacts, pour l'écran Artefacts.
 *
 * La route n'exposait que le dépôt (POST) : l'écran lisait la base directement
 * pendant son rendu serveur, ce que le SPA ne peut pas faire.
 */
export async function GET(request: Request, context: AuthenticatedRouteContext) {
  try {
    const raw = new URL(request.url).searchParams.get("limit");
    const parsed = Number(raw);
    const limit = Number.isFinite(parsed)
      ? Math.min(Math.max(Math.trunc(parsed), 1), 200)
      : 50;
    return Response.json({ artifacts: await listAllArtifacts(context.siteContext, limit) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request, context: AuthenticatedRouteContext) {
  try {
    const form = await request.formData();
    if (form.has("siteId") || form.has("projectId")) {
      metaSchema.parse({
        runId: String(form.get("runId") ?? ""),
        ...(form.has("siteId") ? { siteId: form.get("siteId") } : {}),
        ...(form.has("projectId") ? { projectId: form.get("projectId") } : {}),
      });
    }
    const runId = String(form.get("runId") ?? "");
    metaSchema.parse({ runId });

    const run = await getRunCancelTarget(context.siteContext, runId);
    if (!run) {
      const { auditScopedMiss } = await import("@/modules/auth/site-access");
      await auditScopedMiss(context.siteContext, { action: "artifact.create", resourceType: "run", resourceId: runId });
      throw new ProductRepositoryError("RUN_NOT_FOUND", "Mission introuvable.");
    }

    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json(
        { error: { code: "INVALID_INPUT", message: "Fichier manquant." } },
        { status: 400 },
      );
    }

    const artifact = await depositInputFile(context.siteContext, runId, file);
    return Response.json({ artifact }, { status: 201 });
  } catch (error) {
    if (error instanceof ArtifactError || error instanceof ArtifactPathError) {
      return Response.json(
        {
          error: {
            code: error instanceof ArtifactError ? error.code : "INVALID_FILENAME",
            message: error.message,
          },
        },
        { status: 400 },
      );
    }
    return apiErrorResponse(error);
  }
}
