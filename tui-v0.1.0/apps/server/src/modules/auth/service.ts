import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, asc, count, eq, gt, inArray, isNull, lte, lt, or, sql } from "drizzle-orm";
import {
  consoleAuthTransactions,
  consoleSessions,
  consoleUsers,
  mspMandateAssignments,
  mspMandates,
  organizationMemberships,
  siteMemberships,
  sites,
  type SiteMembershipRole,
} from "@/db/schema";
import { getDatabase } from "@/db/client";
import { appendAuditEntry } from "@/modules/audit/service";
import { developmentLanOrigins } from "@/modules/api/origins";
import { describeError, log } from "@/observability/log";

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14;
const AUTH_TRANSACTION_TTL_MS = 1000 * 60 * 10;
const MAX_ACTIVE_DEVELOPMENT_SESSIONS = 8;
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
  /** Mandat sélectionné dans la session (revalidé à chaque requête). */
  selectedMandateId?: string | null;
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
  organizationId: string;
  clientOrganizationId: string;
};
export type SiteScope = { siteId: string };
export type SiteRequestContext = SiteScope & {
  userId: string;
  role: SiteMembershipRole;
  actorOrganizationId: string;
  clientOrganizationId: string;
  mandateId: string | null;
  mandateProjectId: string | null;
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
  email: string | null,
  configuredEmails = process.env.GOOGLE_ALLOWED_EMAILS ?? "",
) {
  if (!email) return false;
  const allowed = new Set(
    configuredEmails
      .split(",")
      .map((candidate) => candidate.trim().toLowerCase())
      .filter(Boolean),
  );
  return allowed.has(email.trim().toLowerCase());
}

export function hasConnectableSiteMembership(
  googleSubjects: Array<string | null>,
) {
  return googleSubjects.some(
    (subject) => typeof subject === "string" && !subject.startsWith("legacy:"),
  );
}

export type DevelopmentAuthBypassConfig = {
  email: string;
  appOrigin: string;
};

function isLoopbackHostname(hostname: string) {
  return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(
    hostname.trim().toLowerCase(),
  );
}

/**
 * Le bypass ne remplace jamais Google en production : il exige un opt-in
 * explicite, un serveur lié au loopback et une origine navigateur locale.
 *
 * Une seule brèche est ouverte, et elle se déclare à la main. Tester le SPA
 * mobile depuis un téléphone impose de servir la Console sur le réseau local,
 * or Google refuse les adresses IP privées comme URI de redirection : sans
 * cette exception, aucune session ne peut exister sur l'origine LAN, et
 * l'appareil ne voit qu'un écran de connexion suivi de 401. `CONSOLE_DEV_LAN_ORIGIN`
 * autorise donc les origines qu'elle nomme, et elles seules, à ouvrir une
 * session sans Google.
 *
 * Ce que cette exception coûte, en toutes lettres : tant que le serveur de
 * développement tourne avec `CONSOLE_DEV_AUTH_BYPASS=1`, n'importe quel
 * appareil du réseau local capable d'atteindre cette origine ouvre une session
 * du compte visé sans mot de passe. Les trois autres verrous tiennent toujours
 * (`NODE_ENV=development`, opt-in explicite, compte déjà autorisé par Google),
 * et la variable est ignorée en production.
 */
