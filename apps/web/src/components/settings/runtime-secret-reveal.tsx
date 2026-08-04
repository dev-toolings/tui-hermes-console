"use client";

import { useEffect, useRef, useState } from "react";
import {
  EyeIcon,
  EyeOffIcon,
  LoaderCircleIcon,
  MailCheckIcon,
  ShieldCheckIcon,
} from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/boardui";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { cn } from "@/lib/cn";

const SECRET_NAME = "API_SERVER_KEY";
const inputClass =
  "min-h-10 w-full rounded-[10px] border border-input bg-card px-3 text-[0.8125rem] text-foreground shadow-board-xs outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60";

type Challenge = {
  challengeId: string;
  maskedRecipient: string;
  expiresAt: string;
  retryAfter: string;
};

type RevealResponse = {
  secret?: string;
  variableName?: string;
  source?: string;
  expiresAt?: string;
  error?: { code?: string; message?: string };
};

export function RuntimeSecretReveal({
  id,
  value,
  onChange,
  canReveal,
  disabled,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  canReveal: boolean;
  disabled: boolean;
  placeholder: string;
}) {
  const [revealed, setRevealed] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"challenge" | "verify" | "resend" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [retryIn, setRetryIn] = useState(0);
  const [revealExpiresAt, setRevealExpiresAt] = useState<number | null>(null);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const revealedSecretRef = useRef<string | null>(null);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!revealedSecretRef.current || revealExpiresAt === null) return;
    const secret = revealedSecretRef.current;
    const timer = window.setTimeout(() => {
      if (valueRef.current === secret) onChangeRef.current("");
      revealedSecretRef.current = null;
      setRevealExpiresAt(null);
      setRevealed(false);
      setStatus("Le token a été masqué et effacé de la saisie.");
    }, Math.max(0, revealExpiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [revealExpiresAt]);

  useEffect(() => {
    if (!challenge) return;
    const update = () => {
      const seconds = Math.max(0, Math.ceil((Date.parse(challenge.retryAfter) - Date.now()) / 1000));
      setRetryIn(seconds);
    };
    update();
    const timer = window.setInterval(update, 1_000);
    return () => window.clearInterval(timer);
  }, [challenge]);

  function closeDialog() {
    if (busy) return;
    setDialogOpen(false);
    setChallenge(null);
    setCode("");
    setError(null);
  }

  async function requestChallenge(event?: React.SyntheticEvent) {
    event?.preventDefault();
    if (!canReveal || disabled || busy) return;
    setBusy(challenge ? "resend" : "challenge");
    setError(null);
    setStatus(null);
    try {
      const response = await fetch("/api/runtime/secret-reveal/challenge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Hermes-Toast": "0",
        },
        cache: "no-store",
        body: JSON.stringify({ secretName: SECRET_NAME }),
      });
      const body = (await response.json()) as Challenge & { error?: { message?: string } };
      if (!response.ok || !body.challengeId) {
        throw new Error(body.error?.message ?? "Le code de vérification n’a pas pu être envoyé.");
      }
      setChallenge(body);
      setCode("");
      setDialogOpen(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Le code de vérification n’a pas pu être envoyé.");
    } finally {
      setBusy(null);
    }
  }

  async function verifyCode(nextCode = code) {
    if (!challenge || nextCode.length !== 6 || busy) return;
    setBusy("verify");
    setError(null);
    try {
      const response = await fetch("/api/runtime/secret-reveal/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Hermes-Toast": "0",
        },
        cache: "no-store",
        body: JSON.stringify({ secretName: SECRET_NAME, challengeId: challenge.challengeId, code: nextCode }),
      });
      const body = (await response.json()) as RevealResponse;
      if (!response.ok || !body.secret) {
        throw new Error(body.error?.message ?? "La vérification du code a échoué.");
      }
      revealedSecretRef.current = body.secret;
      onChangeRef.current(body.secret);
      setRevealed(true);
      setRevealExpiresAt(Date.now() + 60_000);
      setDialogOpen(false);
      setChallenge(null);
      setCode("");
      setStatus(`Token ${body.variableName ?? SECRET_NAME} chargé temporairement.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "La vérification du code a échoué.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id={id}
          type={revealed ? "text" : "password"}
          autoComplete="new-password"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(inputClass, "min-w-0 flex-1 font-mono")}
        />
        {revealed ? (
          <Button
            type="button"
            disabled={disabled}
            leadingIcon={EyeOffIcon}
            onClick={() => setRevealed(false)}
          >
            Masquer
          </Button>
        ) : (
          <Button
            type="button"
            disabled={disabled || !canReveal}
            leadingIcon={EyeIcon}
            onClick={() => void requestChallenge()}
            title={canReveal ? "Envoyer un code OTP par e-mail" : "Enregistrez d’abord cette cible"}
          >
            Révéler
          </Button>
        )}
      </div>
      {canReveal ? (
        <p className="flex items-center gap-1.5 text-[0.625rem] text-muted-foreground">
          <ShieldCheckIcon className="size-3 shrink-0" aria-hidden />
          Révélation protégée par un code envoyé à votre adresse de session.
        </p>
      ) : null}
      {busy && !dialogOpen ? (
        <div role="status" aria-live="polite" className="space-y-1.5">
          <div className="flex items-center gap-2 text-[0.6875rem] text-muted-foreground">
            <LoaderCircleIcon className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
            Envoi du code de vérification…
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div className="h-full w-2/3 animate-pulse rounded-full bg-primary motion-reduce:animate-none" />
          </div>
        </div>
      ) : null}
      {status ? <p className="text-[0.625rem] text-pos-700" role="status">{status}</p> : null}
      {error && !dialogOpen ? <p className="text-[0.6875rem] text-destructive" role="alert">{error}</p> : null}

      <Dialog
        open={dialogOpen}
        onClose={closeDialog}
        title="Vérification requise"
        description="Le token ne sera chargé dans ce champ qu’après validation du code."
        className="max-w-md"
        showClose={false}
        footer={
          <div className="flex w-full items-center justify-end gap-2">
            <Button type="button" disabled={Boolean(busy)} onClick={closeDialog}>Annuler</Button>
            <Button
              type="button"
              disabled={busy !== null || retryIn > 0}
              leadingIcon={busy === "resend" ? LoaderCircleIcon : MailCheckIcon}
              onClick={() => void requestChallenge()}
            >
              {retryIn > 0 ? `Renvoyer dans ${retryIn}s` : "Renvoyer le code"}
            </Button>
          </div>
        }
      >
        <form onSubmit={(event) => { event.preventDefault(); void verifyCode(); }} className="min-w-0 space-y-4">
          <div className="flex items-center justify-center gap-3 rounded-xl border border-info-100 bg-info-soft p-3 text-center text-[0.6875rem] text-info-700">
            <MailCheckIcon className="size-4 shrink-0" aria-hidden />
            <p>Un code à 6 chiffres a été envoyé à <strong>{challenge?.maskedRecipient}</strong>.</p>
          </div>
          <div>
            <label htmlFor={`${id}-otp`} className="block text-center text-[0.75rem] font-medium">Code de vérification</label>
            <InputOTP
              id={`${id}-otp`}
              maxLength={6}
              inputMode="numeric"
              autoComplete="one-time-code"
              containerClassName="mt-2 w-full justify-center"
              value={code}
              onChange={(nextValue) => setCode(nextValue.replace(/\D/g, "").slice(0, 6))}
              onComplete={(completedCode) => void verifyCode(completedCode)}
              disabled={busy !== null}
              autoFocus
              aria-invalid={Boolean(error)}
              aria-describedby={`${id}-otp-help`}
            >
              <InputOTPGroup>
                {Array.from({ length: 6 }, (_, index) => (
                  <InputOTPSlot key={index} index={index} />
                ))}
              </InputOTPGroup>
            </InputOTP>
            <p id={`${id}-otp-help`} className="mt-1.5 text-center text-[0.625rem] text-muted-foreground">
              Le code expire dans 5 minutes et ne peut être utilisé qu’une seule fois.
            </p>
          </div>
          {busy ? (
            <div role="status" aria-live="polite" className="space-y-1.5 text-center">
              <div className="flex items-center justify-center gap-2 text-[0.6875rem] text-muted-foreground">
                <LoaderCircleIcon className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
                {busy === "resend" ? "Renvoi du code…" : busy === "challenge" ? "Envoi du code…" : "Vérification du code…"}
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
                <div className="h-full w-2/3 animate-pulse rounded-full bg-primary motion-reduce:animate-none" />
              </div>
            </div>
          ) : null}
          {error ? <p role="alert" className="text-center text-[0.6875rem] text-destructive">{error}</p> : null}
        </form>
      </Dialog>
    </>
  );
}
