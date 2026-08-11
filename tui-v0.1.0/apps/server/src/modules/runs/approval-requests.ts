import { randomUUID } from "node:crypto";
import { and, eq, gt, isNull, lt, or } from "drizzle-orm";
import { z } from "zod";
import { getDatabase } from "@/db/client";
import { approvalRequests, runs } from "@/db/schema";
import type { SiteScope } from "@/modules/auth/service";

export const APPROVAL_REQUEST_DEFAULT_TTL_SECONDS = 300;
export const APPROVAL_REQUEST_MAX_TTL_SECONDS = 3_600;

export const approvalOutcomeSchema = z.enum(["once", "deny"]);
export type ApprovalOutcome = z.infer<typeof approvalOutcomeSchema>;

export const approvalRequestInputSchema = z
  .object({
    runId: z.string().trim().min(1).max(200),
    hermesRunId: z.string().trim().min(1).max(200),
    approvalRequestId: z.string().trim().min(1).max(200),
    ttlSeconds: z.number().int().min(1).max(APPROVAL_REQUEST_MAX_TTL_SECONDS).optional(),
  })
  .strict();
export type ApprovalRequestInput = z.infer<typeof approvalRequestInputSchema>;

export type ApprovalRequestState = "pending" | "claimed" | "resolved" | "expired";

