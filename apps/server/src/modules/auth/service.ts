import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, asc, count, eq, gt, lt, sql } from "drizzle-orm";
import {
  consoleAuthTransactions,
  consoleSessions,
  consoleUsers,
  siteMemberships,
  sites,
  type SiteMembershipRole,
} from "@/db/schema";
import { getDatabase } from "@/db/client";

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14;
const AUTH_TRANSACTION_TTL_MS = 1000 * 60 * 10;
const SESSION_COOKIE = "hc_session";
const OIDC_STATE_COOKIE = "hc_oidc_state";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_JWKS_ENDPOINT = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);

export type AuthSession = {
  tokenHash: string;
  userId: string;
  csrfToken: string;
  expiresAt: Date;
  email: string;
  name: string | null;
  siteId: string | null;
  role: SiteMembershipRole | null;
  memberships: SiteMembershipSummary[];
  aiDisclosureVersion: string | null;
  aiDisclosureAcceptedAt: Date | null;
};
export type AuthUser = { email: string; name: string | null };
export type SiteMembershipSummary = {
  id: string;
  name: string;
  slug: string;
  role: SiteMembershipRole;
};
export type SiteScope = { siteId: string };
export type SiteRequestContext = SiteScope & {
  userId: string;
  role: SiteMembershipRole;
  correlationId: string;
};

export class AuthError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message);
  }
}

type GoogleClaims = { sub: string; email: string; email_verified: boolean | string; name?: string; aud: string | string[]; iss: string; exp: number; nonce?: string };
type Jwk = JsonWebKey & { kid?: string; alg?: string; use?: string };

function tokenHash(token: string) { return createHash("sha256").update(token).digest("hex"); }
function randomToken() { return randomBytes(32).toString("base64url"); }
/** RFC 7636 S256, encoded without padding as required by OAuth. */
export function pkceChallenge(verifier: string) { return createHash("sha256").update(verifier).digest("base64url"); }

function secureCookie() { return process.env.GOOGLE_REDIRECT_URI?.startsWith("https://") ?? false; }
function cookie(name: string, value: string, options: { httpOnly?: boolean; maxAge?: number; sameSite?: "Lax" | "Strict" } = {}) {
  const secure = secureCookie() ? "; Secure" : "";
  const httpOnly = options.httpOnly ? "; HttpOnly" : "";
  const maxAge = options.maxAge === undefined ? "" : `; Max-Age=${options.maxAge}`;
  return `${name}=${encodeURIComponent(value)}; Path=/; SameSite=${options.sameSite ?? "Strict"}${secure}${httpOnly}${maxAge}`;
}

function readCookie(request: Request, name: string) {
  const value = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
  try { return value ? decodeURIComponent(value) : null; } catch { return null; }
}

export function isGoogleEmailAllowed(
  email: string,
  configuredEmails = process.env.GOOGLE_ALLOWED_EMAILS ?? "",
) {
  const allowed = new Set(
    configuredEmails
      .split(",")
      .map((candidate) => candidate.trim().toLowerCase())
      .filter(Boolean),
  );
  return allowed.has(email.trim().toLowerCase());
}

/** Une session existante ne doit pas survivre au retrait de son opérateur. */
export async function keepSessionIfEmailAllowed(
  email: string,
  revoke: () => Promise<unknown>,
  configuredEmails = process.env.GOOGLE_ALLOWED_EMAILS ?? "",
) {
  if (isGoogleEmailAllowed(email, configuredEmails)) return true;
  await revoke();
  return false;
}

function requiredConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const redirectUri = process.env.GOOGLE_REDIRECT_URI?.trim();
  const appOrigin = process.env.CONSOLE_APP_ORIGIN?.trim();
  const emails = new Set((process.env.GOOGLE_ALLOWED_EMAILS ?? "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean));
  if (!clientId || !clientSecret || !redirectUri || !appOrigin || emails.size === 0) {
    throw new AuthError("L'authentification Google n'est pas configurée.", 503, "AUTH_CONFIGURATION_INVALID");
  }
  let callback: URL;
  let origin: URL;
  try { callback = new URL(redirectUri); origin = new URL(appOrigin); } catch { throw new AuthError("La configuration des URL d'authentification est invalide.", 503, "AUTH_CONFIGURATION_INVALID"); }
  if (!/^https?:$/.test(callback.protocol) || !/^https?:$/.test(origin.protocol)) throw new AuthError("La configuration des URL d'authentification est invalide.", 503, "AUTH_CONFIGURATION_INVALID");
  return { clientId, clientSecret, redirectUri: callback.toString(), appOrigin: origin.origin, emails };
}

type AuthDatabase = ReturnType<typeof getDatabase>;
type AuthTransaction = Parameters<Parameters<AuthDatabase["transaction"]>[0]>[0];

async function createSession(
  userId: string,
  siteId: string | null,
  database: AuthDatabase | AuthTransaction = getDatabase(),
) {
  const rawToken = randomToken();
  const csrfToken = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const hash = tokenHash(rawToken);
  await database.insert(consoleSessions).values({
    tokenHash: hash,
    userId,
    siteId,
    csrfToken,
    expiresAt,
  });
  return { rawToken, session: { tokenHash: hash, csrfToken, expiresAt } };
}

async function listMemberships(
  database: AuthDatabase | AuthTransaction,
  userId: string,
): Promise<SiteMembershipSummary[]> {
  return database
    .select({
      id: sites.id,
      name: sites.name,
      slug: sites.slug,
      role: siteMemberships.role,
    })
    .from(siteMemberships)
    .innerJoin(sites, eq(sites.id, siteMemberships.siteId))
    .where(eq(siteMemberships.userId, userId))
    .orderBy(asc(sites.name), asc(sites.id));
}

export function resolveSiteRequirement(
  memberships: SiteMembershipSummary[],
  selectedSiteId: string | null,
) {
  const activeSite =
    memberships.find((membership) => membership.id === selectedSiteId) ?? null;
  return {
    activeSite,
    membershipRequired: memberships.length === 0,
    selectionRequired: memberships.length > 1 && activeSite === null,
  } as const;
}

export function requireSiteRequestContext(
  session: AuthSession,
  correlationId = randomUUID(),
): SiteRequestContext {
  const requirement = resolveSiteRequirement(session.memberships, session.siteId);
  if (requirement.membershipRequired) {
    throw new AuthError(
      "Aucun site n’est attribué à ce compte.",
      403,
      "SITE_MEMBERSHIP_REQUIRED",
    );
  }
  if (!requirement.activeSite) {
    throw new AuthError(
      "Sélectionnez un site avant de poursuivre.",
      409,
      "SITE_SELECTION_REQUIRED",
    );
  }
  return {
    siteId: requirement.activeSite.id,
    userId: session.userId,
    role: requirement.activeSite.role,
    correlationId,
  };
}

export async function beginGoogleLogin() {
  const config = requiredConfig();
  const state = randomToken();
  const nonce = randomToken();
  const codeVerifier = randomToken();
  const db = getDatabase();
  await db.delete(consoleAuthTransactions).where(lt(consoleAuthTransactions.expiresAt, new Date()));
  await db.insert(consoleAuthTransactions).values({ stateHash: tokenHash(state), nonce, codeVerifier, expiresAt: new Date(Date.now() + AUTH_TRANSACTION_TTL_MS) });
  const authorization = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorization.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri, response_type: "code", scope: "openid email profile", state, nonce, code_challenge: pkceChallenge(codeVerifier), code_challenge_method: "S256", prompt: "select_account" }).toString();
  return { authorizationUrl: authorization.toString(), stateCookie: cookie(OIDC_STATE_COOKIE, state, { httpOnly: true, sameSite: "Lax", maxAge: AUTH_TRANSACTION_TTL_MS / 1000 }) };
}

function base64UrlJson<T>(value: string): T {
  try { return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T; } catch { throw new AuthError("Le jeton Google est invalide.", 401, "GOOGLE_TOKEN_INVALID"); }
}

export async function verifyGoogleIdToken(idToken: string, nonce: string, clientId: string): Promise<GoogleClaims> {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new AuthError("Le jeton Google est invalide.", 401, "GOOGLE_TOKEN_INVALID");
  const [encodedHeader, encodedClaims, encodedSignature] = parts as [string, string, string];
  const header = base64UrlJson<{ alg?: string; kid?: string }>(encodedHeader);
  const claims = base64UrlJson<GoogleClaims>(encodedClaims);
  if (header.alg !== "RS256" || !header.kid) throw new AuthError("Le jeton Google utilise un algorithme non pris en charge.", 401, "GOOGLE_TOKEN_INVALID");
  const response = await fetch(GOOGLE_JWKS_ENDPOINT, { headers: { accept: "application/json" } });
  if (!response.ok) throw new AuthError("Les clés Google sont momentanément indisponibles.", 502, "GOOGLE_KEYS_UNAVAILABLE");
  const keys = (await response.json() as { keys?: Jwk[] }).keys ?? [];
  const key = keys.find((candidate) => candidate.kid === header.kid && candidate.kty === "RSA");
  if (!key) throw new AuthError("Le jeton Google est invalide.", 401, "GOOGLE_TOKEN_INVALID");
  let publicKey: CryptoKey;
  try { publicKey = await crypto.subtle.importKey("jwk", key, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]); } catch { throw new AuthError("Le jeton Google est invalide.", 401, "GOOGLE_TOKEN_INVALID"); }
  const validSignature = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", publicKey, Buffer.from(encodedSignature, "base64url"), new TextEncoder().encode(`${encodedHeader}.${encodedClaims}`));
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!validSignature || !claims.sub || !claims.email || claims.email_verified !== true || !audience.includes(clientId) || !GOOGLE_ISSUERS.has(claims.iss) || claims.exp * 1000 <= Date.now() || claims.nonce !== nonce) {
    throw new AuthError("Le jeton Google est invalide.", 401, "GOOGLE_TOKEN_INVALID");
  }
  return claims;
}

