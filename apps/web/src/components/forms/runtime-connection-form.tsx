"use client";

import { useEffect, useState } from "react";
import {
  CableIcon,
  CheckCircle2Icon,
  KeyRoundIcon,
  LoaderCircleIcon,
  NetworkIcon,
  TerminalIcon,
  XCircleIcon,
} from "lucide-react";
import type { RuntimePublicDto } from "@console/core/types/api";
import { SshRuntimeSetup } from "@/components/forms/ssh-runtime-setup";
import { HermesTokenGuide } from "@/components/settings/hermes-token-guide";
import { Button } from "@/components/ui/boardui";
import { cn } from "@/lib/cn";
import {
  getRuntimePublicClient,
  notifyRuntimePublicChanged,
} from "@/lib/runtime/public-client";

type Transport = "direct" | "ssh";
type FormStatus =
  | { kind: "idle" }
  | { kind: "loading"; label: string }
  | { kind: "ok"; message: string }
  | { kind: "error"; message: string };

export function RuntimeConnectionForm({
  onRuntimeChange,
}: {
  onRuntimeChange?: (runtime: RuntimePublicDto) => void;
} = {}) {
  const [runtime, setRuntime] = useState<RuntimePublicDto | null>(null);
  const [transport, setTransport] = useState<Transport>("direct");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Les formulaires mutent une configuration versionnée : ils doivent charger
    // la révision serveur, pas la copie d'affichage restaurée de sessionStorage.
    void getRuntimePublicClient({ refresh: true })
      .then((next) => {
        if (cancelled) return;
        setRuntime(next);
        setTransport(next.transport === "ssh" ? "ssh" : "direct");
        onRuntimeChange?.(next);
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setLoadError(
            reason instanceof Error
              ? reason.message
              : "Impossible de charger la configuration runtime.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [onRuntimeChange]);

  function publish(next: RuntimePublicDto) {
    setRuntime(next);
    onRuntimeChange?.(next);
    notifyRuntimePublicChanged();
  }

  if (loading) return <RuntimeFormSkeleton />;
  if (loadError) {
    return (
      <p role="alert" className="flex items-center gap-2 text-[0.75rem] text-destructive">
        <XCircleIcon className="size-4 shrink-0" />
        {loadError}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <fieldset>
        <legend className="text-[0.8125rem] font-medium">Mode de connexion</legend>
        <p className="mt-1 max-w-[70ch] text-[0.6875rem] leading-5 text-muted-foreground">
          Le serveur de la Console appelle Hermes. Le navigateur ne reçoit jamais les secrets du
          runtime.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <TransportChoice
            active={transport === "direct"}
            onClick={() => setTransport("direct")}
            icon={CableIcon}
            title="Accès direct"
            description="Hermes local, sur VPN ou déjà joignable en HTTP."
          />
          <TransportChoice
            active={transport === "ssh"}
            onClick={() => setTransport("ssh")}
            icon={TerminalIcon}
            title="Tunnel SSH"
            description="Hermes sur un VPS sans exposer son API sur Internet."
          />
        </div>
      </fieldset>

      <div className="border-t border-seam pt-5">
        {transport === "ssh" ? (
          <SshRuntimeSetup runtime={runtime} onRuntimeChange={publish} />
        ) : (
          <DirectRuntimeForm runtime={runtime} onRuntimeChange={publish} />
        )}
      </div>
    </div>
  );
}

function DirectRuntimeForm({
  runtime,
  onRuntimeChange,
}: {
  runtime: RuntimePublicDto | null;
  onRuntimeChange: (runtime: RuntimePublicDto) => void;
}) {
  const [baseUrl, setBaseUrl] = useState(
    runtime?.transport === "direct" && runtime.baseUrl
      ? runtime.baseUrl
      : "http://127.0.0.1:8642",
  );
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<FormStatus>({ kind: "idle" });
  const tokenConfigured = runtime?.transport === "direct" && runtime.tokenConfigured;
  const busy = status.kind === "loading";

  function payload() {
    if (!baseUrl.trim()) throw new Error("Indiquez l’URL Hermes.");
    if (!token.trim() && !tokenConfigured) {
      throw new Error("Saisissez le token Hermes (API_SERVER_KEY).");
    }
    return {
      baseUrl: baseUrl.trim(),
      transport: "direct" as const,
      ...(token.trim() ? { token: token.trim() } : {}),
    };
  }

  async function test() {
    setStatus({ kind: "loading", label: "Test réseau en cours…" });
    try {
      const response = await fetch("/api/runtime/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload()),
      });
      const body = (await response.json()) as {
        health?: { version?: string };
        error?: { message?: string };
      };
      if (!response.ok) throw new Error(body.error?.message ?? "Le test a échoué.");
      setStatus({
        kind: "ok",
        message: `Hermes répond${body.health?.version ? ` · ${body.health.version}` : ""}.`,
      });
    } catch (reason) {
      setStatus({ kind: "error", message: errorMessage(reason) });
    }
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus({ kind: "loading", label: "Enregistrement…" });
    try {
      const response = await fetch("/api/runtime", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload()),
      });
      const body = (await response.json()) as {
        runtime?: RuntimePublicDto;
        error?: { message?: string };
      };
      if (!response.ok || !body.runtime) {
        throw new Error(body.error?.message ?? "Enregistrement impossible.");
      }
      setToken("");
      onRuntimeChange(body.runtime);
      setStatus({ kind: "ok", message: "Connexion directe enregistrée." });
    } catch (reason) {
      setStatus({ kind: "error", message: errorMessage(reason) });
    }
  }

  return (
    <form noValidate onSubmit={save} className="space-y-5">
      <div>
        <p className="text-[0.8125rem] font-semibold">Connexion directe</p>
        <p className="mt-1 text-[0.6875rem] leading-5 text-muted-foreground">
          Utilisez ce mode lorsque l’API Hermes est déjà joignable depuis le serveur de la Console.
        </p>
      </div>
      <Field icon={NetworkIcon} label="URL API Hermes" hint="Local : http://127.0.0.1:8642">
        <input
          type="url"
          value={baseUrl}
          onChange={(event) => setBaseUrl(event.target.value)}
          disabled={busy}
          className={inputClass}
        />
      </Field>
      <Field
        icon={KeyRoundIcon}
        label="Token d’accès Hermes"
        htmlFor="direct-runtime-token"
        action={<HermesTokenGuide />}
        hint={tokenConfigured ? "Déjà enregistré. Laissez vide pour le conserver." : "API_SERVER_KEY d’Hermes."}
      >
        <input
          id="direct-runtime-token"
          type="password"
          autoComplete="new-password"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder={tokenConfigured ? "Inchangé si vide" : "Requis"}
          disabled={busy}
          className={inputClass}
        />
      </Field>
      <div className="flex flex-col gap-3 border-t border-seam pt-4 sm:flex-row sm:items-center sm:justify-between">
        <StatusMessage status={status} idle="Testez le réseau, puis enregistrez la configuration." />
        <div className="flex gap-2 sm:shrink-0">
          <Button type="button" disabled={busy} onClick={() => void test()}>
            Tester
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            Enregistrer
          </Button>
        </div>
      </div>
    </form>
  );
}

export function StatusMessage({ status, idle }: { status: FormStatus; idle: string }) {
  if (status.kind === "loading") {
    return (
      <p role="status" className="flex items-center gap-2 text-[0.6875rem] text-muted-foreground">
        <LoaderCircleIcon className="size-3.5 animate-spin motion-reduce:animate-none" />
        {status.label}
      </p>
    );
  }
  if (status.kind === "ok") {
    return (
      <p role="status" className="flex items-center gap-2 text-[0.75rem] text-pos-700">
        <CheckCircle2Icon className="size-4 shrink-0" />
        {status.message}
      </p>
    );
  }
  if (status.kind === "error") {
    return (
      <p role="alert" className="flex items-center gap-2 text-[0.75rem] text-destructive">
        <XCircleIcon className="size-4 shrink-0" />
        {status.message}
      </p>
    );
  }
  return <p className="max-w-[65ch] text-[0.6875rem] text-muted-foreground">{idle}</p>;
}

function RuntimeFormSkeleton() {
  return (
    <div className="space-y-5" role="status" aria-label="Chargement de la configuration runtime">
      <div className="h-4 w-32 animate-pulse rounded bg-muted motion-reduce:animate-none" />
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="h-24 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none" />
        <div className="h-24 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none" />
      </div>
      <div className="h-40 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
    </div>
  );
}

function TransportChoice({
  active,
  onClick,
  icon: Icon,
  title,
  description,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof CableIcon;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex min-h-24 items-start gap-3 rounded-2xl border p-3 text-start transition-colors",
        active ? "border-ring bg-info-soft" : "border-input bg-card hover:bg-muted",
      )}
    >
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-[10px]",
          active ? "bg-primary text-primary-foreground" : "bg-ai-tertiary text-muted-foreground",
        )}
      >
        <Icon className="size-4" aria-hidden />
      </span>
      <span>
        <span className="block text-[0.8125rem] font-medium">{title}</span>
        <span className="mt-1 block text-[0.6875rem] leading-5 text-muted-foreground">
          {description}
        </span>
      </span>
    </button>
  );
}