export type PersistedApprovalRequest = {
  id: string;
  siteId: string;
  runId: string;
  hermesRunId: string;
  approvalRequestId: string;
  nonce: string;
  claimState: ApprovalRequestState;
  outcome: ApprovalOutcome | null;
  expiresAt: Date;
  claimedAt: Date | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ApprovalRequestScope = SiteScope & {
  runId: string;
  hermesRunId: string;
  approvalRequestId: string;
};

type ApprovalDatabase = ReturnType<typeof getDatabase>;
type ApprovalTransaction = Parameters<Parameters<ApprovalDatabase["transaction"]>[0]>[0];

export type ApprovalRequestDependencies = {
  database?: ApprovalDatabase;
  now?: () => Date;
};

export type ApprovalRequestErrorCode =
  | "APPROVAL_REQUEST_NOT_FOUND"
  | "APPROVAL_REQUEST_SCOPE_MISMATCH"
  | "APPROVAL_REQUEST_DUPLICATE"
  | "APPROVAL_REQUEST_CLAIM_UNAVAILABLE"
  | "APPROVAL_REQUEST_EXPIRED"
  | "APPROVAL_REQUEST_OUTCOME_CONFLICT"
  | "APPROVAL_REQUEST_DATABASE_FAILED";

export class ApprovalRequestError extends Error {
  constructor(
    readonly code: ApprovalRequestErrorCode,
    message: string,
    readonly status: 404 | 409 | 503 = 409,
  ) {
    super(`${code}: ${message}`);
    this.name = "ApprovalRequestError";
  }
}

export function calculateApprovalExpiry(
  now: Date,
  ttlSeconds = APPROVAL_REQUEST_DEFAULT_TTL_SECONDS,
) {
  if (
    !Number.isSafeInteger(ttlSeconds) ||
    ttlSeconds < 1 ||
    ttlSeconds > APPROVAL_REQUEST_MAX_TTL_SECONDS
  ) {
    throw new ApprovalRequestError(
      "APPROVAL_REQUEST_DATABASE_FAILED",
      "La durée de validité de la demande est invalide.",
      503,
    );
  }
  return new Date(now.getTime() + ttlSeconds * 1_000);
}

/** Compares every persisted identity field; siteId is never inferred from a caller payload. */
export function assertApprovalScope(
  row: Pick<
    PersistedApprovalRequest,
    "siteId" | "runId" | "hermesRunId" | "approvalRequestId"
  >,
  expected: Pick<
    PersistedApprovalRequest,
    "siteId" | "runId" | "hermesRunId" | "approvalRequestId"
  >,
) {
  if (
    row.siteId !== expected.siteId ||
    row.runId !== expected.runId ||
    row.hermesRunId !== expected.hermesRunId ||
    row.approvalRequestId !== expected.approvalRequestId
  ) {
    throw new ApprovalRequestError(
      "APPROVAL_REQUEST_SCOPE_MISMATCH",
      "La demande d’autorisation ne correspond pas au périmètre demandé.",
      404,
    );
  }
}

export async function persistApprovalRequest(
  scope: SiteScope,
  rawInput: unknown,
  dependencies: ApprovalRequestDependencies = {},
): Promise<PersistedApprovalRequest> {
  const input = approvalRequestInputSchema.parse(rawInput);
  const now = (dependencies.now ?? (() => new Date()))();
  const expiresAt = calculateApprovalExpiry(now, input.ttlSeconds);
  const db = dependencies.database ?? getDatabase();

  try {
    return await db.transaction(async (tx) => {
      const [run] = await tx
        .select({
          id: runs.id,
          siteId: runs.siteId,
          hermesResponseId: runs.hermesResponseId,
        })
        .from(runs)
        .where(and(eq(runs.siteId, scope.siteId), eq(runs.id, input.runId)))
        .for("update");
      if (!run || run.hermesResponseId !== input.hermesRunId) {
        throw new ApprovalRequestError(
          "APPROVAL_REQUEST_SCOPE_MISMATCH",
          "La mission Hermes ne correspond pas au site et au run demandés.",
          404,
        );
      }

      try {
        const [created] = await tx
          .insert(approvalRequests)
          .values({
            id: randomUUID(),
            siteId: scope.siteId,
            runId: input.runId,
            hermesRunId: input.hermesRunId,
            approvalRequestId: input.approvalRequestId,
            nonce: randomUUID(),
            claimState: "pending",
            outcome: null,
            expiresAt,
            claimedAt: null,
            resolvedAt: null,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        if (!created) {
          throw new ApprovalRequestError(
            "APPROVAL_REQUEST_DATABASE_FAILED",
            "La demande d’autorisation n’a pas été persistée.",
            503,
          );
        }
        return mapApprovalRequest(created);
      } catch (error) {
        if (error instanceof ApprovalRequestError) throw error;
        if (isUniqueViolation(error)) {
          throw new ApprovalRequestError(
            "APPROVAL_REQUEST_DUPLICATE",
            "Cette demande d’autorisation existe déjà.",
            409,
          );
        }
        throw error;
      }
    });
  } catch (error) {
    if (error instanceof ApprovalRequestError) throw error;
    throw new ApprovalRequestError(
      "APPROVAL_REQUEST_DATABASE_FAILED",
      "La demande d’autorisation n’a pas pu être persistée.",
      503,
    );
  }
}

/** Atomic pending → claimed transition. The nonce and full scope are part of the CAS predicate. */
export async function claimApprovalRequest(
  scope: ApprovalRequestScope,
  nonce: string,
  dependencies: ApprovalRequestDependencies = {},
): Promise<PersistedApprovalRequest> {
  const now = (dependencies.now ?? (() => new Date()))();
  const db = dependencies.database ?? getDatabase();
  try {
    return await db.transaction(async (tx) => {
      const current = await loadApprovalRequest(tx, scope, nonce, true);
      if (!current) throw notFound();
      if (current.claimState === "resolved") throw claimUnavailable();
      if (current.claimState === "expired" || current.expiresAt <= now) {
        await expireLocked(tx, current.id, now);
        throw expired();
      }
      if (current.claimState !== "pending") throw claimUnavailable();

      const [claimed] = await tx
        .update(approvalRequests)
        .set({ claimState: "claimed", claimedAt: now, updatedAt: now })
        .where(
          and(
            eq(approvalRequests.id, current.id),
            eq(approvalRequests.siteId, scope.siteId),
            eq(approvalRequests.runId, scope.runId),
            eq(approvalRequests.hermesRunId, scope.hermesRunId),
            eq(approvalRequests.approvalRequestId, scope.approvalRequestId),
            eq(approvalRequests.nonce, nonce),
            eq(approvalRequests.claimState, "pending"),
            gt(approvalRequests.expiresAt, now),
          ),
        )
        .returning();
      if (!claimed) throw claimUnavailable();
      return mapApprovalRequest(claimed);
    });
  } catch (error) {
    if (error instanceof ApprovalRequestError) throw error;
    throw databaseFailed();
  }
}

/** Claims a request by its public scope; the private nonce is loaded under lock. */
export async function claimApprovalRequestForScope(
  scope: ApprovalRequestScope,
  dependencies: ApprovalRequestDependencies = {},
): Promise<PersistedApprovalRequest> {
  const now = (dependencies.now ?? (() => new Date()))();
  const db = dependencies.database ?? getDatabase();
  try {
    const claimed = await db.transaction(async (tx) => {
      const current = await loadApprovalRequestByScope(tx, scope, true);
      if (!current) throw notFound();
      if (current.claimState === "resolved") throw claimUnavailable();
      if (current.claimState === "expired" || current.expiresAt <= now) {
        await expireLocked(tx, current.id, now);
        return null;
      }
      if (current.claimState !== "pending") throw claimUnavailable();
      const [claimed] = await tx
        .update(approvalRequests)
        .set({ claimState: "claimed", claimedAt: now, updatedAt: now })
        .where(and(
          eq(approvalRequests.id, current.id),
          eq(approvalRequests.siteId, scope.siteId),
          eq(approvalRequests.runId, scope.runId),
          eq(approvalRequests.hermesRunId, scope.hermesRunId),
          eq(approvalRequests.approvalRequestId, scope.approvalRequestId),
          eq(approvalRequests.nonce, current.nonce),
          eq(approvalRequests.claimState, "pending"),
          gt(approvalRequests.expiresAt, now),
        ))
        .returning();
      if (!claimed) throw claimUnavailable();
      return mapApprovalRequest(claimed);
    });
    if (!claimed) throw expired();
    return claimed;
  } catch (error) {
    if (error instanceof ApprovalRequestError) throw error;
    throw databaseFailed();
  }
}

/** Atomic claimed → resolved transition. A nonce cannot be resolved twice. */
export async function resolveApprovalRequest(
  scope: ApprovalRequestScope,
  nonce: string,
  rawOutcome: unknown,
  dependencies: ApprovalRequestDependencies = {},
): Promise<PersistedApprovalRequest> {
  const outcome = approvalOutcomeSchema.parse(rawOutcome);
  const now = (dependencies.now ?? (() => new Date()))();
  const db = dependencies.database ?? getDatabase();
  try {
    return await db.transaction(async (tx) => {
      const current = await loadApprovalRequest(tx, scope, nonce, true);
      if (!current) throw notFound();
      if (current.claimState === "resolved") throw outcomeConflict();
      if (current.claimState === "expired" || current.expiresAt <= now) {
        await expireLocked(tx, current.id, now);
        throw expired();
      }
      if (current.claimState !== "claimed") throw outcomeConflict();

      const [resolved] = await tx
        .update(approvalRequests)
        .set({ claimState: "resolved", outcome, resolvedAt: now, updatedAt: now })
        .where(
          and(
            eq(approvalRequests.id, current.id),
            eq(approvalRequests.siteId, scope.siteId),
            eq(approvalRequests.runId, scope.runId),
            eq(approvalRequests.hermesRunId, scope.hermesRunId),
            eq(approvalRequests.approvalRequestId, scope.approvalRequestId),
            eq(approvalRequests.nonce, nonce),
            eq(approvalRequests.claimState, "claimed"),
            gt(approvalRequests.expiresAt, now),
          ),
        )
        .returning();
      if (!resolved) throw outcomeConflict();
      return mapApprovalRequest(resolved);
    });
  } catch (error) {
    if (error instanceof ApprovalRequestError) throw error;
    throw databaseFailed();
  }
}

/** Resolves a claimed request by public scope while retaining nonce CAS internally. */
export async function resolveApprovalRequestForScope(
  scope: ApprovalRequestScope,
  rawOutcome: unknown,
  dependencies: ApprovalRequestDependencies = {},
): Promise<PersistedApprovalRequest> {
  const outcome = approvalOutcomeSchema.parse(rawOutcome);
  const now = (dependencies.now ?? (() => new Date()))();
  const db = dependencies.database ?? getDatabase();
  try {
    const resolved = await db.transaction(async (tx) => {
      const current = await loadApprovalRequestByScope(tx, scope, true);
      if (!current) throw notFound();
      if (current.claimState === "resolved") throw outcomeConflict();
      if (current.claimState === "expired" || current.expiresAt <= now) {
        await expireLocked(tx, current.id, now);
        return null;
      }
      if (current.claimState !== "claimed") throw outcomeConflict();
      const [resolved] = await tx
        .update(approvalRequests)
        .set({ claimState: "resolved", outcome, resolvedAt: now, updatedAt: now })
        .where(and(
          eq(approvalRequests.id, current.id),
          eq(approvalRequests.siteId, scope.siteId),
          eq(approvalRequests.runId, scope.runId),
          eq(approvalRequests.hermesRunId, scope.hermesRunId),
          eq(approvalRequests.approvalRequestId, scope.approvalRequestId),
          eq(approvalRequests.nonce, current.nonce),
          eq(approvalRequests.claimState, "claimed"),
          gt(approvalRequests.expiresAt, now),
        ))
        .returning();
      if (!resolved) throw outcomeConflict();
      return mapApprovalRequest(resolved);
    });
    if (!resolved) throw expired();
    return resolved;
  } catch (error) {
    if (error instanceof ApprovalRequestError) throw error;
    throw databaseFailed();
  }
}

/** Releases a claim only when Hermes returned a definitive 4xx before any effect. */
export async function releaseApprovalRequestForScope(
  scope: ApprovalRequestScope,
  dependencies: ApprovalRequestDependencies = {},
): Promise<PersistedApprovalRequest> {
  const now = (dependencies.now ?? (() => new Date()))();
  const db = dependencies.database ?? getDatabase();
  try {
    return await db.transaction(async (tx) => {
      const current = await loadApprovalRequestByScope(tx, scope, true);
      if (!current) throw notFound();
      if (current.claimState !== "claimed") throw claimUnavailable();
      const [released] = await tx
        .update(approvalRequests)
        .set({ claimState: "pending", claimedAt: null, updatedAt: now })
        .where(and(
          eq(approvalRequests.id, current.id),
          eq(approvalRequests.nonce, current.nonce),
          eq(approvalRequests.claimState, "claimed"),
        ))
        .returning();
      if (!released) throw claimUnavailable();
      return mapApprovalRequest(released);
    });
  } catch (error) {
    if (error instanceof ApprovalRequestError) throw error;
    throw databaseFailed();
  }
}

/** Marks expired pending/claimed requests without resolving them. */
export async function expireApprovalRequests(
  dependencies: ApprovalRequestDependencies = {},
): Promise<number> {
  const now = (dependencies.now ?? (() => new Date()))();
  const db = dependencies.database ?? getDatabase();
  try {
    const expired = await db
      .update(approvalRequests)
      .set({ claimState: "expired", updatedAt: now })
      .where(
        and(
          lt(approvalRequests.expiresAt, now),
          or(
            eq(approvalRequests.claimState, "pending"),
            eq(approvalRequests.claimState, "claimed"),
          ),
        ),
      )
      .returning({ id: approvalRequests.id });
    return expired.length;
  } catch {
    throw databaseFailed();
  }
}

// Explicit aliases make the persisted nature of this local slice visible to callers.
export const createPersistedApprovalRequest = persistApprovalRequest;
export const claimPersistedApprovalRequest = claimApprovalRequest;
export const resolvePersistedApprovalRequest = resolveApprovalRequest;
export const claimPersistedApprovalRequestForScope = claimApprovalRequestForScope;
export const resolvePersistedApprovalRequestForScope = resolveApprovalRequestForScope;
export const releasePersistedApprovalRequestForScope = releaseApprovalRequestForScope;

async function loadApprovalRequest(
  tx: ApprovalTransaction,
  scope: ApprovalRequestScope,
  nonce: string,
  lock: boolean,
) {
  const query = tx
    .select()
    .from(approvalRequests)
    .where(
      and(
        eq(approvalRequests.siteId, scope.siteId),
        eq(approvalRequests.runId, scope.runId),
        eq(approvalRequests.hermesRunId, scope.hermesRunId),
        eq(approvalRequests.approvalRequestId, scope.approvalRequestId),
        eq(approvalRequests.nonce, nonce),
      ),
    );
  const rows = lock ? await query.for("update") : await query;
  const row = rows[0];
  return row ? mapApprovalRequest(row) : null;
}

async function loadApprovalRequestByScope(
  tx: ApprovalTransaction,
  scope: ApprovalRequestScope,
  lock: boolean,
) {
  const query = tx
    .select()
    .from(approvalRequests)
    .where(and(
      eq(approvalRequests.siteId, scope.siteId),
      eq(approvalRequests.runId, scope.runId),
      eq(approvalRequests.hermesRunId, scope.hermesRunId),
      eq(approvalRequests.approvalRequestId, scope.approvalRequestId),
    ));
  const rows = lock ? await query.for("update") : await query;
  const row = rows[0];
  return row ? mapApprovalRequest(row) : null;
}

async function expireLocked(tx: ApprovalTransaction, id: string, now: Date) {
  await tx
    .update(approvalRequests)
    .set({ claimState: "expired", updatedAt: now })
    .where(and(eq(approvalRequests.id, id), isNull(approvalRequests.resolvedAt)));
}

function mapApprovalRequest(row: typeof approvalRequests.$inferSelect): PersistedApprovalRequest {
  return {
    ...row,
    claimState: row.claimState as ApprovalRequestState,
    outcome: row.outcome as ApprovalOutcome | null,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "23505",
  );
}

function notFound() {
  return new ApprovalRequestError(
    "APPROVAL_REQUEST_NOT_FOUND",
    "La demande d’autorisation est introuvable.",
    404,
  );
}

function claimUnavailable() {
  return new ApprovalRequestError(
    "APPROVAL_REQUEST_CLAIM_UNAVAILABLE",
    "La demande d’autorisation a déjà été réclamée ou résolue.",
    409,
  );
}

function expired() {
  return new ApprovalRequestError(
    "APPROVAL_REQUEST_EXPIRED",
    "La demande d’autorisation a expiré.",
    409,
  );
}

function outcomeConflict() {
  return new ApprovalRequestError(
    "APPROVAL_REQUEST_OUTCOME_CONFLICT",
    "La demande d’autorisation n’est plus résoluble.",
    409,
  );
}

function databaseFailed() {
  return new ApprovalRequestError(
    "APPROVAL_REQUEST_DATABASE_FAILED",
    "La demande d’autorisation n’a pas pu être mise à jour.",
    503,
  );
}
