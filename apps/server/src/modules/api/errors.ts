import { ZodError } from "zod";
import { AgentRepositoryError } from "@/modules/agents/repository";
import { ConnectorRepositoryError } from "@/modules/connectors/repository";
import { ImapTestError } from "@/modules/connectors/imap-test";
import { HermesRuntimeError } from "@/modules/runtime/hermes-adapter";
import { ProductRepositoryError } from "@/modules/runs/repository";
import { AuthError } from "@/modules/auth/service";
import { SetupError } from "@/modules/setup/service";
import { OwnershipRepositoryError } from "@/modules/ownership/repository";

export function apiErrorResponse(error: unknown) {
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

  console.error("Unhandled API error", error);
  return Response.json(
    { error: { code: "INTERNAL_ERROR", message: "Erreur interne de la Console." } },
    { status: 500 },
  );
}
