import { apiErrorResponse } from "@/modules/api/errors";
import { getArtifact } from "@/modules/artifacts/repository";
import {
  ArtifactIntegrityError,
  readVerifiedArtifact,
} from "@/modules/artifacts/integrity";
import { getConsoleArtifactRoot } from "@/modules/artifacts/paths";
import { assertSameOriginMutation } from "@/modules/api/same-origin";
import type { AuthenticatedRouteContext } from "@/modules/api/route-context";
import { z } from "zod";
import { deleteArtifactEverywhere } from "@/modules/artifacts/delete-artifact";

export async function GET(
  request: Request,
  context: AuthenticatedRouteContext<{ fileId: string }>,
  dependencies: { read: typeof readVerifiedArtifact } = {
    read: readVerifiedArtifact,
  },
) {
  try {
    // Auth utilisateur encore ouverte (Phase 2) — garde same-origin en attendant.
    assertSameOriginMutation(request);

    const { fileId: rawFileId } = await context.params;
    const fileId = z.string().trim().min(1).max(200).parse(rawFileId);
    const artifact = await getArtifact(context.siteContext, fileId);
    if (!artifact) {
      return Response.json(
        {
          error: {
            code: "ARTIFACT_NOT_FOUND",
            message: "Fichier introuvable.",
          },
        },
        { status: 404 },
      );
    }

    // La base ne constitue pas une capacité de lecture arbitraire : même une
    // ligne ancienne ou compromise doit pointer vers le coffre privé Console.
    const bytes = await dependencies.read(
      artifact.storagePath,
      getConsoleArtifactRoot(),
      artifact,
    );
    const headers = new Headers({
      "Content-Type": artifact.mimeType || "application/octet-stream",
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `attachment; filename="${artifact.filename.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
    });

    const body = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(body).set(bytes);
    return new Response(body, {
      status: 200,
      headers,
    });
  } catch (error) {
    if (error instanceof ArtifactIntegrityError) {
      return Response.json(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    }
    return apiErrorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  context: AuthenticatedRouteContext<{ fileId: string }>,
  dependencies: { delete: typeof deleteArtifactEverywhere } = {
    delete: deleteArtifactEverywhere,
  },
) {
  try {
    const { fileId: rawFileId } = await context.params;
    const fileId = z.string().trim().min(1).max(200).parse(rawFileId);
    return Response.json({
      deleted: true,
      ...(await dependencies.delete(context.siteContext, fileId)),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
