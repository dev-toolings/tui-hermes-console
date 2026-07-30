import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { apiErrorResponse } from "@/modules/api/errors";
import { getArtifact } from "@/modules/artifacts/repository";
import { assertSameOriginMutation } from "@/modules/api/same-origin";

export async function GET(
  request: Request,
  context: { params: Promise<{ fileId: string }> },
) {
  try {
    // Auth utilisateur encore ouverte (Phase 2) — garde same-origin en attendant.
    assertSameOriginMutation(request);

    const { fileId } = await context.params;
    const artifact = await getArtifact(fileId);
    if (!artifact) {
      return Response.json(
        { error: { code: "ARTIFACT_NOT_FOUND", message: "Fichier introuvable." } },
        { status: 404 },
      );
    }

    const info = await stat(artifact.storagePath);
    const stream = createReadStream(artifact.storagePath);
    const headers = new Headers({
      "Content-Type": artifact.mimeType || "application/octet-stream",
      "Content-Length": String(info.size),
      "Content-Disposition": `attachment; filename="${artifact.filename.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
    });

    return new Response(Readable.toWeb(stream) as unknown as ReadableStream, {
      status: 200,
      headers,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
