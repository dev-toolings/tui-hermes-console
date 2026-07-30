import { apiErrorResponse } from "@/modules/api/errors";
import { depositInputFile, ArtifactError } from "@/modules/artifacts/repository";
import { ArtifactPathError } from "@/modules/artifacts/paths";
import { getRunCancelTarget, ProductRepositoryError } from "@/modules/runs/repository";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const metaSchema = z.object({
  runId: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const runId = String(form.get("runId") ?? "");
    metaSchema.parse({ runId });

    const run = await getRunCancelTarget(runId);
    if (!run) {
      throw new ProductRepositoryError("RUN_NOT_FOUND", "Mission introuvable.");
    }

    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json(
        { error: { code: "INVALID_INPUT", message: "Fichier manquant." } },
        { status: 400 },
      );
    }

    const artifact = await depositInputFile(runId, file);
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
