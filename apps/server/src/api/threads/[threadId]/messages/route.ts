import { z } from "zod";
import { apiErrorResponse } from "@/modules/api/errors";
import { depositInputFile, ArtifactError } from "@/modules/artifacts/repository";
import { ArtifactPathError } from "@/modules/artifacts/paths";
import { createRunForThread } from "@/modules/runs/repository";
import { createProductEventStream } from "@/modules/runs/product-event-sse";
import { startRun } from "@/modules/runs/runner";

const messageSchema = z.object({
  message: z.string().trim().min(1).max(100_000),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ threadId: string }> },
) {
  try {
    const { threadId } = await context.params;
    const contentType = request.headers.get("content-type") ?? "";

    let message: string;
    let files: File[] = [];

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      message = messageSchema.parse({ message: String(form.get("message") ?? "") }).message;
      files = form
        .getAll("files")
        .filter((item): item is File => item instanceof File && item.size > 0);
    } else {
      message = messageSchema.parse(await request.json()).message;
    }

    const created = await createRunForThread(threadId, message);

    for (const file of files) {
      try {
        await depositInputFile(created.runId, file);
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
        throw error;
      }
    }

    startRun(created.runId);

    const stream = new URL(request.url).searchParams.get("stream") === "1";
    if (stream) {
      return createProductEventStream({
        threadId,
        runId: created.runId,
        signal: request.signal,
        closeOnTerminal: true,
      });
    }

    return Response.json(created, { status: 202 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