export function developmentAuthBypassConfig(
  env: Record<string, string | undefined> = process.env,
): DevelopmentAuthBypassConfig | null {
  if (env.CONSOLE_DEV_AUTH_BYPASS !== "1") return null;
  if (env.NODE_ENV !== "development") {
    throw new AuthError(
      "Le bypass d’authentification locale exige NODE_ENV=development.",
      503,
      "DEV_AUTH_BYPASS_UNSAFE",
    );
  }

  const serverHost = env.CONSOLE_SERVER_HOST?.trim() || "127.0.0.1";
  const rawOrigin = env.CONSOLE_APP_ORIGIN?.trim();
  const email = env.CONSOLE_DEV_AUTH_EMAIL?.trim().toLowerCase();
  let appOrigin: URL;
  try {
    appOrigin = new URL(rawOrigin ?? "");
  } catch {
    throw new AuthError(
      "Le bypass local exige une origine Console valide.",
      503,
      "DEV_AUTH_BYPASS_UNSAFE",
    );
  }

  // Déclarer une origine LAN, c'est accepter que le serveur écoute au-delà du
  // loopback : `0.0.0.0` n'a plus de raison d'être refusé, sinon l'exception
  // serait inatteignable. Sans déclaration, le verrou d'origine reste entier.
  const lanOrigins = developmentLanOrigins(env);
  const serverReachableFromLan = lanOrigins.length > 0;
  const localAppOrigin =
    isLoopbackHostname(appOrigin.hostname) && appOrigin.protocol === "http:";
  if (
    (!isLoopbackHostname(serverHost) && !serverReachableFromLan) ||
    (!localAppOrigin && !lanOrigins.includes(appOrigin.origin))
  ) {
    throw new AuthError(
      "Le bypass d’authentification exige un serveur et une origine locaux, ou une origine déclarée dans CONSOLE_DEV_LAN_ORIGIN.",
      503,
      "DEV_AUTH_BYPASS_UNSAFE",
    );
  }
  if (!email || !isGoogleEmailAllowed(email, env.GOOGLE_ALLOWED_EMAILS)) {
    throw new AuthError(
      "Le compte du bypass local doit être explicitement autorisé par Google.",
      503,
      "DEV_AUTH_BYPASS_UNSAFE",
    );
  }
  return { email, appOrigin: appOrigin.origin };
}

export function developmentAuthBypassAvailable() {
  return developmentAuthBypassConfig() !== null;
}

/**
 * Nombre de sessions les plus anciennes à révoquer pour laisser une place au bypass local.
 * Le bypass exige un serveur et une origine en loopback, donc ces sessions sont celles du
 * développeur : les faire tourner vaut mieux que verrouiller le compte pendant la durée du TTL.
 */
export function developmentSessionsToRevoke(
  activeSessions: number,
  maximum = MAX_ACTIVE_DEVELOPMENT_SESSIONS,
) {
  if (!Number.isSafeInteger(activeSessions) || activeSessions < 0) return 0;
  return Math.max(0, activeSessions - maximum + 1);
}

