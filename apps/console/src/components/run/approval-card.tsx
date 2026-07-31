"use client";

/**
 * La demande d'autorisation du runtime, posée juste au-dessus du composer.
 *
 * Trois partis pris, tous mesurés sur le cycle réel (§9.5, cf. le scan
 * « Pipe to interpreter: curl | python3 ») :
 *
 *  1. On n'affiche que les `choices` que le runtime propose. Un bouton
 *     « Toujours autoriser » qu'Hermes refuserait serait un 400 déguisé en
 *     promesse.
 *  2. La décision part une seule fois. Sans ça, le second clic revient en
 *     `RUN_NOT_AWAITING_APPROVAL` — une erreur rouge pour une décision pourtant
 *     bien enregistrée.
 *  3. Le clavier fait le travail : les choix sont numérotés, `1`..`9` les
 *     déclenchent. `Échap` ne répond pas — refuser par réflexe de fermeture
 *     serait une décision de sécurité prise par inadvertance.
 *
 * Toute la logique (découpage du scan, ordre des choix, libellés, verrous) vit
 * dans `@/lib/approval-request`, testée sans React.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangleIcon, ShieldCheckIcon } from "lucide-react";
import type { ApprovalChoice } from "@console/core/lib/thread-snapshot-mutations";
import type { RunStatus } from "@console/core/lib/run-status";
import {
  approvalChoiceLabel,
  approvalChoiceShortcut,
  canRespondToApproval,
  orderApprovalChoices,
  parseApprovalScan,
  requiresConfirmation,
} from "@/lib/approval-request";
import { cn } from "@/lib/cn";

const SEVERITY_STYLE: Record<string, string> = {
  HIGH: "bg-destructive/10 text-destructive",
  MEDIUM: "bg-warn-700/10 text-warn-700",
  LOW: "bg-muted text-muted-foreground",
};

export function ApprovalCard({
  command,
  description,
  choices,
  status = "awaiting_approval",
  connected = true,
  onRespond,
}: {
  command: string | null;
  description: string | null;
  choices?: string[];
  /** Statut du run : une mission qui n'attend plus ne se répond plus. */
  status?: RunStatus | null;
  /** Runtime joignable. Répondre hors ligne ne ferait qu'échouer. */
  connected?: boolean;
  onRespond: (choice: ApprovalChoice) => void | Promise<void>;
}) {
  const scan = parseApprovalScan(description);
  const options = orderApprovalChoices(choices);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Choix à portée durable en attente d'un second geste. */
  const [confirming, setConfirming] = useState<ApprovalChoice | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // La demande arrive pendant que l'utilisateur regarde ailleurs : lui donner le
  // focus rend les raccourcis utilisables sans chercher où cliquer.
  useEffect(() => {
    rootRef.current?.focus();
  }, []);

  const respond = useCallback(
    async (choice: ApprovalChoice) => {
      if (!canRespondToApproval({ sending, connected, status: status ?? null })) return;
      if (requiresConfirmation(choice) && confirming !== choice) {
        setConfirming(choice);
        return;
      }
      setSending(true);
      setError(null);
      try {
        await onRespond(choice);
      } catch (reason) {
        // La carte reste ouverte : la mission attend toujours, et l'utilisateur
        // doit pouvoir retenter sans recharger.
        setSending(false);
        setConfirming(null);
        setError(reason instanceof Error ? reason.message : "La réponse n’est pas partie.");
      }
    },
    [confirming, connected, onRespond, sending, status],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const index = options.findIndex(
        (choice, position) => approvalChoiceShortcut(position) === event.key,
      );
      if (index === -1) return;
      event.preventDefault();
      void respond(options[index]!);
    },
    [options, respond],
  );

  const disabled = !canRespondToApproval({ sending, connected, status: status ?? null });

  return (
    <div
      ref={rootRef}
      role="alertdialog"
      aria-live="assertive"
      aria-label="L’agent demande une autorisation"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className="mx-auto mb-3 w-full max-w-(--thread-max-width) rounded-xl border border-warning/35 bg-warning/5 p-3 outline-none focus-visible:ring-2 focus-visible:ring-warning/40"
    >
      <div className="flex items-start gap-2">
        <AlertTriangleIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-warn-700" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-warn-700">
              L’agent demande une autorisation
            </p>
            {scan.severity ? (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[0.6875rem] font-semibold tracking-wide",
                  SEVERITY_STYLE[scan.severity] ?? SEVERITY_STYLE.LOW,
                )}
              >
                {scan.severity}
              </span>
            ) : null}
            {scan.title ? <span className="text-sm">{scan.title}</span> : null}
          </div>

          {scan.detail ? (
            <p className="mt-1 text-sm text-muted-foreground">{scan.detail}</p>
          ) : null}

          {command ? (
            <code className="mt-2 block max-h-32 overflow-auto rounded-md bg-muted px-3 py-2 font-mono text-xs whitespace-pre-wrap scrollbar-subtle">
              {command}
            </code>
          ) : null}

          {/* L'alternative sûre vient du runtime : la noyer dans le paragraphe
              revenait à ne pas la proposer. */}
          {scan.safer.length > 0 ? (
            <div className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
              <ShieldCheckIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              <span className="min-w-0">
                Plus sûr :{" "}
                {scan.safer.map((item, index) => (
                  <span key={item}>
                    {index > 0 ? " — ou " : null}
                    <code className="font-mono">{item}</code>
                  </span>
                ))}
              </span>
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="mt-2 text-xs text-destructive">
              {error}
            </p>
          ) : null}

          {!connected ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Runtime injoignable — la décision ne peut pas être transmise.
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap items-start justify-end gap-2">
          {options.map((choice, index) => {
            const shortcut = approvalChoiceShortcut(index);
            const pending = confirming === choice;
            return (
              <button
                key={choice}
                type="button"
                disabled={disabled}
                onClick={() => void respond(choice)}
                aria-keyshortcuts={shortcut ?? undefined}
                className={cn(
                  "inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors disabled:opacity-50",
                  choice === "deny"
                    ? "border border-border hover:bg-muted"
                    : "bg-primary text-primary-foreground hover:bg-primary/90",
                  pending && "ring-2 ring-warning/50",
                )}
              >
                {shortcut ? (
                  <span
                    aria-hidden
                    className={cn(
                      "rounded px-1 font-mono text-[0.6875rem] tabular-nums",
                      choice === "deny" ? "bg-muted" : "bg-primary-foreground/15",
                    )}
                  >
                    {shortcut}
                  </span>
                ) : null}
                {sending
                  ? "Envoi…"
                  : pending
                    ? "Confirmer"
                    : approvalChoiceLabel(choice)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
