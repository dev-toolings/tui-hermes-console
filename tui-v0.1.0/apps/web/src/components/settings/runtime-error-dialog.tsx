"use client";

import { ExternalLinkIcon } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/boardui";
import { RuntimeApiError } from "@/lib/runtime/models-client";

export type RuntimeErrorAlert = {
  title: string;
  message: string;
  retryable: boolean;
  retryLabel: "Réessayer";
  runtimeSettingsHref: "/settings/runtime";
};

export const RUNTIME_ERROR_DIALOG_ROLE = "alertdialog";
export const RUNTIME_ERROR_DIALOG_CLOSE_LABEL = "Fermer l’alerte";

export function codexAuthRuntimeError(input: {
  error: string | null;
  errorCode?: string | null;
}) {
  const code = input.errorCode ?? "HERMES_CLI_FAILED";
  return new RuntimeApiError({
    status: code === "HERMES_REMOTE_CLI_UNAVAILABLE" ? 503 : 502,
    code,
    message: input.error ?? "Le flux d’autorisation Hermes a échoué.",
  });
}

export function runtimeErrorAlert(error: unknown): RuntimeErrorAlert | null {
  if (!(error instanceof RuntimeApiError)) return null;

  if (error.status === 412) {
    return {
      title: "Runtime Hermes non prêt",
      message: error.message,
      retryable: true,
      retryLabel: "Réessayer",
      runtimeSettingsHref: "/settings/runtime",
    };
  }

  if (error.code === "HERMES_REMOTE_CLI_UNAVAILABLE") {
    return {
      title: "CLI Hermes introuvable sur l’hôte SSH",
      message: error.message,
      retryable: true,
      retryLabel: "Réessayer",
      runtimeSettingsHref: "/settings/runtime",
    };
  }

  if (
    error.code === "HERMES_REMOTE_ADMIN_UNAVAILABLE" ||
    error.code?.startsWith("HERMES_CLI_")
  ) {
    return {
      title: "Commande Hermes en échec",
      message: error.message,
      retryable: true,
      retryLabel: "Réessayer",
      runtimeSettingsHref: "/settings/runtime",
    };
  }

  if (
    error.code === "HERMES_HTTP_ERROR" &&
    (error.status === 401 || error.status === 403)
  ) {
    return {
      title: "Accès au runtime Hermes refusé",
      message: error.message,
      retryable: true,
      retryLabel: "Réessayer",
      runtimeSettingsHref: "/settings/runtime",
    };
  }

  if (error.status >= 500 || error.code?.startsWith("SSH_")) {
    return {
      title: "Runtime Hermes indisponible",
      message: error.message,
      retryable: true,
      retryLabel: "Réessayer",
      runtimeSettingsHref: "/settings/runtime",
    };
  }

  return null;
}

export function RuntimeErrorDialog({
  error,
  onClose,
  onRetry,
}: {
  error: RuntimeErrorAlert | null;
  onClose: () => void;
  onRetry: () => void;
}) {
  return (
    <Dialog
      open={error !== null}
      onClose={onClose}
      role={RUNTIME_ERROR_DIALOG_ROLE}
      closeLabel={RUNTIME_ERROR_DIALOG_CLOSE_LABEL}
      title={error?.title}
      description="La Console a conservé l’état affiché. Vérifiez le runtime avant de reprendre."
      footer={
        <>
          <a
            href={error?.runtimeSettingsHref ?? "/settings/runtime"}
            className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            Paramètres Runtime
            <ExternalLinkIcon className="size-4" aria-hidden />
          </a>
          {error?.retryable ? (
            <Button data-dialog-autofocus onClick={onRetry}>
              {error.retryLabel}
            </Button>
          ) : null}
        </>
      }
    >
      <p>{error?.message}</p>
    </Dialog>
  );
}