/** Une session existante ne doit pas survivre au retrait de son opérateur. */
export async function keepSessionIfEmailAllowed(
  email: string | null,
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
  mandateId: string | null = null,
) {
  const rawToken = randomToken();
  const csrfToken = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const hash = tokenHash(rawToken);
  await database.insert(consoleSessions).values({
    tokenHash: hash,
    userId,
    siteId,
    mandateId,
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
      organizationId: siteMemberships.organizationId,
      clientOrganizationId: sites.clientOrganizationId,
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

export async function requireSiteRequestContext(
  session: AuthSession,
  correlationId = randomUUID(),
): Promise<SiteRequestContext> {
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
  const activeSite = requirement.activeSite;
  if (activeSite.role !== "operator") {
    if (activeSite.organizationId !== activeSite.clientOrganizationId) {
      await denyAndRevokeOrganizationSession(
        session,
        activeSite,
        correlationId,
        "CLIENT_ORGANIZATION_REQUIRED",
      );
      throw new AuthError(
        "L’affiliation active ne correspond pas à l’organisation cliente.",
        403,
        "CLIENT_ORGANIZATION_REQUIRED",
      );
    }
    return {
      siteId: activeSite.id,
      userId: session.userId,
      role: activeSite.role,
      actorOrganizationId: activeSite.organizationId,
      clientOrganizationId: activeSite.clientOrganizationId,
      mandateId: null,
      mandateProjectId: null,
      correlationId,
    };
  }

  if (activeSite.organizationId === activeSite.clientOrganizationId) {
    await denyAndRevokeOrganizationSession(
      session,
      activeSite,
      correlationId,
      "MSP_ORGANIZATION_REQUIRED",
    );
    throw new AuthError(
      "Un opérateur doit agir pour une organisation MSP mandatée.",
      403,
      "MSP_ORGANIZATION_REQUIRED",
    );
  }
  const mandates = await findActiveAssignedMandates(
    session.userId,
    activeSite,
  );
  if (mandates.length === 0) {
    await denyAndRevokeOrganizationSession(
      session,
      activeSite,
      correlationId,
      "MSP_MANDATE_REQUIRED",
    );
    throw new AuthError(
      "Aucun mandat MSP actif n’autorise cet accès.",
      403,
      "MSP_MANDATE_REQUIRED",
    );
  }
  const selectedFromSession = session.selectedMandateId
    ? mandates.find((mandate) => mandate.id === session.selectedMandateId)
    : null;
  if (session.selectedMandateId && !selectedFromSession) {
    await getDatabase()
      .update(consoleSessions)
      .set({ mandateId: null, lastSeenAt: new Date() })
      .where(
        and(
          eq(consoleSessions.tokenHash, session.tokenHash),
          eq(consoleSessions.mandateId, session.selectedMandateId),
        ),
      );
    throw new AuthError(
      "Le mandat sélectionné n’est plus actif. Choisissez un nouveau mandat.",
      409,
      "MSP_MANDATE_SELECTION_REQUIRED",
    );
  }
  const siteWide = mandates.filter((mandate) => mandate.projectId === null);
  const selected = selectedFromSession ?? (siteWide.length === 1 && mandates.length === 1
    ? siteWide[0]
    : mandates.length === 1
      ? mandates[0]
      : null);
  if (!selected) {
    throw new AuthError(
      "Sélectionnez un mandat MSP avant de poursuivre.",
      409,
      "MSP_MANDATE_SELECTION_REQUIRED",
    );
  }
  return {
    siteId: requirement.activeSite.id,
    userId: session.userId,
    role: requirement.activeSite.role,
    actorOrganizationId: activeSite.organizationId,
    clientOrganizationId: activeSite.clientOrganizationId,
    mandateId: selected.id,
    mandateProjectId: selected.projectId,
    correlationId,
  };
}

export async function findActiveAssignedMandates(
  userId: string,
  membership: SiteMembershipSummary,
) {
  const now = new Date();
  return getDatabase()
    .select({
      id: mspMandates.id,
      projectId: mspMandates.projectId,
      operatorOrganizationId: mspMandates.operatorOrganizationId,
      startsAt: mspMandates.startsAt,
      expiresAt: mspMandates.expiresAt,
    })
    .from(mspMandates)
    .innerJoin(
      mspMandateAssignments,
      and(
        eq(mspMandateAssignments.mandateId, mspMandates.id),
        eq(mspMandateAssignments.userId, userId),
        eq(
          mspMandateAssignments.organizationId,
          membership.organizationId,
        ),
      ),
    )
    .where(
      and(
        eq(mspMandates.siteId, membership.id),
        eq(
          mspMandates.operatorOrganizationId,
          membership.organizationId,
        ),
        eq(
          mspMandates.clientOrganizationId,
          membership.clientOrganizationId,
        ),
        lte(mspMandates.startsAt, now),
        isNull(mspMandates.revokedAt),
        or(isNull(mspMandates.expiresAt), gt(mspMandates.expiresAt, now)),
        isNull(mspMandateAssignments.revokedAt),
        or(
          isNull(mspMandateAssignments.expiresAt),
          gt(mspMandateAssignments.expiresAt, now),
        ),
      ),
    )
    .orderBy(asc(mspMandates.id));
}

async function revokeInvalidOrganizationSession(session: AuthSession) {
  await getDatabase()
    .delete(consoleSessions)
    .where(eq(consoleSessions.tokenHash, session.tokenHash));
}

async function denyAndRevokeOrganizationSession(
  session: AuthSession,
  membership: SiteMembershipSummary,
  correlationId: string,
  reasonCode:
    | "CLIENT_ORGANIZATION_REQUIRED"
    | "MSP_ORGANIZATION_REQUIRED"
    | "MSP_MANDATE_REQUIRED",
) {
  // La session dérivée est invalidée avant toute réponse et même si le ledger
  // devient indisponible. La tentative, elle, reste fail-closed si son audit
  // ne peut pas être persisté.
  await revokeInvalidOrganizationSession(session);
  try {
    await appendAuditEntry({
      eventId: randomUUID(),
      actorSiteId: membership.id,
      targetSiteId: membership.id,
      actorUserId: session.userId,
      actorRole: membership.role,
      actorOrganizationId: membership.organizationId,
      clientOrganizationId: membership.clientOrganizationId,
      mandateId: null,
      action: "site.access",
      resourceType: "site_authorization",
      resourceId: membership.id,
      decision: "denied",
      reasonCode,
      beforeState: {
        role: membership.role,
        actorOrganizationId: membership.organizationId,
        clientOrganizationId: membership.clientOrganizationId,
      },
      afterState: {
        role: membership.role,
        actorOrganizationId: membership.organizationId,
        clientOrganizationId: membership.clientOrganizationId,
      },
      correlationId,
      occurredAt: new Date(),
    });
  } catch (error) {
    log.error("MSP/client denial audit failed", {
      siteId: membership.id,
      userId: session.userId,
      reasonCode,
      correlationId,
      ...describeError(error),
    });
    throw new AuthError(
      "Le refus d’accès n’a pas pu être inscrit dans le journal d’audit.",
      503,
      "AUDIT_UNAVAILABLE",
    );
  }
}

/**
 * Revalide un contexte long-lived (SSE/polling) sans faire confiance au
 * snapshot de session. Une révocation de membership, mandat ou assignment
 * devient donc visible avant le prochain événement émis.
 */
export async function isSiteRequestContextActive(
  context: SiteRequestContext,
): Promise<boolean> {
  const [membership] = await getDatabase()
    .select({
      role: siteMemberships.role,
      organizationId: siteMemberships.organizationId,
      clientOrganizationId: sites.clientOrganizationId,
    })
    .from(siteMemberships)
    .innerJoin(sites, eq(sites.id, siteMemberships.siteId))
    .where(
      and(
        eq(siteMemberships.userId, context.userId),
        eq(siteMemberships.siteId, context.siteId),
        eq(siteMemberships.organizationId, context.actorOrganizationId),
        eq(siteMemberships.role, context.role),
      ),
    )
    .limit(1);
  if (
    !membership ||
    membership.clientOrganizationId !== context.clientOrganizationId
  ) return false;
  if (context.role !== "operator") {
    return context.mandateId === null &&
      membership.organizationId === membership.clientOrganizationId;
  }
  if (!context.mandateId) return false;
  const mandates = await findActiveAssignedMandates(context.userId, {
    id: context.siteId,
    name: "",
    slug: "",
    role: context.role,
    organizationId: context.actorOrganizationId,
    clientOrganizationId: context.clientOrganizationId,
  });
  return mandates.some(
    (mandate) =>
      mandate.id === context.mandateId &&
      mandate.projectId === context.mandateProjectId,
  );
}

/**
 * Revalide l'autorisation snapshotée sur une mission non terminale.
 * Les missions historiques sans mandat restent compatibles ; toute mission
 * MSP snapshotée doit encore avoir son mandat et son affectation actifs.
 */
export async function isPersistedRunAuthorizationActive(run: {
  siteId: string;
  authorUserId: string;
  projectId: string | null;
  mandateId: string | null;
  operatorOrganizationId: string | null;
  clientOrganizationId: string | null;
}) {
  if (!run.mandateId) return true;

  const now = new Date();
  const [authorization] = await getDatabase()
    .select({
      projectId: mspMandates.projectId,
      operatorOrganizationId: mspMandates.operatorOrganizationId,
      clientOrganizationId: mspMandates.clientOrganizationId,
    })
    .from(mspMandates)
    .innerJoin(
      mspMandateAssignments,
      and(
        eq(mspMandateAssignments.mandateId, mspMandates.id),
        eq(mspMandateAssignments.userId, run.authorUserId),
      ),
    )
    .where(
      and(
        eq(mspMandates.id, run.mandateId),
        eq(mspMandates.siteId, run.siteId),
        lte(mspMandates.startsAt, now),
        isNull(mspMandates.revokedAt),
        or(isNull(mspMandates.expiresAt), gt(mspMandates.expiresAt, now)),
        isNull(mspMandateAssignments.revokedAt),
        or(
          isNull(mspMandateAssignments.expiresAt),
          gt(mspMandateAssignments.expiresAt, now),
        ),
      ),
    )
    .limit(1);

  return Boolean(
    authorization &&
      (authorization.projectId === null || authorization.projectId === run.projectId) &&
      authorization.operatorOrganizationId === run.operatorOrganizationId &&
      authorization.clientOrganizationId === run.clientOrganizationId,
  );
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
    if (memberships.length === 0) {
      // Le premier compte Google connectable peut administrer l'unique site,
      // même si une identité password historique non connectable possède
      // encore le membership de migration. Le verrou sérialise deux callbacks
      // OAuth concurrents : le second verra alors un membership Google actif.
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext('hermes-console-site-bootstrap'))`,
      );
      memberships = await listMemberships(tx, userId);
      if (memberships.length === 0) {
        const existingMemberships = await tx
          .select({ googleSubject: consoleUsers.googleSubject })
          .from(siteMemberships)
          .innerJoin(
            consoleUsers,
            eq(consoleUsers.id, siteMemberships.userId),
          );
        if (
          hasConnectableSiteMembership(
            existingMemberships.map(({ googleSubject }) => googleSubject),
          )
        ) {
          throw new AuthError(
            "Aucun site n’est attribué à ce compte.",
            403,
            "SITE_MEMBERSHIP_REQUIRED",
          );
        }
        const availableSites = await tx
          .select({ id: sites.id, organizationId: sites.clientOrganizationId })
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
        await tx.insert(organizationMemberships).values({
          userId,
          organizationId: availableSites[0]!.organizationId,
        }).onConflictDoNothing();
        await tx.insert(siteMemberships).values({
          userId,
          siteId: availableSites[0]!.id,
          organizationId: availableSites[0]!.organizationId,
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

/**
 * Crée une vraie session produit pour un compte Google déjà provisionné.
 * Aucun utilisateur ni membership n'est créé par ce raccourci local.
 */
export async function completeDevelopmentLogin() {
  const config = developmentAuthBypassConfig();
  if (!config) {
    throw new AuthError(
      "Le bypass d’authentification locale n’est pas activé.",
      404,
      "DEV_AUTH_BYPASS_DISABLED",
    );
  }
  const db = getDatabase();
  const user = await db.query.consoleUsers.findFirst({
    where: eq(consoleUsers.email, config.email),
  });
  if (!user?.googleSubject || user.googleSubject.startsWith("legacy:")) {
    throw new AuthError(
      "Le compte Google local doit avoir été provisionné avant d’utiliser le bypass.",
      409,
      "DEV_AUTH_USER_NOT_PROVISIONED",
    );
  }
  const memberships = await listMemberships(db, user.id);
  if (memberships.length === 0) {
    throw new AuthError(
      "Aucun site n’est attribué au compte du bypass local.",
      403,
      "SITE_MEMBERSHIP_REQUIRED",
    );
  }
  const created = await db.transaction(async (tx) => {
    // Sérialise le comptage sans révoquer les sessions OAuth existantes.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`hermes-console-dev-login:${user.id}`}))`,
    );
    const now = new Date();
    await tx
      .delete(consoleSessions)
      .where(
        and(
          eq(consoleSessions.userId, user.id),
          lte(consoleSessions.expiresAt, now),
        ),
      );
    const [active] = await tx
      .select({ value: count() })
      .from(consoleSessions)
      .where(
        and(
          eq(consoleSessions.userId, user.id),
          gt(consoleSessions.expiresAt, now),
        ),
      );
    const activeCount = Number(active?.value ?? 0);
    const toRevoke = developmentSessionsToRevoke(activeCount);
    if (toRevoke > 0) {
      const stale = await tx
        .select({ tokenHash: consoleSessions.tokenHash })
        .from(consoleSessions)
        .where(
          and(
            eq(consoleSessions.userId, user.id),
            gt(consoleSessions.expiresAt, now),
          ),
        )
        .orderBy(asc(consoleSessions.lastSeenAt), asc(consoleSessions.createdAt))
        .limit(toRevoke);
      if (stale.length > 0) {
        await tx.delete(consoleSessions).where(
          inArray(
            consoleSessions.tokenHash,
            stale.map((row) => row.tokenHash),
          ),
        );
      }
      log.warn("Bypass local : rotation des sessions les plus anciennes", {
        userId: user.id,
        activeCount,
        revoked: stale.length,
        maximum: MAX_ACTIVE_DEVELOPMENT_SESSIONS,
      });
    }
    return createSession(
      user.id,
      memberships.length === 1 ? memberships[0]!.id : null,
      tx,
    );
  });
  return {
    ...created,
    user: { email: user.email, name: user.displayName },
    appOrigin: config.appOrigin,
  };
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
    selectedMandateId: session.mandateId ?? null,
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
    .set({ siteId, mandateId: null, lastSeenAt: new Date() })
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
  try {
    await requireSiteRequestContext(refreshed!);
  } catch (error) {
    // A site can be selected before a user chooses among several active
    // mandates. Other authorization failures remain fail-closed.
    if (!(error instanceof AuthError) || error.code !== "MSP_MANDATE_SELECTION_REQUIRED") {
      throw error;
    }
  }
  return activeSite;
}