export function Field({
  icon: Icon,
  label,
  hint,
  action,
  htmlFor,
  children,
}: {
  icon: typeof NetworkIcon;
  label: string;
  hint?: string;
  action?: React.ReactNode;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  const title = (
    <>
      <Icon className="size-3.5 text-muted-foreground" aria-hidden />
      {label}
    </>
  );
  const body = (
    <>
      {hint ? <span className="mt-0.5 block text-[0.6875rem] text-muted-foreground">{hint}</span> : null}
      <span className="mt-2 block">{children}</span>
    </>
  );
  if (action) {
    return (
      <div>
        <div className="flex items-center justify-between gap-2">
          <label htmlFor={htmlFor} className="flex items-center gap-2 text-[0.8125rem] font-medium">
            {title}
          </label>
          {action}
        </div>
        {body}
      </div>
    );
  }
  return (
    <label className="block">
      <span className="flex items-center gap-2 text-[0.8125rem] font-medium">{title}</span>
      {body}
    </label>
  );
}

export const inputClass =
  "min-h-10 w-full rounded-[10px] border border-input bg-card px-3 text-[0.8125rem] text-foreground shadow-board-xs outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60";

export function errorMessage(reason: unknown) {
  return reason instanceof Error ? reason.message : "Opération impossible.";
}
