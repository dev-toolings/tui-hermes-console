"use client";

import { useEffect, useState } from "react";
import {
  CableIcon,
  CheckCircle2Icon,
  FolderIcon,
  KeyRoundIcon,
  LoaderCircleIcon,
  NetworkIcon,
  ServerIcon,
  ShieldCheckIcon,
  TerminalIcon,
  UserRoundIcon,
  XCircleIcon,
} from "lucide-react";
import { Button } from "@/components/ui/boardui";
import { HermesTokenGuide } from "@/components/settings/hermes-token-guide";
import { cn } from "@/lib/cn";
import {
  getRuntimePublicClient,
  notifyRuntimePublicChanged,
  type RuntimePublicDto,
} from "@/lib/runtime/public-client";

type Transport = "direct" | "ssh";

type RuntimeDto = RuntimePublicDto;

type Status =
  | { kind: "idle" }
  | { kind: "loading"; action: "test" | "save" }
  | { kind: "ok"; message: string }
  | { kind: "error"; message: string };

type SshAuth = "agent" | "password";

type SshPayload = {
  host: string;
  port: number;
  user: string;
  auth: SshAuth;
  password?: string;
};

type SshConfigHost = {
  alias: string;
  hostname: string | null;
  user: string | null;
  port: number | null;
};