export async function selectSessionMandate(request: Request, mandateId: string) {
  const session = await requireSession(request);
  const requirement = resolveSiteRequirement(session.memberships, session.siteId);
  const activeSite = requirement.activeSite;
  if (!activeSite || activeSite.role !== "operator") {
    throw new AuthError(
      "Un mandat ne peut être sélectionné que pour une affiliation opérateur.",
      409,
      "MSP_MANDATE_SELECTION_INVALID",
    );
  }
  const mandates = await findActiveAssignedMandates(session.userId, activeSite);
  const selected = mandates.find((mandate) => mandate.id === mandateId);
  if (!selected) {
    await auditInvalidMandateSelection(session, activeSite, mandateId);
    throw new AuthError(
      "Ce mandat n’est pas actif ou n’est pas affecté à ce compte.",
      403,
      "MSP_MANDATE_NOT_ASSIGNED",
    );
  }
  const [updated] = await getDatabase()
    .update(consoleSessions)
    .set({ mandateId: selected.id, lastSeenAt: new Date() })
    .where(
      and(
        eq(consoleSessions.tokenHash, session.tokenHash),
        eq(consoleSessions.siteId, activeSite.id),
      ),
    )
    .returning({ tokenHash: consoleSessions.tokenHash });
  if (!updated) {
    throw new AuthError(
      "La sélection du mandat n’a pas pu être enregistrée.",
      503,
      "AUTH_UNAVAILABLE",
    );
  }
  const refreshed = await getSession(request);
  if (!refreshed) {
    throw new AuthError(
      "La session n’est plus disponible.",
      401,
      "AUTH_REQUIRED",
    );
  }
  const context = await requireSiteRequestContext(refreshed);
  return {
    id: context.mandateId,
    projectId: context.mandateProjectId,
  };
}