export async function completeGoogleLogin(request: Request, code: string, state: string) {
  const cookieState = readCookie(request, OIDC_STATE_COOKIE);
  if (!cookieState || cookieState !== state) throw new AuthError("La session de connexion a expiré. Réessayez.", 401, "OIDC_STATE_INVALID");
  const db = getDatabase();
  const transaction = await db.query.consoleAuthTransactions.findFirst({ where: and(eq(consoleAuthTransactions.stateHash, tokenHash(state)), gt(consoleAuthTransactions.expiresAt, new Date())) });
  await db.delete(consoleAuthTransactions).where(eq(consoleAuthTransactions.stateHash, tokenHash(state)));
  if (!transaction) throw new AuthError("La session de connexion a expiré. Réessayez.", 401, "OIDC_STATE_INVALID");
  const config = requiredConfig();
  const tokenResponse = await fetch(GOOGLE_TOKEN_ENDPOINT, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: config.redirectUri, code_verifier: transaction.codeVerifier, grant_type: "authorization_code" }) });
  if (!tokenResponse.ok) throw new AuthError("Google a refusé le code de connexion.", 401, "GOOGLE_CODE_REJECTED");
  const payload = await tokenResponse.json() as { id_token?: string };
  if (!payload.id_token) throw new AuthError("Google n'a pas renvoyé de jeton d'identité.", 502, "GOOGLE_TOKEN_MISSING");
  const claims = await verifyGoogleIdToken(payload.id_token, transaction.nonce, config.clientId);
  const email = claims.email.trim().toLowerCase();
  if (!config.emails.has(email)) throw new AuthError("Ce compte Google n'est pas autorisé à accéder à la Console.", 403, "GOOGLE_EMAIL_FORBIDDEN");
  const userId = `google:${claims.sub}`;
  const [insertedUser] = await db
    .insert(consoleUsers)
    .values({
      id: userId,
      email,
      googleSubject: claims.sub,
      displayName: claims.name?.trim() || null,
    })
    .onConflictDoNothing()
    .returning({ id: consoleUsers.id });
  if (!insertedUser) {
    await db
      .update(consoleUsers)
      .set({
        email,
        displayName: claims.name?.trim() || null,
        updatedAt: new Date(),
      })
      .where(eq(consoleUsers.id, userId));
  }

  const created = await db.transaction(async (tx) => {

    let memberships = await listMemberships(tx, userId);
    if (memberships.length === 0 && insertedUser) {
      // Le tout premier compte d'une installation vide peut administrer son
      // unique site. Le verrou sérialise deux callbacks OAuth concurrents : le
      // second observera alors un ledger memberships non vide et sera refusé.
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext('hermes-console-site-bootstrap'))`,
      );
      memberships = await listMemberships(tx, userId);
      if (memberships.length === 0) {
        const [{ value: membershipCount }] = await tx
          .select({ value: count() })
          .from(siteMemberships);
        if (membershipCount !== 0) {
          throw new AuthError(
            "Aucun site n’est attribué à ce compte.",
            403,
            "SITE_MEMBERSHIP_REQUIRED",
          );
        }
        const availableSites = await tx
          .select({ id: sites.id })
          .from(sites)
          .orderBy(asc(sites.id))
          .limit(2);
        if (availableSites.length !== 1) {
          throw new AuthError(
            "Le site initial ne peut pas être déterminé sans ambiguïté.",
            409,
            "SITE_BOOTSTRAP_AMBIGUOUS",
          );
        }
        await tx.insert(siteMemberships).values({
          userId,
          siteId: availableSites[0]!.id,
          role: "admin",
        });
        memberships = await listMemberships(tx, userId);
      }
    }
    if (memberships.length === 0) {
      throw new AuthError(
        "Aucun site n’est attribué à ce compte.",
        403,
        "SITE_MEMBERSHIP_REQUIRED",
      );
    }
    return createSession(
      userId,
      memberships.length === 1 ? memberships[0]!.id : null,
      tx,
    );
  });
  return { ...created, user: { email, name: claims.name?.trim() || null }, appOrigin: config.appOrigin };
}

export async function getSession(request: Request): Promise<AuthSession | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const db = getDatabase();
  const session = await db.query.consoleSessions.findFirst({ where: and(eq(consoleSessions.tokenHash, tokenHash(token)), gt(consoleSessions.expiresAt, new Date())) });
  if (!session) return null;
  const user = await db.query.consoleUsers.findFirst({ where: eq(consoleUsers.id, session.userId) });
  if (!user) return null;
  const allowed = await keepSessionIfEmailAllowed(user.email, () =>
    db.delete(consoleSessions).where(eq(consoleSessions.tokenHash, session.tokenHash)),
  );
  if (!allowed) return null;
  const memberships = await listMemberships(db, user.id);
  const requirement = resolveSiteRequirement(memberships, session.siteId);
  return {
    tokenHash: session.tokenHash,
    userId: user.id,
    csrfToken: session.csrfToken,
    expiresAt: session.expiresAt,
    email: user.email,
    name: user.displayName,
    siteId: requirement.activeSite?.id ?? null,
    role: requirement.activeSite?.role ?? null,
    memberships,
    aiDisclosureVersion: user.aiDisclosureVersion,
    aiDisclosureAcceptedAt: user.aiDisclosureAcceptedAt,
  };
}

export async function selectSessionSite(request: Request, siteId: string) {
  const session = await requireSession(request);
  const membership = session.memberships.find((candidate) => candidate.id === siteId);
  if (!membership) {
    throw new AuthError(
      "Aucun site correspondant n’est attribué à ce compte.",
      403,
      "SITE_MEMBERSHIP_REQUIRED",
    );
  }
  const [updated] = await getDatabase()
    .update(consoleSessions)
    .set({ siteId, lastSeenAt: new Date() })
    .where(
      and(
        eq(consoleSessions.tokenHash, session.tokenHash),
        sql`EXISTS (
          SELECT 1 FROM ${siteMemberships}
          WHERE ${siteMemberships.userId} = ${session.userId}
            AND ${siteMemberships.siteId} = ${siteId}
        )`,
      ),
    )
    .returning({ tokenHash: consoleSessions.tokenHash });
  if (!updated) {
    throw new AuthError(
      "Aucun site correspondant n’est attribué à ce compte.",
      403,
      "SITE_MEMBERSHIP_REQUIRED",
    );
  }
  const refreshed = await getSession(request);
  const activeSite = refreshed
    ? resolveSiteRequirement(refreshed.memberships, refreshed.siteId).activeSite
    : null;
  if (!activeSite) {
    throw new AuthError(
      "La sélection du site n’a pas pu être confirmée.",
      503,
      "AUTH_UNAVAILABLE",
    );
  }
  return activeSite;
}

export async function requireSession(request: Request): Promise<AuthSession> {
  const session = await getSession(request);
  if (!session) {
    throw new AuthError("Authentification requise.", 401, "AUTH_REQUIRED");
  }
  return session;
}

export async function deleteSession(request: Request) {
  const token = readCookie(request, SESSION_COOKIE);
  if (token) await getDatabase().delete(consoleSessions).where(eq(consoleSessions.tokenHash, tokenHash(token)));
}

export async function setupRequired() { return false; }
export function sessionHeaders(rawToken: string, session: Pick<AuthSession, "expiresAt" | "csrfToken">) {
  const seconds = Math.max(0, Math.floor((session.expiresAt.getTime() - Date.now()) / 1000));
  return new Headers([["set-cookie", cookie(SESSION_COOKIE, rawToken, { httpOnly: true, maxAge: seconds })], ["set-cookie", cookie("hc_csrf", session.csrfToken, { maxAge: seconds })]]);
}
export function clearSessionHeaders() { return new Headers([["set-cookie", cookie(SESSION_COOKIE, "", { httpOnly: true, maxAge: 0 })], ["set-cookie", cookie("hc_csrf", "", { maxAge: 0 })], ["set-cookie", cookie(OIDC_STATE_COOKIE, "", { httpOnly: true, sameSite: "Lax", maxAge: 0 })]]); }
export function assertCsrf(request: Request, session: AuthSession) { if (request.headers.get("x-csrf-token") !== session.csrfToken) throw new AuthError("Jeton CSRF absent ou invalide.", 403, "CSRF_REJECTED"); }
export function oidcStateClearingHeader() { return cookie(OIDC_STATE_COOKIE, "", { httpOnly: true, sameSite: "Lax", maxAge: 0 }); }
