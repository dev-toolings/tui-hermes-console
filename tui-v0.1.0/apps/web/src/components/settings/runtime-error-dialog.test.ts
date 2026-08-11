import { describe, expect, test } from "bun:test";
import { RuntimeApiError } from "@/lib/runtime/models-client";
import {
  codexAuthRuntimeError,
  RUNTIME_ERROR_DIALOG_CLOSE_LABEL,
  RUNTIME_ERROR_DIALOG_ROLE,
  runtimeErrorAlert,
} from "./runtime-error-dialog";

describe("runtimeErrorAlert", () => {
  test("conserve le code d’un échec OAuth immédiat dans le dialog SSH", () => {
    const alert = runtimeErrorAlert(
      codexAuthRuntimeError({
        error: "Hermes CLI introuvable sur l’hôte SSH.",
        errorCode: "HERMES_REMOTE_CLI_UNAVAILABLE",
      }),
    );

    expect(alert).toMatchObject({
      title: "CLI Hermes introuvable sur l’hôte SSH",
      message: "Hermes CLI introuvable sur l’hôte SSH.",
    });
  });

  test("identifie un runtime Hermes non prêt", () => {
    expect(
      runtimeErrorAlert(
        new RuntimeApiError({
          status: 412,
          code: "HERMES_RUNTIME_NOT_READY",
          message: "Le runtime démarre encore.",
        }),
      ),
    ).toEqual({
      title: "Runtime Hermes non prêt",
      message: "Le runtime démarre encore.",
      retryable: true,
      retryLabel: "Réessayer",
      runtimeSettingsHref: "/settings/runtime",
    });
  });

  test("identifie exactement la CLI absente sur l’hôte SSH", () => {
    expect(
      runtimeErrorAlert(
        new RuntimeApiError({
          status: 503,
          code: "HERMES_REMOTE_CLI_UNAVAILABLE",
          message: "Hermes CLI introuvable sur l’hôte SSH.",
        }),
      ),
    ).toMatchObject({
      title: "CLI Hermes introuvable sur l’hôte SSH",
      retryable: true,
      retryLabel: "Réessayer",
      runtimeSettingsHref: "/settings/runtime",
    });
  });

  test("distingue une commande CLI en échec d’un binaire distant absent", () => {
    expect(
      runtimeErrorAlert(
        new RuntimeApiError({
          status: 502,
          code: "HERMES_CLI_FAILED",
          message: "Hermes a refusé la commande.",
        }),
      ),
    ).toMatchObject({ title: "Commande Hermes en échec" });
  });

  test("signale un token runtime refusé comme un problème runtime", () => {
    expect(
      runtimeErrorAlert(
        new RuntimeApiError({
          status: 401,
          code: "HERMES_HTTP_ERROR",
          message: "Le token Hermes est refusé.",
        }),
      ),
    ).toMatchObject({
      title: "Accès au runtime Hermes refusé",
      runtimeSettingsHref: "/settings/runtime",
    });
  });

  test("identifie un tunnel ou un runtime indisponible", () => {
    expect(
      runtimeErrorAlert(
        new RuntimeApiError({
          status: 502,
          code: "SSH_TUNNEL_FAILED",
          message: "Le tunnel SSH est fermé.",
        }),
      ),
    ).toMatchObject({
      title: "Runtime Hermes indisponible",
      retryable: true,
      runtimeSettingsHref: "/settings/runtime",
    });
  });

  test("laisse les erreurs non-runtime à leur état inline", () => {
    expect(
      runtimeErrorAlert(
        new RuntimeApiError({
          status: 409,
          code: "HERMES_MODEL_UNAVAILABLE",
          message: "Le modèle a changé.",
        }),
      ),
    ).toBeNull();
  });

  test("expose le contrat accessible et les actions du dialog sans DOM", () => {
    expect(RUNTIME_ERROR_DIALOG_ROLE).toBe("alertdialog");
    expect(RUNTIME_ERROR_DIALOG_CLOSE_LABEL).toBe("Fermer l’alerte");
  });
});