async function auditInvalidMandateSelection(
  session: AuthSession,
  activeSite: SiteMembershipSummary,
  mandateId: string,
) {
  try {
    await appendAuditEntry({
      eventId: randomUUID(),
      actorSiteId: activeSite.id,
      targetSiteId: activeSite.id,
      actorUserId: session.userId,
      actorRole: activeSite.role,
      actorOrganizationId: activeSite.organizationId,
      clientOrganizationId: activeSite.clientOrganizationId,
      mandateId: null,
      action: "site.access",
      resourceType: "msp_mandate",
      resourceId: mandateId,
      decision: "denied",
      // Le trigger du ledger autorise explicitement ce code pour un operator
      // sans mandat utilisable ; on ne crée pas une nouvelle raison hors
      // contrat de la migration 0022.
      reasonCode: "MSP_MANDATE_REQUIRED",
      beforeState: { mandateId: null },
      afterState: { mandateId: null },
      correlationId: randomUUID(),
      occurredAt: new Date(),
    });
  } catch (error) {
    log.error("MSP mandate selection denial audit failed", {
      siteId: activeSite.id,
      userId: session.userId,
      mandateId,
      ...describeError(error),
    });
    throw new AuthError(
      "Le refus du mandat n’a pas pu être inscrit dans le journal d’audit.",
      503,
      "AUDIT_UNAVAILABLE",
    );
  }
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
