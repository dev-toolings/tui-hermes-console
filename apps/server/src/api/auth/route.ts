import { apiErrorResponse } from "@/modules/api/errors";
import { assertSameOriginMutation } from "@/modules/api/same-origin";
import { consoleSetupRequired } from "@/modules/setup/service";
import { AuthError, assertCsrf, beginGoogleLogin, clearSessionHeaders, completeGoogleLogin, deleteSession, getSession, oidcStateClearingHeader, resolveSiteRequirement, selectSessionSite } from "@/modules/auth/service";
import { z } from "zod";
import {
  CURRENT_AI_DISCLOSURE,
  hasCurrentAiDisclosureConsent,
} from "@/modules/setup/ai-disclosure";
import type { AuthSession } from "@/modules/auth/service";

const MAX_ATTEMPTS = 10;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_TRACKED_CLIENTS = 10_000;
const attempts = new Map<string, { count: number; resetAt: number }>();
/**
 * `X-Forwarded-For` n'est une identité réseau que derrière notre proxy : une
 * requête directe pourrait le forger. En local, le serveur est loopback et la
 * limite reste volontairement partagée plutôt que contournable.
 */
function key(request: Request) {
  if (process.env.CONSOLE_TRUST_PROXY !== "1") return "direct";
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
function guard(request: Request) { const value = attempts.get(key(request)); if (value && value.resetAt > Date.now() && value.count >= MAX_ATTEMPTS) throw new AuthError("Trop de tentatives. Réessayez plus tard.", 429, "AUTH_RATE_LIMITED"); }
function failure(request: Request) {
  const now = Date.now();
  for (const [client, value] of attempts) if (value.resetAt <= now) attempts.delete(client);
  if (attempts.size >= MAX_TRACKED_CLIENTS && !attempts.has(key(request))) attempts.delete(attempts.keys().next().value!);
  const current = attempts.get(key(request));
  attempts.set(key(request), { count: current && current.resetAt > now ? current.count + 1 : 1, resetAt: now + ATTEMPT_WINDOW_MS });
}

export function authStatusPayload(
  session: AuthSession | null,
  setupRequired: boolean,
) {
  const consentRequired = session
    ? !hasCurrentAiDisclosureConsent(session)
    : false;
  return {
    authenticated: session !== null,
    setupRequired,
    consentRequired,
    user: session
      ? {
          email: session.email,
          name: session.name,
          aiDisclosure: {
            currentVersion: CURRENT_AI_DISCLOSURE.version,
            acceptedVersion: session.aiDisclosureVersion,
            acceptedAt:
              session.aiDisclosureAcceptedAt?.toISOString() ?? null,
            consentRequired,
          },
        }
      : null,
    siteContext: session
      ? {
          ...resolveSiteRequirement(session.memberships, session.siteId),
          memberships: session.memberships,
        }
      : null,
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const action = url.searchParams.get("action");
  try {
    if (action === "login") {
      guard(request);
      const login = await beginGoogleLogin();
      return new Response(null, { status: 302, headers: { location: login.authorizationUrl, "set-cookie": login.stateCookie, "cache-control": "no-store" } });
    }
    if (action === "callback") {
      try {
        guard(request);
        const error = url.searchParams.get("error");
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        if (error || !code || !state) throw new AuthError("La connexion Google a été annulée ou est invalide.", 401, "GOOGLE_CALLBACK_REJECTED");
        const completed = await completeGoogleLogin(request, code, state);
        attempts.delete(key(request));
        const headers = sessionHeadersForCallback(completed.rawToken, completed.session, oidcStateClearingHeader());
        headers.set("location", completed.appOrigin);
        return new Response(null, { status: 302, headers });
      } catch (error) {
        failure(request);
        return callbackFailureResponse(error);
      }
    }
    const session = await getSession(request);
    return Response.json(
      authStatusPayload(session, await consoleSetupRequired()),
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    failure(request);
    return apiErrorResponse(error);
  }
}

/** Une callback OAuth est une navigation : ne jamais laisser une erreur API brute dans le navigateur. */
function callbackFailureResponse(error: unknown) {
  const code = error instanceof AuthError ? error.code : "GOOGLE_CALLBACK_FAILED";
  try {
    const destination = new URL("/setup", process.env.CONSOLE_APP_ORIGIN);
    destination.searchParams.set("auth_error", code);
    return new Response(null, {
      status: 302,
      headers: {
        location: destination.toString(),
        "cache-control": "no-store",
        "set-cookie": oidcStateClearingHeader(),
      },
    });
  } catch {
    return apiErrorResponse(error);
  }
}

function sessionHeadersForCallback(rawToken: string, session: { csrfToken: string; expiresAt: Date }, clearState: string) {
  const seconds = Math.max(0, Math.floor((session.expiresAt.getTime() - Date.now()) / 1000));
  const secure = process.env.GOOGLE_REDIRECT_URI?.startsWith("https://") ? "; Secure" : "";
  const headers = new Headers({ "cache-control": "no-store" });
  headers.append("set-cookie", `hc_session=${encodeURIComponent(rawToken)}; Path=/; SameSite=Strict${secure}; HttpOnly; Max-Age=${seconds}`);
  headers.append("set-cookie", `hc_csrf=${encodeURIComponent(session.csrfToken)}; Path=/; SameSite=Strict${secure}; Max-Age=${seconds}`);
  headers.append("set-cookie", clearState);
  return headers;
}

export async function POST(request: Request) {
  try {
    const action = new URL(request.url).searchParams.get("action");
    if (action !== "logout" && action !== "select-site") throw new AuthError("Action d'authentification inconnue.", 404, "AUTH_ACTION_NOT_FOUND");
    const session = await getSession(request);
    if (!session) throw new AuthError("Authentification requise.", 401, "AUTH_REQUIRED");
    assertSameOriginMutation(request);
    assertCsrf(request, session);
    if (action === "select-site") {
      const { siteId } = z
        .object({ siteId: z.string().trim().min(1).max(200) })
        .strict()
        .parse(await request.json());
      return Response.json({ activeSite: await selectSessionSite(request, siteId) });
    }
    await deleteSession(request);
    return new Response(null, { status: 204, headers: clearSessionHeaders() });
  } catch (error) { return apiErrorResponse(error); }
}
