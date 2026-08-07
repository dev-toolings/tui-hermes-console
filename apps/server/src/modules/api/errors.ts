import { ZodError } from "zod";
import { AgentRepositoryError } from "@/modules/agents/repository";
import { ConnectorRepositoryError } from "@/modules/connectors/repository";
import { ImapTestError } from "@/modules/connectors/imap-test";
import { HermesRuntimeError } from "@/modules/runtime/hermes-adapter";
import { ProductRepositoryError } from "@/modules/runs/repository";
import { AuthError } from "@/modules/auth/service";
import { SetupError } from "@/modules/setup/service";
import { OwnershipRepositoryError } from "@/modules/ownership/repository";
import { DataLifecycleError } from "@/modules/retention/service";
import { LifecycleExportError } from "@/modules/retention/export";
import { ArtifactIntegrityError } from "@/modules/artifacts/integrity";
import { HermesPolicyError } from "@/modules/policy/hermes-approval";
import { describeError, log } from "@/observability/log";
import { GuidedTaskRepositoryError } from "@/modules/guided-task/repository";
import { GuidedSandboxError } from "@/modules/guided-task/sandbox";
import { GuidedTaskContractError } from "@console/core/modules/guided-task/task";

/**
 * `context` sert au seul appelant qui connaît la requête (`app.onError`) : le
 * log reste émis ici, à l'unique endroit que traversent toutes les erreurs, au
 * lieu d'être dupliqué par chaque filet en amont.
 */
export function apiErrorResponse(
  error: unknown,
  context?: { method: string; path: string },
) {
  if (error instanceof AuthError) {
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }
  if (error instanceof SetupError) {
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }
  if (error instanceof OwnershipRepositoryError) {
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: 404 },
    );
  }
  if (error instanceof DataLifecycleError) {
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }
  if (error instanceof LifecycleExportError || error instanceof ArtifactIntegrityError) {
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }
  if (error instanceof ZodError) {
    return Response.json(
      {
        error: {
          code: "INVALID_INPUT",
          message: "La requête contient des données invalides.",
          fields: error.flatten().fieldErrors,
        },
      },
      { status: 400 },
    );
  }

  if (error instanceof ProductRepositoryError) {
    const status =
      error.code === "THREAD_NOT_FOUND" || error.code === "RUN_NOT_FOUND"
        ? 404
        : 409;
    return Response.json({ error: { code: error.code, message: error.message } }, { status });
  }

  if (error instanceof GuidedTaskRepositoryError) {
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }

  if (error instanceof GuidedSandboxError) {
    const status = error.code === "GUIDED_REPOSITORY_INVALID" ? 400 : 409;
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status },
    );
  }

  if (error instanceof GuidedTaskContractError) {
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: 409 },
    );
  }

  if (error instanceof AgentRepositoryError) {
    const status =
      error.code === "AGENT_NOT_FOUND"
        ? 404
        : error.code === "AGENT_ARCHIVED"
          ? 409
          : 409;
    return Response.json({ error: { code: error.code, message: error.message } }, { status });
  }

  if (error instanceof ConnectorRepositoryError) {
    const status = error.code === "CONNECTOR_NOT_FOUND" ? 404 : 400;
    return Response.json({ error: { code: error.code, message: error.message } }, { status });
  }

  if (error instanceof ImapTestError) {
    return Response.json({ error: { code: error.code, message: error.message } }, { status: 502 });
  }

  if (error instanceof HermesRuntimeError) {
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }

  if (error instanceof HermesPolicyError) {
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }

  if (error instanceof Error && error.message === "DATABASE_URL_MISSING") {
    return Response.json(
      {
        error: {
          code: "DATABASE_URL_MISSING",
          message: "La base produit n’est pas configurée côté serveur.",
        },
      },
      { status: 503 },
    );
  }

  if (error instanceof Error && error.message === "APP_ENCRYPTION_KEY_MISSING") {
    return Response.json(
      {
        error: {
          code: "APP_ENCRYPTION_KEY_MISSING",
          message: "La clé de chiffrement APP_ENCRYPTION_KEY n’est pas configurée.",
        },
      },
      { status: 503 },
    );
  }

  log.error("Unhandled API error", { ...describeError(error), ...context });
  return Response.json(
    { error: { code: "INTERNAL_ERROR", message: "Erreur interne de la Console." } },
    { status: 500 },
  );
}
