import { z } from "zod";
import { apiErrorResponse } from "@/modules/api/errors";
import {
  getConsoleSetup,
  setConsoleSetupStep,
} from "@/modules/setup/service";
import { requireSession } from "@/modules/auth/service";
import { assertInstallationAccess } from "@/modules/auth/site-authorization";
import type { AuthenticatedRouteContext } from "@/modules/api/route-context";
import {
  acceptCurrentAiDisclosure,
  CURRENT_AI_DISCLOSURE,
  hasCurrentAiDisclosureConsent,
} from "@/modules/setup/ai-disclosure";

const updateSetupSchema = z.union([
  z.object({ step: z.enum(["runtime", "agent", "completed"]) }),
  z.object({ consentVersion: z.string().trim().min(1).max(100) }),
]);

export function publicSetupState<T extends object>(
  setup: T,
): Omit<T, "runtimeConfigVersion"> {
  const publicState = { ...setup } as T & { runtimeConfigVersion?: unknown };
  delete publicState.runtimeConfigVersion;
  return publicState;
}

export async function GET(request: Request) {
  try {
    const session = await requireSession(request);
    return Response.json(
      {
        setup: {
          ...publicSetupState(await getConsoleSetup()),
          disclosure: CURRENT_AI_DISCLOSURE,
          consent: {
            current: hasCurrentAiDisclosureConsent(session),
            version: session.aiDisclosureVersion,
            acceptedAt: session.aiDisclosureAcceptedAt?.toISOString() ?? null,
          },
        },
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(
  request: Request,
  context: AuthenticatedRouteContext,
) {
  try {
    const input = updateSetupSchema.parse(await request.json());
    if ("step" in input) {
      const session = await requireSession(request);
      await assertInstallationAccess(
        context.siteContext,
        session.email,
        request.method,
        "/api/setup",
      );
      return Response.json({
        setup: publicSetupState(
          await setConsoleSetupStep(input.step, {
            hasCurrentAiConsent: hasCurrentAiDisclosureConsent(session),
          }),
        ),
      });
    }
    const session = await requireSession(request);
    if ("consentVersion" in input) {
      const consent = await acceptCurrentAiDisclosure(
        session.userId,
        input.consentVersion,
      );
      return Response.json({
        consent: {
          current: true,
          version: consent.version,
          acceptedAt: consent.acceptedAt.toISOString(),
        },
      });
    }
  } catch (error) {
    return apiErrorResponse(error);
  }
}