export function RuntimeConnectionForm({
  onRuntimeChange,
}: {
  onRuntimeChange?: (runtime: RuntimeDto) => void;
} = {}) {
  const [transport, setTransport] = useState<Transport>("direct");
  const [baseUrl, setBaseUrl] = useState("http://127.0.0.1:8642");
  const [token, setToken] = useState("");
  const [tokenConfigured, setTokenConfigured] = useState(false);
  const [sshHost, setSshHost] = useState("");
  const [sshPort, setSshPort] = useState("22");
  const [sshUser, setSshUser] = useState("");
  const [sshAuth, setSshAuth] = useState<SshAuth>("agent");
  const [sshPassword, setSshPassword] = useState("");
  const [sshPasswordConfigured, setSshPasswordConfigured] = useState(false);
  const [remoteWorkdir, setRemoteWorkdir] = useState("/tmp/hermes-console-work");
  const [configHosts, setConfigHosts] = useState<SshConfigHost[]>([]);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getRuntimePublicClient()
      .then((runtime) => {
        if (cancelled) return;
        if (runtime.baseUrl) setBaseUrl(runtime.baseUrl);
        setTransport(runtime.transport === "ssh" ? "ssh" : "direct");
        setTokenConfigured(runtime.tokenConfigured);
        setSshHost(runtime.sshHost ?? "");
        setSshPort(String(runtime.sshPort ?? 22));
        setSshUser(runtime.sshUser ?? "");
        setSshAuth(runtime.sshAuth ?? "agent");
        setSshPasswordConfigured(runtime.sshPasswordConfigured);
        if (runtime.remoteWorkdir) setRemoteWorkdir(runtime.remoteWorkdir);
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
    // Suggestions d'hôtes : purement indicatif, la saisie libre reste possible.
    void fetch("/api/runtime/ssh-hosts", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : { hosts: [] }))
      .then((body: { hosts?: SshConfigHost[] }) => {
        if (!cancelled) setConfigHosts(body.hosts ?? []);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [onRuntimeChange]);

  /** Champs communs aux deux appels. `null` = un champ requis manque, message déjà posé. */
  function buildPayload(): {
    baseUrl: string;
    token?: string;
    transport: Transport;
    ssh?: SshPayload;
  } | null {
    if (!baseUrl.trim()) {
      setStatus({ kind: "error", message: "Indiquez l’URL Hermes." });
      return null;
    }
    if (!token.trim() && !tokenConfigured) {
      setStatus({
        kind: "error",
        message: "Saisissez le token Hermes (API_SERVER_KEY).",
      });
      return null;
    }

    const payload: {
      baseUrl: string;
      token?: string;
      transport: Transport;
      ssh?: SshPayload;
      remoteWorkdir?: string;
    } = { baseUrl: baseUrl.trim(), transport };
    if (token.trim()) payload.token = token.trim();

    if (transport === "ssh") {
      if (!sshHost.trim() || !sshUser.trim()) {
        setStatus({ kind: "error", message: "Hôte et utilisateur SSH sont requis." });
        return null;
      }
      const port = Number(sshPort);
      if (!Number.isInteger(port) || port < 1 || port > 65_535) {
        setStatus({ kind: "error", message: "Port SSH invalide (1-65535)." });
        return null;
      }
      if (sshAuth === "password" && !sshPassword && !sshPasswordConfigured) {
        setStatus({ kind: "error", message: "Saisissez le mot de passe SSH." });
        return null;
      }
      payload.ssh = { host: sshHost.trim(), port, user: sshUser.trim(), auth: sshAuth };
      if (sshAuth === "password" && sshPassword) payload.ssh.password = sshPassword;
      if (remoteWorkdir.trim()) payload.remoteWorkdir = remoteWorkdir.trim();
    }

    return payload;
  }

  async function testConnection() {
    const payload = buildPayload();
    if (!payload) return;

    setStatus({ kind: "loading", action: "test" });
    try {
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
      const via = transport === "ssh" ? " à travers le tunnel SSH" : "";
      setStatus({
        kind: "ok",
        message: `Appel réseau OK${version} — GET /health + /v1/capabilities${via}.`,
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
    const payload = buildPayload();
    if (!payload) return;

    setStatus({ kind: "loading", action: "save" });
    try {
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
      setSshPassword("");
      setTokenConfigured(true);
      setSshPasswordConfigured(body.runtime.sshPasswordConfigured);
      onRuntimeChange?.(body.runtime);
      notifyRuntimePublicChanged();
      setStatus({
        kind: "ok",
        message: "Connexion enregistrée. Cliquez Tester pour un vrai appel réseau.",
      });
    } catch (reason) {
      setStatus({
        kind: "error",
        message: reason instanceof Error ? reason.message : "Enregistrement impossible.",
      });
    }
  }

  /** Choisir un alias de ~/.ssh/config préremplit le reste ; la saisie libre reste intacte. */
  function applyHost(value: string) {
    setSshHost(value);
    const match = configHosts.find((host) => host.alias === value);
    if (!match) return;
    if (match.user) setSshUser(match.user);
    if (match.port) setSshPort(String(match.port));
  }

  const busy = status.kind === "loading";
  const disabled = !loaded || busy;

  return (
    <form noValidate onSubmit={saveConnection} className="space-y-5">
      <fieldset>
        <legend className="text-[0.8125rem] font-medium">Mode de connexion</legend>
        <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">
          Dans les deux cas c’est la Console (process Next) qui appelle Hermes — le navigateur ne lui
          parle jamais et ne reçoit aucun secret.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <TransportChoice
            active={transport === "direct"}
            onClick={() => setTransport("direct")}
            icon={CableIcon}
            title="Accès direct"
            description="Hermes local, réseau privé, VPN ou VPS déjà joignable en HTTP."
          />
          <TransportChoice
            active={transport === "ssh"}
            onClick={() => setTransport("ssh")}
            icon={TerminalIcon}
            title="Tunnel SSH"
            description="Hermes sur une autre machine, joignable en SSH. Rien à exposer sur le réseau."
          />
        </div>
      </fieldset>

      {transport === "ssh" ? (
        <fieldset className="space-y-4">
          <legend className="text-[0.8125rem] font-medium">Connexion SSH</legend>
          <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
            <Field
              icon={ServerIcon}
              label="Hôte SSH"
              hint={
                configHosts.length > 0
                  ? "IP, nom d’hôte, ou un alias de votre ~/.ssh/config."
                  : "IP ou nom d’hôte du PC de dev / VPS."
              }
            >
              <input
                name="sshHost"
                list="ssh-config-hosts"
                value={sshHost}
                onChange={(event) => applyHost(event.target.value)}
                placeholder="192.168.1.57"
                disabled={disabled}
                className={input}
              />
              <datalist id="ssh-config-hosts">
                {configHosts.map((host) => (
                  <option key={host.alias} value={host.alias}>
                    {host.hostname ?? host.alias}
                  </option>
                ))}
              </datalist>
            </Field>
            <Field icon={NetworkIcon} label="Port SSH">
              <input
                name="sshPort"
                inputMode="numeric"
                value={sshPort}
                onChange={(event) => setSshPort(event.target.value)}
                disabled={disabled}
                className={input}
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field icon={UserRoundIcon} label="Utilisateur">
              <input
                name="sshUser"
                autoComplete="off"
                value={sshUser}
                onChange={(event) => setSshUser(event.target.value)}
                placeholder="kevin"
                disabled={disabled}
                className={input}
              />
            </Field>
            {sshAuth === "password" ? (
              <Field
                icon={KeyRoundIcon}
                label="Mot de passe SSH"
                hint={
                  sshPasswordConfigured
                    ? "Déjà enregistré (chiffré). Laissez vide pour le conserver."
                    : "Stocké chiffré côté serveur, jamais réaffiché."
                }
              >
                <input
                  type="password"
                  name="sshPassword"
                  autoComplete="new-password"
                  value={sshPassword}
                  onChange={(event) => setSshPassword(event.target.value)}
                  placeholder={sshPasswordConfigured ? "Inchangé si vide" : "Requis"}
                  disabled={disabled}
                  className={input}
                />
              </Field>
            ) : null}
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <AuthChoice
              active={sshAuth === "agent"}
              onClick={() => setSshAuth("agent")}
              title="Clé / agent SSH"
              description="Utilise `ssh` et votre ~/.ssh/config : clés, agent, ProxyJump. Aucun secret stocké."
            />
            <AuthChoice
              active={sshAuth === "password"}
              onClick={() => setSshAuth("password")}
              title="Mot de passe"
              description="Pour un hôte sans clé autorisée. Le mot de passe est stocké chiffré."
            />
          </div>

          <Field
            icon={FolderIcon}
            label="Dossier de travail distant"
            hint="Où les pièces jointes sont déposées et les fichiers produits récupérés, sur la machine distante."
          >
            <input
              name="remoteWorkdir"
              value={remoteWorkdir}
              onChange={(event) => setRemoteWorkdir(event.target.value)}
              placeholder="/tmp/hermes-console-work"
              disabled={disabled}
              className={input}
            />
          </Field>
        </fieldset>
      ) : null}

      <div className="space-y-4">
        <Field
          icon={NetworkIcon}
          label={transport === "ssh" ? "URL Hermes vue depuis la machine distante" : "URL API Hermes"}
          hint={
            transport === "ssh"
              ? "Ce qu’Hermes écoute sur la machine distante — en général http://127.0.0.1:8642. Doit être en http:// : le lien est déjà chiffré par SSH."
              : "Local : http://127.0.0.1:8642 — VPN/VPS : https://hermes.ton-domaine ou l’IP joignable depuis cette machine."
          }
        >
          <input
            type="url"
            name="baseUrl"
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            disabled={disabled}
            className={input}
          />
        </Field>
        <Field
          icon={KeyRoundIcon}
          label="Token d’accès Hermes"
          htmlFor="runtime-token"
          action={<HermesTokenGuide />}
          hint={
            tokenConfigured
              ? "Déjà enregistré (chiffré). Laissez vide pour le garder — Enregistrer ne le redemande pas."
              : "API_SERVER_KEY d’Hermes — sa propre authentification, indépendante du SSH : le tunnel ouvre le chemin réseau, ce token autorise les appels. Stocké chiffré, jamais réaffiché."
          }
        >
          <input
            type="password"
            id="runtime-token"
            name="token"
            autoComplete="new-password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder={tokenConfigured ? "Inchangé si vide" : "Requis"}
            disabled={disabled}
            className={input}
          />
        </Field>
      </div>

      <div className="rounded-xl bg-info-soft p-3 text-[0.75rem] text-info-700">
        <p className="flex items-start gap-2">
          <ShieldCheckIcon className="mt-0.5 size-4 shrink-0" />
          {transport === "ssh"
            ? "Le tunnel est monté par le serveur de la Console et rouvert automatiquement s’il tombe. La déconnexion ne supprime ni Hermes, ni ses profils, ni ses données."
            : "La déconnexion ne supprime ni Hermes, ni ses profils, ni ses données."}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-seam pt-4">
        <StatusMessage status={status} />
        <div className="flex gap-2">
          <Button type="button" disabled={disabled} onClick={() => void testConnection()}>
            {status.kind === "loading" && status.action === "test" ? (
              <LoaderCircleIcon className="size-4 animate-spin" />
            ) : null}
            Tester
          </Button>
          <Button type="submit" variant="primary" disabled={disabled}>
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
      /v1/capabilities vers la cible saisie, sans rien enregistrer.{" "}
      <strong className="font-medium text-foreground">Enregistrer</strong> = persiste la connexion en
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

function AuthChoice({
  active,
  onClick,
  title,
  description,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex items-start gap-2.5 rounded-xl border p-3 text-start transition-colors",
        active ? "border-ring bg-info-soft" : "border-input bg-card hover:bg-muted",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "mt-0.5 size-3.5 shrink-0 rounded-full border",
          active ? "border-primary bg-primary ring-2 ring-primary/15" : "border-input",
        )}
      />
      <span>
        <span className="block text-[0.75rem] font-medium">{title}</span>
        <span className="mt-0.5 block text-[0.625rem] leading-4 text-muted-foreground">
          {description}
        </span>
      </span>
    </button>
  );
}

function Field({
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
  /** Contrôle affiché sur la ligne du libellé (badge, lien d'aide…). */
  action?: React.ReactNode;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  const title = (
    <>
      <Icon className="size-3.5 text-muted-foreground" />
      {label}
    </>
  );
  const body = (
    <>
      {hint ? <span className="mt-0.5 block text-[0.6875rem] text-muted-foreground">{hint}</span> : null}
      <span className="mt-2 block">{children}</span>
    </>
  );

  // Un bouton ne peut pas vivre dans un <label> (contenu interactif imbriqué :
  // le clic serait réémis vers le champ). Avec une action, on associe via htmlFor.
  if (action) {
    return (
      <div className="block">
        <div className="flex items-center justify-between gap-2">
          <label
            htmlFor={htmlFor}
            className="flex items-center gap-2 text-[0.8125rem] font-medium"
          >
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

const input =
  "min-h-10 w-full rounded-[10px] border border-input bg-card px-3 text-[0.8125rem] text-foreground shadow-board-xs outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20";
