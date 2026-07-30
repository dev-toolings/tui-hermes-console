import { z } from "zod";
import { apiErrorResponse } from "@/modules/api/errors";
import { assertSameOriginMutation } from "@/modules/api/same-origin";
import {
  probeAndPersistRuntime,
  resolveHermesRuntimeConfig,
} from "@/modules/runtime/config";
import { HermesRuntimeError } from "@/modules/runtime/hermes-adapter";
import {
  assertLocalHermesRuntime,
  restartLocalHermesGateway,
} from "@/modules/runtime/local-management";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const restartSchema = z.object({
  confirm: z.literal(true),
});

const globalRestart = globalThis as typeof globalThis & {
  hermesConsoleRestart?: Promise<RestartResult>;
};

type RestartResult = {
  ok: true;
  restartedAt: string;
  recoveryMs: number;
  runtime: Awaited<ReturnType<typeof probeAndPersistRuntime>>["runtime"];
};

export async function POST(request: Request) {
  try {
    assertSameOriginMutation(request);
    restartSchema.parse(await request.json());
    await assertLocalHermesRuntime("Le redémarrage depuis la Console");

    const pending = globalRestart.hermesConsoleRestart ?? restartAndWait();
    globalRestart.hermesConsoleRestart = pending;
    try {
      return Response.json(await pending, {
        headers: {
          "Cache-Control": "no-store",
        },
      });
    } finally {
      if (globalRestart.hermesConsoleRestart === pending) {
        delete globalRestart.hermesConsoleRestart;
      }
    }
  } catch (error) {
    return apiErrorResponse(error);
  }
}

async function restartAndWait(): Promise<RestartResult> {
  const startedAt = Date.now();
  await restartLocalHermesGateway();
  const deadline = Date.now() + 30_000;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await resolveHermesRuntimeConfig();
      const result = await probeAndPersistRuntime();
      return {
        ok: true,
        restartedAt: new Date().toISOString(),
        recoveryMs: Date.now() - startedAt,
        runtime: result.runtime,
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw new HermesRuntimeError(
    lastError instanceof Error
      ? `Hermes a redémarré mais n’est pas redevenu joignable (${lastError.message}).`
      : "Hermes a redémarré mais n’est pas redevenu joignable.",
    504,
    "HERMES_RESTART_RECOVERY_TIMEOUT",
  );
}
