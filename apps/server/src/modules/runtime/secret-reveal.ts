import {
  createHmac,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { getDatabase } from "@/db/client";
import { runtimeSecretRevealChallenges } from "@/db/schema";
import { appendAuditEntry } from "@/modules/audit/service";
import {
  getRuntimeConfigurationVersion,
  readRuntimeSecretForReveal,
} from "./config";
import { HermesRuntimeError } from "./hermes-adapter";
import { maskEmail, sendRuntimeOtpEmail } from "./otp-mailer";
import type { AuthSession, SiteRequestContext } from "@/modules/auth/service";

export const RUNTIME_SECRET_NAME = "API_SERVER_KEY" as const;
const CHALLENGE_TTL_MS = 5 * 60_000;
const REVEAL_TTL_MS = 60_000;
const RESEND_COOLDOWN_MS = 60_000;
const MAX_ATTEMPTS = 5;

type RevealActor = Pick<AuthSession, "userId" | "tokenHash" | "email">;
type RevealAuditState = Record<string, string | number | boolean | null>;

export type RuntimeSecretRevealChallenge = {
  challengeId: string;
  maskedRecipient: string;
  expiresAt: string;
  retryAfter: string;
};

export function createRuntimeOtpDigest(challengeId: string, code: string) {
  const key = process.env.APP_ENCRYPTION_KEY?.trim();
  if (!key) {
    throw new HermesRuntimeError(
      "APP_ENCRYPTION_KEY manquant : impossible de créer un challenge OTP sûr.",
      503,
      "APP_ENCRYPTION_KEY_MISSING",
    );
  }
  return createHmac("sha256", key)
    .update("hermes-console:runtime-secret-reveal:v1\0")
    .update(challengeId)
    .update("\0")
    .update(code)
    .digest("hex");
}

export function isValidOtp(code: string) {
  return /^\d{6}$/.test(code);
}

export function matchesOtpDigest(expected: string, candidate: string) {
  const left = Buffer.from(expected, "hex");
  const right = Buffer.from(candidate, "hex");
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

async function appendRevealAudit(input: {
  actor: RevealActor;
  siteContext: SiteRequestContext;
  action: string;
  decision: "allowed" | "denied";
  reasonCode: string;
  runtimeVersion: string;
  afterState: RevealAuditState;
}) {
  await appendAuditEntry({
    eventId: randomUUID(),
    actorSiteId: input.siteContext.siteId,
    targetSiteId: input.siteContext.siteId,
    actorUserId: input.siteContext.userId,
    actorRole: input.siteContext.role,
    actorOrganizationId: input.siteContext.actorOrganizationId,
    clientOrganizationId: input.siteContext.clientOrganizationId,
    mandateId: input.siteContext.mandateId,
    action: input.action,
    resourceType: "runtime_config",
    resourceId: "default",
    decision: input.decision,
    reasonCode: input.reasonCode,
    beforeState: { secretName: RUNTIME_SECRET_NAME, runtimeVersion: input.runtimeVersion },
    afterState: input.afterState,
    correlationId: input.siteContext.correlationId,
    occurredAt: new Date(),
  });
}

export async function createRuntimeSecretRevealChallenge(input: {
  actor: RevealActor;
  siteContext: SiteRequestContext;
}): Promise<RuntimeSecretRevealChallenge> {
  const runtimeVersion = await getRuntimeConfigurationVersion();
  if (!runtimeVersion) {
    throw new HermesRuntimeError(
      "Configurez d’abord un runtime Hermes avant de demander sa révélation.",
      409,
      "RUNTIME_CONFIGURATION_REQUIRED",
    );
  }

  const now = new Date();
  const db = getDatabase();
  const code = String(randomInt(100_000, 1_000_000));
  const challengeId: string = randomUUID();
  const expiresAt = new Date(now.getTime() + CHALLENGE_TTL_MS);
  const retryAfter = new Date(now.getTime() + RESEND_COOLDOWN_MS);
  const digest = createRuntimeOtpDigest(challengeId, code);

  let persistedId = challengeId;
  await db.transaction(async (tx) => {
    const [active] = await tx
      .select()
      .from(runtimeSecretRevealChallenges)
      .where(
        and(
          eq(runtimeSecretRevealChallenges.runtimeId, "default"),
          eq(runtimeSecretRevealChallenges.userId, input.actor.userId),
          eq(runtimeSecretRevealChallenges.sessionHash, input.actor.tokenHash),
          isNull(runtimeSecretRevealChallenges.consumedAt),
          gt(runtimeSecretRevealChallenges.expiresAt, now),
        ),
      )
      .orderBy(desc(runtimeSecretRevealChallenges.createdAt))
      .limit(1)
      .for("update");

    if (active && now.getTime() - active.lastSentAt.getTime() < RESEND_COOLDOWN_MS) {
      const retryAt = new Date(active.lastSentAt.getTime() + RESEND_COOLDOWN_MS);
      throw new HermesRuntimeError(
        `Un nouveau code pourra être envoyé à ${retryAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}.`,
        429,
        "OTP_RESEND_RATE_LIMITED",
      );
    }

    if (active) {
      persistedId = active.id;
      await tx
        .update(runtimeSecretRevealChallenges)
        .set({
          runtimeVersion,
          otpDigest: createRuntimeOtpDigest(active.id, code),
          attempts: 0,
          expiresAt,
          lastSentAt: now,
          consumedAt: null,
        })
        .where(eq(runtimeSecretRevealChallenges.id, active.id));
      return;
    }

    await tx.insert(runtimeSecretRevealChallenges).values({
      id: challengeId,
      runtimeId: "default",
      userId: input.actor.userId,
      sessionHash: input.actor.tokenHash,
      secretName: RUNTIME_SECRET_NAME,
      runtimeVersion,
      otpDigest: digest,
      attempts: 0,
      expiresAt,
      lastSentAt: now,
      createdAt: now,
    });
  });

  try {
    await sendRuntimeOtpEmail(input.actor.email, code, process.env);
  } catch (error) {
    await db
      .update(runtimeSecretRevealChallenges)
      .set({ consumedAt: new Date() })
      .where(eq(runtimeSecretRevealChallenges.id, persistedId))
      .catch(() => undefined);
    throw error;
  }

  try {
    await appendAuditEntry({
      eventId: randomUUID(),
      actorSiteId: input.siteContext.siteId,
      targetSiteId: input.siteContext.siteId,
      actorUserId: input.siteContext.userId,
      actorRole: input.siteContext.role,
      actorOrganizationId: input.siteContext.actorOrganizationId,
      clientOrganizationId: input.siteContext.clientOrganizationId,
      mandateId: input.siteContext.mandateId,
      action: "runtime.secret_reveal.challenge",
      resourceType: "runtime_config",
      resourceId: "default",
      decision: "allowed",
      reasonCode: "OTP_SENT",
      beforeState: { secretName: RUNTIME_SECRET_NAME, runtimeVersion },
      afterState: { stage: "otp_sent", secretName: RUNTIME_SECRET_NAME },
      correlationId: input.siteContext.correlationId,
      occurredAt: now,
    });
  } catch {
    await db
      .update(runtimeSecretRevealChallenges)
      .set({ consumedAt: new Date() })
      .where(eq(runtimeSecretRevealChallenges.id, persistedId))
      .catch(() => undefined);
    throw new HermesRuntimeError(
      "La demande OTP n’a pas pu être inscrite dans le journal d’audit.",
      503,
      "AUDIT_UNAVAILABLE",
    );
  }

  return {
    challengeId: persistedId,
    maskedRecipient: maskEmail(input.actor.email),
    expiresAt: expiresAt.toISOString(),
    retryAfter: retryAfter.toISOString(),
  };
}

export async function verifyRuntimeSecretReveal(input: {
  actor: RevealActor;
  siteContext: SiteRequestContext;
  challengeId: string;
  code: string;
}) {
  if (!isValidOtp(input.code)) {
    throw new HermesRuntimeError("Le code OTP doit contenir 6 chiffres.", 400, "OTP_INVALID");
  }

  const now = new Date();
  const db = getDatabase();
  const result = await db.transaction(async (tx) => {
    const [challenge] = await tx
      .select()
      .from(runtimeSecretRevealChallenges)
      .where(
        and(
          eq(runtimeSecretRevealChallenges.id, input.challengeId),
          eq(runtimeSecretRevealChallenges.userId, input.actor.userId),
          eq(runtimeSecretRevealChallenges.sessionHash, input.actor.tokenHash),
        ),
      )
      .limit(1)
      .for("update");

    if (!challenge || challenge.consumedAt) {
      return { kind: "invalid" as const, code: "OTP_CHALLENGE_INVALID" };
    }
    if (challenge.expiresAt <= now) {
      await tx
        .update(runtimeSecretRevealChallenges)
        .set({ consumedAt: now })
        .where(eq(runtimeSecretRevealChallenges.id, challenge.id));
      return { kind: "invalid" as const, code: "OTP_EXPIRED" };
    }
    if (challenge.attempts >= MAX_ATTEMPTS) {
      await tx
        .update(runtimeSecretRevealChallenges)
        .set({ consumedAt: now })
        .where(eq(runtimeSecretRevealChallenges.id, challenge.id));
      return { kind: "invalid" as const, code: "OTP_ATTEMPTS_EXCEEDED" };
    }

    const valid = matchesOtpDigest(
      challenge.otpDigest,
      createRuntimeOtpDigest(challenge.id, input.code),
    );
    if (!valid) {
      const attempts = challenge.attempts + 1;
      await tx
        .update(runtimeSecretRevealChallenges)
        .set({ attempts, ...(attempts >= MAX_ATTEMPTS ? { consumedAt: now } : {}) })
        .where(eq(runtimeSecretRevealChallenges.id, challenge.id));
      return {
        kind: "invalid" as const,
        code: attempts >= MAX_ATTEMPTS ? "OTP_ATTEMPTS_EXCEEDED" : "OTP_INVALID",
      };
    }

    await tx
      .update(runtimeSecretRevealChallenges)
      .set({ consumedAt: now })
      .where(eq(runtimeSecretRevealChallenges.id, challenge.id));
    return { kind: "verified" as const, runtimeVersion: challenge.runtimeVersion };
  });

  if (result.kind !== "verified") {
    try {
      await appendRevealAudit({
        actor: input.actor,
        siteContext: input.siteContext,
        action: "runtime.secret_reveal.verify",
        decision: "denied",
        reasonCode: result.code,
        runtimeVersion: "unknown",
        afterState: { secretName: RUNTIME_SECRET_NAME, runtimeVersion: "unknown" },
      });
    } catch {
      throw new HermesRuntimeError(
        "Le refus du code OTP n’a pas pu être inscrit dans le journal d’audit.",
        503,
        "AUDIT_UNAVAILABLE",
      );
    }
    throw new HermesRuntimeError(
      result.code === "OTP_EXPIRED"
        ? "Ce code OTP a expiré. Demandez-en un nouveau."
        : result.code === "OTP_ATTEMPTS_EXCEEDED"
          ? "Trop de codes incorrects. Demandez un nouveau code OTP."
          : "Le code OTP est incorrect.",
      result.code === "OTP_ATTEMPTS_EXCEEDED" ? 429 : 400,
      result.code,
    );
  }

  const currentVersion = await getRuntimeConfigurationVersion();
  if (!currentVersion || currentVersion !== result.runtimeVersion) {
    throw new HermesRuntimeError(
      "La configuration runtime a changé. Demandez un nouveau code OTP.",
      409,
      "RUNTIME_CONFIGURATION_CHANGED",
    );
  }
  const secret = await readRuntimeSecretForReveal();

  await appendAuditEntry({
    eventId: randomUUID(),
    actorSiteId: input.siteContext.siteId,
    targetSiteId: input.siteContext.siteId,
    actorUserId: input.siteContext.userId,
    actorRole: input.siteContext.role,
    actorOrganizationId: input.siteContext.actorOrganizationId,
    clientOrganizationId: input.siteContext.clientOrganizationId,
    mandateId: input.siteContext.mandateId,
    action: "runtime.secret_reveal.verify",
    resourceType: "runtime_config",
    resourceId: "default",
    decision: "allowed",
    reasonCode: "OTP_VERIFIED",
    beforeState: { secretName: RUNTIME_SECRET_NAME, runtimeVersion: result.runtimeVersion },
    afterState: {
      stage: "secret_returned",
      secretName: RUNTIME_SECRET_NAME,
      variableName: secret.variableName,
      source: secret.source,
      secretLength: secret.token.length,
    },
    correlationId: input.siteContext.correlationId,
    occurredAt: now,
  });

  return {
    secret: secret.token,
    variableName: secret.variableName,
    source: secret.source,
    expiresAt: new Date(Date.now() + REVEAL_TTL_MS).toISOString(),
  };
}
