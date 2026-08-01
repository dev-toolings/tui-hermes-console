import { eq } from "drizzle-orm";
import { consoleUsers } from "@/db/schema";
import { getDatabase } from "@/db/client";
import { requireSession, type AuthSession } from "@/modules/auth/service";
import { SetupError } from "./service";

export const CURRENT_AI_DISCLOSURE = {
  version: "2026-08-01.v2",
  title: "Utilisation de l’intelligence artificielle",
  summary:
    "Cette Console utilise une intelligence artificielle pour traiter vos missions avec Hermes et les modèles configurés.",
  items: [
    "Vos instructions, messages et fichiers utiles peuvent être transmis au runtime Hermes et à des fournisseurs externes de modèles d’IA.",
    "Selon les outils et autorisations configurés, l’IA peut proposer ou exécuter des commandes et des actions sur vos systèmes et fichiers.",
    "Vous gardez le contrôle humain : vérifiez les réponses, commandes et actions avant toute décision ou diffusion.",
    "Les résultats de l’IA peuvent être incomplets, inexacts ou inadaptés à votre contexte.",
    "N’envoyez des secrets ou des données personnelles que si votre organisation vous y autorise.",
  ],
} as const;

export function hasCurrentAiDisclosureConsent(
  user: Pick<AuthSession, "aiDisclosureVersion" | "aiDisclosureAcceptedAt">,
) {
  return (
    user.aiDisclosureVersion === CURRENT_AI_DISCLOSURE.version &&
    user.aiDisclosureAcceptedAt instanceof Date
  );
}

export async function acceptCurrentAiDisclosure(
  userId: string,
  requestedVersion: string,
) {
  if (requestedVersion !== CURRENT_AI_DISCLOSURE.version) {
    throw new SetupError(
      "La notice IA a changé. Relisez sa version actuelle avant de l’accepter.",
      409,
      "AI_DISCLOSURE_VERSION_OUTDATED",
    );
  }

  const acceptedAt = new Date();
  const [updated] = await getDatabase()
    .update(consoleUsers)
    .set({
      aiDisclosureVersion: CURRENT_AI_DISCLOSURE.version,
      aiDisclosureAcceptedAt: acceptedAt,
      updatedAt: acceptedAt,
    })
    .where(eq(consoleUsers.id, userId))
    .returning({ id: consoleUsers.id });
  if (!updated) {
    throw new SetupError(
      "L’opérateur authentifié est introuvable.",
      401,
      "AUTH_REQUIRED",
    );
  }
  return { version: CURRENT_AI_DISCLOSURE.version, acceptedAt };
}

export function aiDisclosureRequiredResponse() {
  return Response.json(
    {
      error: {
        code: "AI_DISCLOSURE_CONSENT_REQUIRED",
        message:
          "Acceptez la notice d’utilisation de l’IA dans la mise en service avant de lancer une mission.",
        disclosure: CURRENT_AI_DISCLOSURE,
        setupPath: "/setup",
      },
    },
    { status: 428, headers: { "cache-control": "no-store" } },
  );
}

export function setupRequiredResponse() {
  return Response.json(
    {
      error: {
        code: "SETUP_REQUIRED",
        message: "La configuration initiale doit être terminée.",
        setupPath: "/setup",
      },
    },
    { status: 423, headers: { "cache-control": "no-store" } },
  );
}

export function isAiRunStartRequest(method: string, path: string) {
  if (method.toUpperCase() !== "POST") return false;
  return (
    path === "/api/threads" ||
    /^\/api\/threads\/[^/]+\/messages$/.test(path) ||
    /^\/api\/runs\/[^/]+\/retry$/.test(path)
  );
}

/** La frontière montée est 423 avant 428 : le handler ne voit que le second cas. */
export function runStartPreconditionResponse(
  setupRequired: boolean,
  session: Pick<AuthSession, "aiDisclosureVersion" | "aiDisclosureAcceptedAt">,
) {
  if (setupRequired) return setupRequiredResponse();
  if (!hasCurrentAiDisclosureConsent(session)) {
    return aiDisclosureRequiredResponse();
  }
  return null;
}

/** Défense handler après la garde setup montée par Hono. */
export async function withCurrentAiDisclosureConsent<T>(
  request: Request,
  operation: () => Promise<T>,
  loadSession: (request: Request) => Promise<AuthSession> = requireSession,
): Promise<T | Response> {
  const session = await loadSession(request);
  if (!hasCurrentAiDisclosureConsent(session)) {
    return aiDisclosureRequiredResponse();
  }
  return operation();
}
