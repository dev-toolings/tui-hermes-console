import { z } from "zod";
import { apiErrorResponse } from "@/modules/api/errors";
import {
  depositInputFile,
  ArtifactError,
} from "@/modules/artifacts/repository";
import { ArtifactPathError } from "@/modules/artifacts/paths";
import {
  createRunForThread,
  discardUnstartedRun,
} from "@/modules/runs/repository";
import { createProductEventStream } from "@/modules/runs/product-event-sse";
import { startRun } from "@/modules/runs/runner";
import { withCurrentAiDisclosureConsent } from "@/modules/setup/ai-disclosure";
import type { AuthenticatedRouteContext } from "@/modules/api/route-context";

const messageSchema = z.object({
  message: z.string().trim().min(1).max(100_000),
}).strict();

export async function POST(
  request: Request,
  context: AuthenticatedRouteContext<{ threadId: string }>,
  dependencies: { withConsent: typeof withCurrentAiDisclosureConsent } = {
    withConsent: withCurrentAiDisclosureConsent,
  },
) {
  try {
    return await dependencies.withConsent(request, async () => {
      const { threadId: rawThreadId } = await context.params;
      const threadId = z.string().trim().min(1).max(200).parse(rawThreadId);
      const contentType = request.headers.get("content-type") ?? "";

      let message: string;
      let files: File[] = [];

      if (contentType.includes("multipart/form-data")) {
        const form = await request.formData();
        message = messageSchema.parse({
          message: String(form.get("message") ?? ""),
        }).message;
        files = form
          .getAll("files")
          .filter((item): item is File => item instanceof File && item.size > 0);
      } else {
        message = messageSchema.parse(await request.json()).message;
      }

      const created = await createRunForThread(context.siteContext, threadId, message);

      for (const file of files) {
        try {
          await depositInputFile(context.siteContext, created.runId, file);
        } catch (error) {
          if (
            error instanceof ArtifactError ||
            error instanceof ArtifactPathError
          ) {
            await discardUnstartedRun(context.siteContext, created.runId);
            return Response.json(
              {
                error: {
                  code:
                    error instanceof ArtifactError
                      ? error.code
                      : "INVALID_FILENAME",
                  message: error.message,
                },
              },
              { status: 400 },
            );
          }
          throw error;
        }
      }

      startRun(context.siteContext, created.runId);

      const stream = new URL(request.url).searchParams.get("stream") === "1";
      if (stream) {
        return createProductEventStream({
          context: context.siteContext,
          threadId,
          runId: created.runId,
          signal: request.signal,
          closeOnTerminal: true,
        });
      }

      return Response.json(created, { status: 202 });
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
