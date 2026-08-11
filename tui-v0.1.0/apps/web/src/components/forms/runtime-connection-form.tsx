"use client";

import { useEffect, useState } from "react";
import { ToggleGroup, ToggleGroupItem } from "@boardui/ui";
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
import { DirectWorkspaceSetup } from "@/components/forms/direct-workspace-setup";
import { HermesTokenGuide } from "@/components/settings/hermes-token-guide";
import { useRuntimeMutation } from "@/components/settings/runtime-mutation-provider";
import { Button, Card, CardSurface } from "@/components/ui/boardui";
import { cn } from "@/lib/cn";
import { useRouter } from "@/lib/router";
import type { RuntimeSection } from "@/lib/runtime/settings-navigation";
import { canReuseDirectRuntimeToken } from "@/lib/runtime-secret-reuse";
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
  mode,
  section = "connection",
  onRuntimeChange,
}: {
  mode?: Transport;
  section?: RuntimeSection;
  onRuntimeChange?: (runtime: RuntimePublicDto) => void;
} = {}) {
  const router = useRouter();
  const [runtime, setRuntime] = useState<RuntimePublicDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [disconnectError, setDisconnectError] = useState<string | null>(null);
  const { runMutation } = useRuntimeMutation();
  // `mode` (l'URL) prime sur la donnée chargée : sans lui, l'onglet suit le
  // transport déjà configuré. Dérivé au rendu, pas via un effet — l'URL et le
  // runtime chargé restent les deux seules sources de vérité.
  const transport: Transport = mode ?? (runtime?.transport === "ssh" ? "ssh" : "direct");
  const showingUnsavedTransport = Boolean(
    mode && runtime?.configured && runtime.transport !== mode,
  );

  useEffect(() => {
    let cancelled = false;
    // Les formulaires mutent une configuration versionnée : ils doivent charger
    // la révision serveur, pas la copie d'affichage restaurée de sessionStorage.
    void getRuntimePublicClient({ refresh: true })
      .then((next) => {
        if (cancelled) return;
        setRuntime(next);
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

  function changeTransport(next: Transport) {
    router.replace(`/settings/runtime?mode=${next}&section=connection`);
  }

  function publish(next: RuntimePublicDto) {
    setRuntime(next);
    onRuntimeChange?.(next);
    notifyRuntimePublicChanged();
  }

  async function disconnectRuntime() {
    if (!runtime?.configured || runtime.source !== "database") return;
    if (!window.confirm("Déconnecter Hermes et supprimer cette configuration de la Console ?")) return;

    setDisconnecting(true);
    setDisconnectError(null);
    try {
      const body = await runMutation("Déconnexion du runtime Hermes", async (signal) => {
        const response = await fetch("/api/runtime", {
          method: "DELETE",
          headers: { "X-Hermes-Toast": "updated" },
          signal,
        });
        const nextBody = (await response.json()) as {
          runtime?: RuntimePublicDto;
          error?: { message?: string };
        };
        if (!response.ok || !nextBody.runtime) {
          throw new Error(nextBody.error?.message ?? "Déconnexion du runtime impossible.");
        }
        return nextBody;
      });
      setRuntime(body.runtime!);
      onRuntimeChange?.(body.runtime!);
      notifyRuntimePublicChanged();
    } catch (reason) {
      setDisconnectError(reason instanceof Error ? reason.message : "Déconnexion du runtime impossible.");
    } finally {
      setDisconnecting(false);
    }
  }

  const configurationSection =
    section === "workspace" || section === "advanced" ? section : "connection";
  const configurationVisible =
    section === "connection" || section === "workspace" || section === "advanced";

  if (loading) {
    return configurationVisible ? (
      <Card>
        <CardSurface>
          <RuntimeFormSkeleton />
        </CardSurface>
      </Card>
    ) : null;
  }
  if (loadError) {
    return (
      <Card>
        <CardSurface>
          <p role="alert" className="flex items-center gap-2 text-[0.75rem] text-destructive">
            <XCircleIcon className="size-4 shrink-0" />
            {loadError}
          </p>
        </CardSurface>
      </Card>
    );
  }

  return (
    <div
      className={cn(!configurationVisible && "hidden")}
      aria-hidden={configurationVisible ? undefined : true}
    >
      <Card>
        <CardSurface>
          <div className="space-y-6">
            {configurationSection === "connection" ? (
              <>
                <div className="flex flex-col gap-3 border-b border-seam pb-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-[0.8125rem] font-semibold">Mode d’accès</p>
                    <p className="mt-1 max-w-[65ch] text-[0.6875rem] leading-5 text-muted-foreground">
                      Choisissez comment le serveur de la Console rejoint l’API Hermes.
                    </p>
                  </div>
                  <ToggleGroup
                    type="single"
                    value={transport}
                    aria-label="Mode d’accès au runtime Hermes"
                    onValueChange={(next) => {
                      if (next === "direct" || next === "ssh") changeTransport(next);
                    }}
                    className="w-full rounded-full border border-seam bg-inset p-1 sm:w-fit"
                  >
                    <ToggleGroupItem
                      value="direct"
                      aria-label="Accès direct"
                      className="min-h-11 flex-1 rounded-full border-0 px-3 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:shadow-board-xs sm:flex-none"
                    >
                      <CableIcon aria-hidden />
                      Accès direct
                    </ToggleGroupItem>
                    <ToggleGroupItem
                      value="ssh"
                      aria-label="Tunnel SSH"
                      className="min-h-11 flex-1 rounded-full border-0 px-3 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:shadow-board-xs sm:flex-none"
                    >
                      <TerminalIcon aria-hidden />
                      Tunnel SSH
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>

                {showingUnsavedTransport ? (
                  <p
                    role="status"
                    className="rounded-xl border border-info-100 bg-info-soft px-3 py-2 text-[0.6875rem] leading-5 text-info-700"
                  >
                    Le runtime enregistré utilise {runtime?.transport === "ssh" ? "un tunnel SSH" : "un accès direct"}. Le mode {transport === "ssh" ? "SSH" : "direct"} affiché ici reste un brouillon tant qu’il n’est pas testé et enregistré.
                  </p>
                ) : null}
              </>
            ) : null}

            {transport === "direct" ? (
              configurationSection === "connection" ? (
                <DirectRuntimeForm runtime={runtime} onRuntimeChange={publish} />
              ) : configurationSection === "workspace" ? (
                <DirectWorkspaceSetup runtime={runtime} />
              ) : null
            ) : (
              <SshRuntimeSetup
                runtime={runtime}
                section={configurationSection}
                onRuntimeChange={publish}
              />
            )}

            {configurationSection === "advanced" ? (
              <RuntimeDisconnectSection
                runtime={runtime}
                disconnecting={disconnecting}
                disconnectError={disconnectError}
                onDisconnect={() => void disconnectRuntime()}
              />
            ) : null}
          </div>
        </CardSurface>
      </Card>
    </div>
  );
}

function RuntimeDisconnectSection({
  runtime,
  disconnecting,
  disconnectError,
  onDisconnect,
}: {
  runtime: RuntimePublicDto | null;
  disconnecting: boolean;
  disconnectError: string | null;
  onDisconnect: () => void;
}) {
  if (runtime?.configured && runtime.source === "database") {
    return (
      <section className="border-t border-seam pt-6" aria-labelledby="runtime-disconnect-title">
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 id="runtime-disconnect-title" className="text-[0.8125rem] font-semibold">
                Zone dangereuse
              </h3>
              <p className="mt-1 max-w-[62ch] text-[0.6875rem] leading-5 text-muted-foreground">
                Supprime la cible {runtime.transport === "ssh" ? "SSH" : "directe"}, ses secrets chiffrés et le tunnel SSH actif.
              </p>
            </div>
            <Button type="button" variant="danger" disabled={disconnecting} onClick={onDisconnect}>
              {disconnecting ? <LoaderCircleIcon className="size-4 animate-spin" /> : <XCircleIcon className="size-4" />}
              {disconnecting ? "Déconnexion…" : "Déconnecter le runtime"}
            </Button>
          </div>
          {disconnectError ? <p role="alert" className="mt-3 text-[0.6875rem] text-destructive">{disconnectError}</p> : null}
        </div>
      </section>
    );
  }

  if (runtime?.configured && runtime.source === "env") {
    return (
      <p role="status" className="rounded-xl border border-info-100 bg-info-soft px-3 py-2 text-[0.6875rem] leading-5 text-info-700">
        Ce runtime vient des variables d’environnement du serveur. Retirez-les dans la configuration du serveur pour le déconnecter.
      </p>
    );
  }

  return (
    <p className="text-[0.6875rem] text-muted-foreground">
      Aucune configuration runtime enregistrée ne peut être supprimée.
    </p>
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
  const { runMutation } = useRuntimeMutation();
  const tokenReusable = canReuseDirectRuntimeToken(runtime, baseUrl);
  const busy = status.kind === "loading";

  function payload() {
    if (!baseUrl.trim()) throw new Error("Indiquez l’URL Hermes.");
    if (!token.trim() && !tokenReusable) {
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
      const body = await runMutation("Test de connexion Hermes", async (signal) => {
        const response = await fetch("/api/runtime/test", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Hermes-Toast": "0",
          },
          signal,
          body: JSON.stringify(payload()),
        });
        const nextBody = (await response.json()) as {
          health?: { version?: string };
          error?: { message?: string };
        };
        if (!response.ok) throw new Error(nextBody.error?.message ?? "Le test a échoué.");
        return nextBody;
      });
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
      const body = await runMutation("Enregistrement de la connexion runtime", async (signal) => {
        const response = await fetch("/api/runtime", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "X-Hermes-Toast": "updated",
          },
          signal,
          body: JSON.stringify(payload()),
        });
        const nextBody = (await response.json()) as {
          runtime?: RuntimePublicDto;
          error?: { message?: string };
        };
        if (!response.ok || !nextBody.runtime) {
          throw new Error(nextBody.error?.message ?? "Enregistrement impossible.");
        }
        return nextBody;
      });
      setToken("");
      onRuntimeChange(body.runtime!);
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
        hint={
          tokenReusable
            ? "Déjà enregistré pour cette adresse. Laissez vide pour le conserver."
            : "API_SERVER_KEY requise pour cette nouvelle adresse Hermes."
        }
      >
        <input
          id="direct-runtime-token"
          type="password"
          autoComplete="new-password"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder={tokenReusable ? "Inchangé si vide" : "Requis pour cette adresse"}
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
  if (!(reason instanceof Error)) return "Opération impossible.";
  const code = "code" in reason && typeof reason.code === "string" ? reason.code : null;
  return code ? `${reason.message} (${code})` : reason.message;
}
