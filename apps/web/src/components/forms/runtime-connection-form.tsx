"use client";

import { useEffect, useState } from "react";
import {
  CableIcon,
  CheckCircle2Icon,
  KeyRoundIcon,
  LoaderCircleIcon,
  NetworkIcon,
  RadioTowerIcon,
  ServerIcon,
  ShieldCheckIcon,
  XCircleIcon,
} from "lucide-react";
import { Button } from "@/components/ui/boardui";
import { cn } from "@/lib/cn";
import {
  getRuntimePublicClient,
  notifyRuntimePublicChanged,
  type RuntimePublicDto,
} from "@/lib/runtime/public-client";

type Transport = "direct" | "relay";

type RuntimeDto = RuntimePublicDto;

type Status =
  | { kind: "idle" }
  | { kind: "loading"; action: "test" | "save" }
  | { kind: "ok"; message: string }
  | { kind: "error"; message: string };

export function RuntimeConnectionForm({
  onRuntimeChange,
}: {
  onRuntimeChange?: (runtime: RuntimeDto) => void;
} = {}) {
  const [transport, setTransport] = useState<Transport>("direct");
  const [baseUrl, setBaseUrl] = useState("http://127.0.0.1:8642");
  const [token, setToken] = useState("");
  const [tokenConfigured, setTokenConfigured] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getRuntimePublicClient()
      .then((runtime) => {
        if (cancelled) return;
        if (runtime.baseUrl) setBaseUrl(runtime.baseUrl);
        setTokenConfigured(runtime.tokenConfigured);
        onRuntimeChange?.(runtime);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setStatus({
          kind: "error",
          message:
            reason instanceof Error ? reason.message : "Impossible de charger la config runtime.",
        });
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [onRuntimeChange]);

  async function testConnection() {
    if (!baseUrl.trim()) {
      setStatus({ kind: "error", message: "Indiquez l’URL Hermes à tester." });
      return;
    }
    if (!token.trim() && !tokenConfigured) {
      setStatus({
        kind: "error",
        message: "Saisissez le token (API_SERVER_KEY) pour le premier test.",
      });
      return;
    }

    setStatus({ kind: "loading", action: "test" });
    try {
      const payload: { baseUrl: string; token?: string } = { baseUrl: baseUrl.trim() };
      if (token.trim()) payload.token = token.trim();
      const response = await fetch("/api/runtime/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as {
        ok?: boolean;
        health?: { version?: string };
        runtime?: RuntimeDto;
        error?: { message?: string };
      };
      if (!response.ok) {
        throw new Error(body.error?.message ?? "Le test de connexion a échoué.");
      }
      const version = body.health?.version ? ` · ${body.health.version}` : "";
      setStatus({
        kind: "ok",
        message: `Appel réseau OK${version} — GET /health + /v1/capabilities depuis le serveur Next.`,
      });
      if (body.runtime) {
        onRuntimeChange?.(body.runtime);
        notifyRuntimePublicChanged();
      }
    } catch (reason) {
      setStatus({
        kind: "error",
        message: reason instanceof Error ? reason.message : "Le test de connexion a échoué.",
      });
    }
  }

  async function saveConnection(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (transport !== "direct") {
      setStatus({
        kind: "error",
        message: "Le mode Relay n’est pas encore branché (backlog Edge Gateway).",
      });
      return;
    }
    if (!baseUrl.trim()) {
      setStatus({ kind: "error", message: "Indiquez l’URL Hermes." });
      return;
    }
    if (!token.trim() && !tokenConfigured) {
      setStatus({ kind: "error", message: "Saisissez un token d’accès pour enregistrer." });
      return;
    }

    setStatus({ kind: "loading", action: "save" });
    try {
      const payload: { baseUrl: string; token?: string } = { baseUrl: baseUrl.trim() };
      if (token.trim()) payload.token = token.trim();
      const response = await fetch("/api/runtime", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as {
        runtime?: RuntimeDto;
        error?: { message?: string };
      };
      if (!response.ok || !body.runtime) {
        throw new Error(body.error?.message ?? "Enregistrement impossible.");
      }
      setToken("");
      setTokenConfigured(true);
      onRuntimeChange?.(body.runtime);
      notifyRuntimePublicChanged();
      setStatus({
        kind: "ok",
        message: "URL/token enregistrés. Cliquez Tester pour un vrai appel réseau.",
      });
    } catch (reason) {
      setStatus({
        kind: "error",
        message: reason instanceof Error ? reason.message : "Enregistrement impossible.",
      });
    }
  }

  const busy = status.kind === "loading";
  const locallyManaged = isLocalRuntimeUrl(baseUrl);

  return (
    <form noValidate onSubmit={saveConnection} className="space-y-5">
      <fieldset>
        <legend className="text-[0.8125rem] font-medium">Mode de connexion</legend>
        <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">
          Accès direct = la Console (process Next) appelle l’URL ci-dessous. Local, VPN ou VPS :
          même flux. Le navigateur ne parle jamais à Hermes.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <TransportChoice
            active={transport === "direct"}
            onClick={() => setTransport("direct")}
            icon={CableIcon}
            title="Accès direct"
            description="Hermes local, réseau privé, VPN ou VPS joignable."
          />
          <TransportChoice
            active={transport === "relay"}
            onClick={() => setTransport("relay")}
            icon={RadioTowerIcon}
            title="Relay sortant"
            description="Hermes derrière un NAT ou un pare-feu entrant."
          />
        </div>
      </fieldset>

      {transport === "direct" ? (
        <div className="space-y-4">
          <Field
            icon={NetworkIcon}
            label="URL Edge ou API Hermes"
            hint="Local : http://127.0.0.1:8642 — VPN/VPS : https://hermes.ton-domaine ou l’IP joignable depuis cette machine."
          >
            <input
              type="url"
              name="baseUrl"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              disabled={!loaded || busy}
              className={input}
            />
          </Field>
          <Field
            icon={KeyRoundIcon}
            label="Token d’accès"
            hint={
              tokenConfigured
                ? "Déjà enregistré (chiffré). Laissez vide pour le garder — Enregistrer ne le redemande pas."
                : "API_SERVER_KEY Hermes. Stocké chiffré, jamais réaffiché."
            }
          >
            <input
              type="password"
              name="token"
              autoComplete="new-password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder={tokenConfigured ? "•••••••• (conservé)" : "••••••••••••••••"}
              disabled={!loaded || busy}
              className={input}
            />
          </Field>
        </div>
      ) : (
        <div className="rounded-2xl bg-surface-sunken p-1">
          <div className="rounded-xl bg-card p-4 shadow-board-card">
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-info-soft text-info-700">
                <RadioTowerIcon className="size-4" />
              </span>
              <div>
                <p className="text-[0.8125rem] font-medium">Enrôlement Relay</p>
                <p className="mt-1 text-[0.6875rem] leading-5 text-muted-foreground">
                  Hors périmètre v0.1 (backlog Edge Gateway). Utilisez l’accès direct pour brancher
                  Hermes maintenant.
                </p>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field icon={ServerIcon} label="Identifiant d’installation">
                <input disabled placeholder="vps-production" className={input} />
              </Field>
              <Field icon={KeyRoundIcon} label="Jeton d’enrôlement à usage unique">
                <input disabled type="password" placeholder="enroll_…" className={input} />
              </Field>
            </div>
          </div>
        </div>
      )}

      <fieldset>
        <legend className="text-[0.8125rem] font-medium">Niveau de gestion</legend>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <ManagementLevel
            title="Externe"
            detail="Connexion et missions uniquement"
            active={!locallyManaged}
          />
          <ManagementLevel title="Connecté" detail="Catalogue et configuration distante" />
          <ManagementLevel
            title="Géré"
            detail="Credentials et redémarrage local"
            active={locallyManaged}
          />
        </div>
      </fieldset>

      <div className="rounded-xl bg-info-soft p-3 text-[0.75rem] text-info-700">
        <p className="flex items-start gap-2">
          <ShieldCheckIcon className="mt-0.5 size-4 shrink-0" />
          Une installation commence toujours au niveau « Externe ». La déconnexion ne supprime ni
          Hermes, ni ses profils, ni ses données.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <StatusMessage status={status} />
        <div className="flex gap-2">
          <Button
            type="button"
            disabled={!loaded || busy || transport !== "direct"}
            onClick={() => void testConnection()}
          >
            {status.kind === "loading" && status.action === "test" ? (
              <LoaderCircleIcon className="size-4 animate-spin" />
            ) : null}
            Tester
          </Button>
          <Button type="submit" variant="primary" disabled={!loaded || busy || transport !== "direct"}>
            {status.kind === "loading" && status.action === "save" ? (
              <LoaderCircleIcon className="size-4 animate-spin" />
            ) : null}
            Enregistrer
          </Button>
        </div>
      </div>
    </form>
  );
}

function StatusMessage({ status }: { status: Status }) {
  if (status.kind === "ok") {
    return (
      <p role="status" className="flex items-center gap-2 text-[0.75rem] text-pos-700">
        <CheckCircle2Icon className="size-4" />
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
  if (status.kind === "loading") {
    return (
      <p className="flex items-center gap-2 text-[0.6875rem] text-muted-foreground">
        <LoaderCircleIcon className="size-3.5 animate-spin" />
        {status.action === "test" ? "Appel réseau en cours…" : "Enregistrement…"}
      </p>
    );
  }
  return (
    <p className="max-w-md text-[0.6875rem] text-muted-foreground">
      <strong className="font-medium text-foreground">Tester</strong> = vrai GET /health +
      /v1/capabilities vers l’URL saisie (token conservé réutilisé).{" "}
      <strong className="font-medium text-foreground">Enregistrer</strong> = persiste URL/token en
      base, sans appeler Hermes.
    </p>
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
        active
          ? "border-ring bg-info-soft text-foreground"
          : "border-input bg-card hover:bg-muted",
      )}
    >
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-[10px]",
          active ? "bg-primary text-primary-foreground" : "bg-ai-tertiary text-muted-foreground",
        )}
      >
        <Icon className="size-4" />
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

function ManagementLevel({
  title,
  detail,
  active,
}: {
  title: string;
  detail: string;
  active?: boolean;
}) {
  return (
    <div
      aria-current={active ? "true" : undefined}
      className={cn(
        "flex items-start gap-2.5 rounded-xl border p-3",
        active ? "border-ring bg-info-soft" : "border-input bg-card",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "mt-0.5 size-3.5 rounded-full border",
          active ? "border-primary bg-primary ring-2 ring-primary/15" : "border-input",
        )}
      />
      <span>
        <span className="block text-[0.75rem] font-medium">{title}</span>
        <span className="mt-0.5 block text-[0.625rem] leading-4 text-muted-foreground">{detail}</span>
      </span>
    </div>
  );
}

function isLocalRuntimeUrl(value: string) {
  try {
    return ["127.0.0.1", "localhost", "::1"].includes(new URL(value).hostname);
  } catch {
    return false;
  }
}

function Field({
  icon: Icon,
  label,
  hint,
  children,
}: {
  icon: typeof NetworkIcon;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="flex items-center gap-2 text-[0.8125rem] font-medium">
        <Icon className="size-3.5 text-muted-foreground" />
        {label}
      </span>
      {hint ? <span className="mt-0.5 block text-[0.6875rem] text-muted-foreground">{hint}</span> : null}
      <span className="mt-2 block">{children}</span>
    </label>
  );
}

const input =
  "min-h-10 w-full rounded-[10px] border border-input bg-card px-3 text-[0.8125rem] text-foreground shadow-board-xs outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20";
