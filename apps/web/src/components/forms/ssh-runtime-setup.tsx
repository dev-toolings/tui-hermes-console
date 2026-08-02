"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  FolderCheckIcon,
  FolderSearchIcon,
  KeyRoundIcon,
  LoaderCircleIcon,
  NetworkIcon,
  PlayIcon,
  ServerIcon,
  ShieldCheckIcon,
  TerminalIcon,
  UserRoundIcon,
} from "lucide-react";
import type {
  RuntimeProvisionMode,
  RuntimePublicDto,
  RuntimeSshPlanDto,
  RuntimeSshProvisionJobDto,
  RuntimeSshWorkspaceCandidateDto,
  RuntimeSshWorkspaceDiscoveryDto,
} from "@console/core/types/api";
import { HermesTokenGuide } from "@/components/settings/hermes-token-guide";
import { Badge, Button } from "@/components/ui/boardui";
import { cn } from "@/lib/cn";
import { Field, StatusMessage, errorMessage, inputClass } from "./runtime-connection-form";

type SshAuth = "agent" | "password";
type Status =
  | { kind: "idle" }
  | { kind: "loading"; label: string }
  | { kind: "ok"; message: string }
  | { kind: "error"; message: string };

type SshConfigHost = {
  alias: string;
  hostname: string | null;
  user: string | null;
  port: number | null;
};

type HostKey = {
  host: string;
  port: number;
  lookup: string;
  keyType: string;
  keyBase64: string;
  fingerprintSha256: string;
};

export function SshRuntimeSetup({
  runtime,
  onRuntimeChange,
}: {
  runtime: RuntimePublicDto | null;
  onRuntimeChange: (runtime: RuntimePublicDto) => void;
}) {
  const [sshHost, setSshHost] = useState(runtime?.sshHost ?? "");
  const [sshPort, setSshPort] = useState(String(runtime?.sshPort ?? 22));
  const [sshUser, setSshUser] = useState(runtime?.sshUser ?? "");
  const [sshAuth, setSshAuth] = useState<SshAuth>(runtime?.sshAuth ?? "agent");
  const [sshPassword, setSshPassword] = useState("");
  const [baseUrl, setBaseUrl] = useState(runtime?.baseUrl ?? "http://127.0.0.1:8642");
  const [token, setToken] = useState("");
  const [configHosts, setConfigHosts] = useState<SshConfigHost[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<Status>({ kind: "idle" });
  const [workspaceStatus, setWorkspaceStatus] = useState<Status>({ kind: "idle" });
  const [hostKey, setHostKey] = useState<HostKey | null>(null);
  const [discovery, setDiscovery] = useState<RuntimeSshWorkspaceDiscoveryDto | null>(null);
  const [selected, setSelected] = useState<RuntimeSshWorkspaceCandidateDto | null>(null);
  const [manualHostPath, setManualHostPath] = useState("");
  const [manualHermesPath, setManualHermesPath] = useState("");
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/runtime/ssh-hosts", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : { hosts: [] }))
      .then((body: { hosts?: SshConfigHost[] }) => {
        if (!cancelled) setConfigHosts(body.hosts ?? []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const connectionStored = runtime?.configured === true && runtime.transport === "ssh";
  const connectionDirty = Boolean(
    connectionStored &&
      (sshHost.trim() !== (runtime?.sshHost ?? "") ||
        Number(sshPort) !== (runtime?.sshPort ?? 22) ||
        sshUser.trim() !== (runtime?.sshUser ?? "") ||
        sshAuth !== runtime?.sshAuth ||
        baseUrl.trim().replace(/\/+$/, "") !== (runtime?.baseUrl ?? "").replace(/\/+$/, "") ||
        token.trim() ||
        sshPassword),
  );
  const connectionSaved = connectionStored && !connectionDirty;
  const workspaceReady = connectionSaved && runtime.workspaceStatus === "ready";
  const connectionBusy = connectionStatus.kind === "loading";
  const workspaceBusy = workspaceStatus.kind === "loading";
  const busy = connectionBusy || workspaceBusy;

  function connectionPayload() {
    const port = parsePort(sshPort);
    if (!sshHost.trim() || !sshUser.trim()) {
      throw new Error("Indiquez l’hôte et l’utilisateur SSH.");
    }
    if (!baseUrl.trim()) throw new Error("Indiquez l’URL Hermes distante.");
    if (!token.trim() && !(connectionStored && !connectionDirty && runtime?.tokenConfigured)) {
      throw new Error("Saisissez le token Hermes (API_SERVER_KEY).");
    }
    if (
      sshAuth === "password" &&
      !sshPassword &&
      !(connectionStored && !connectionDirty && runtime?.sshPasswordConfigured)
    ) {
      throw new Error("Saisissez le mot de passe SSH.");
    }
    return {
      baseUrl: baseUrl.trim(),
      expectedRevision: runtime?.configRevision ?? null,
      ssh: {
        host: sshHost.trim(),
        port,
        user: sshUser.trim(),
        auth: sshAuth,
        ...(sshPassword ? { password: sshPassword } : {}),
      },
      ...(token.trim() ? { token: token.trim() } : {}),
    };
  }

  async function connect() {
    setConnectionStatus({ kind: "loading", label: "Test SSH, tunnel et API Hermes…" });
    setHostKey(null);
    try {
      const response = await fetch("/api/runtime/ssh/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(connectionPayload()),
      });
      const body = (await response.json()) as {
        runtime?: RuntimePublicDto;
        health?: { version?: string };
        error?: { code?: string; message?: string };
      };
      if (!response.ok || !body.runtime) {
        throw apiError(body.error, "La connexion SSH a échoué.");
      }
      setToken("");
      setSshPassword("");
      onRuntimeChange(body.runtime);
      setDiscovery(null);
      setSelected(null);
      setConnectionStatus({
        kind: "ok",
        message: `Connexion testée et enregistrée${body.health?.version ? ` · ${body.health.version}` : ""}.`,
      });
    } catch (reason) {
      setConnectionStatus({ kind: "error", message: errorMessage(reason) });
    }
  }

  async function scanHostKey() {
    setConnectionStatus({ kind: "loading", label: "Lecture de l’empreinte SSH…" });
    try {
      const response = await fetch("/api/runtime/ssh/host-key/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host: sshHost.trim(), port: parsePort(sshPort) }),
      });
      const body = (await response.json()) as {
        hostKey?: HostKey;
        error?: { message?: string };
      };
      if (!response.ok || !body.hostKey) {
        throw new Error(body.error?.message ?? "Impossible de lire l’empreinte SSH.");
      }
      setHostKey(body.hostKey);
      setConnectionStatus({ kind: "idle" });
    } catch (reason) {
      setConnectionStatus({ kind: "error", message: errorMessage(reason) });
    }
  }

  async function acceptHostKey() {
    if (!hostKey) return;
    setConnectionStatus({ kind: "loading", label: "Enregistrement de l’empreinte vérifiée…" });
    try {
      const response = await fetch("/api/runtime/ssh/host-key", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(hostKey),
      });
      const body = (await response.json()) as {
        accepted?: boolean;
        error?: { message?: string };
      };
      if (!response.ok || !body.accepted) {
        throw new Error(body.error?.message ?? "L’empreinte n’a pas été enregistrée.");
      }
      setHostKey(null);
      setConnectionStatus({ kind: "ok", message: "Empreinte enregistrée. Vous pouvez relancer le test." });
    } catch (reason) {
      setConnectionStatus({ kind: "error", message: errorMessage(reason) });
    }
  }

  async function discoverWorkspace() {
    setWorkspaceStatus({ kind: "loading", label: "Recherche de la configuration Hermes sur le VPS…" });
    setDiscovery(null);
    setSelected(null);
    try {
      const response = await fetch("/api/runtime/ssh/workspace/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedRevision: runtime?.configRevision ?? undefined }),
      });
      const body = (await response.json()) as {
        discovery?: RuntimeSshWorkspaceDiscoveryDto;
        error?: { message?: string };
      };
      if (!response.ok || !body.discovery) {
        throw new Error(body.error?.message ?? "La recherche distante a échoué.");
      }
      setDiscovery(body.discovery);
      const recommended = body.discovery.candidates.find((candidate) => candidate.recommended);
      setSelected(recommended ?? body.discovery.candidates[0] ?? null);
      setWorkspaceStatus({
        kind: "ok",
        message: body.discovery.candidates.length
          ? `${body.discovery.candidates.length} dossier${body.discovery.candidates.length > 1 ? "s" : ""} évalué${body.discovery.candidates.length > 1 ? "s" : ""}.`
          : "Aucun dossier sûr détecté. Utilisez la vérification manuelle.",
      });
    } catch (reason) {
      setWorkspaceStatus({ kind: "error", message: errorMessage(reason) });
    }
  }

  async function checkManualWorkspace() {
    if (!manualHostPath.trim()) {
      setWorkspaceStatus({ kind: "error", message: "Indiquez le chemin présent sur le VPS." });
      return;
    }
    setWorkspaceStatus({ kind: "loading", label: "Vérification du dossier distant…" });
    try {
      const response = await fetch("/api/runtime/ssh/workspace/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          remoteWorkdir: manualHostPath.trim(),
          ...(manualHermesPath.trim() ? { remoteHermesWorkdir: manualHermesPath.trim() } : {}),
        }),
      });
      const body = (await response.json()) as {
        candidate?: RuntimeSshWorkspaceCandidateDto;
        error?: { message?: string };
      };
      if (!response.ok || !body.candidate) {
        throw new Error(body.error?.message ?? "Ce dossier ne peut pas être utilisé.");
      }
      setSelected(body.candidate);
      setWorkspaceStatus({ kind: "ok", message: "Chemin vérifié. Confirmez son activation." });
      setConfirming(true);
    } catch (reason) {
      setWorkspaceStatus({ kind: "error", message: errorMessage(reason) });
    }
  }

  async function activateWorkspace() {
    if (!selected || runtime?.configRevision == null) return;
    setWorkspaceStatus({ kind: "loading", label: "Activation et vérification du dossier…" });
    try {
      const response = await fetch("/api/runtime/ssh/workspace", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          remoteWorkdir: selected.remoteWorkdir,
          remoteHermesWorkdir: selected.remoteHermesWorkdir,
          create: selected.requiresCreation,
          alignHermesCwd: selected.source !== "terminal_cwd",
          expectedRevision: runtime.configRevision,
        }),
      });
      const body = (await response.json()) as {
        runtime?: RuntimePublicDto;
        error?: { message?: string };
      };
      if (!response.ok || !body.runtime) {
        throw new Error(body.error?.message ?? "Le dossier n’a pas pu être activé.");
      }
      onRuntimeChange(body.runtime);
      setConfirming(false);
      setWorkspaceStatus({ kind: "ok", message: "Dossier actif. Le runtime est prêt pour les missions." });
    } catch (reason) {
      setWorkspaceStatus({ kind: "error", message: errorMessage(reason) });
    }
  }

  function applyHost(value: string) {
    setSshHost(value);
    const match = configHosts.find((candidate) => candidate.alias === value);
    if (!match) return;
    if (match.user) setSshUser(match.user);
    if (match.port) setSshPort(String(match.port));
  }

  return (
    <div className="space-y-7">
      <section aria-labelledby="ssh-step-1-title" className="space-y-5">
        <StepHeading
          number={1}
          title="Connexion SSH et Hermes"
          description="La Console vérifie SSH, ouvre le tunnel et appelle réellement l’API Hermes avant de sauvegarder."
          state={connectionSaved ? "done" : "current"}
        />

        <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
          <Field
            icon={ServerIcon}
            label="Hôte SSH"
            hint={configHosts.length ? "IP, nom DNS ou alias de la configuration SSH du serveur." : "IP ou nom DNS du VPS."}
          >
            <input
              list="ssh-config-hosts"
              value={sshHost}
              onChange={(event) => applyHost(event.target.value)}
              placeholder="203.0.113.20"
              disabled={busy}
              className={inputClass}
            />
            <datalist id="ssh-config-hosts">
              {configHosts.map((host) => (
                <option key={host.alias} value={host.alias}>{host.hostname ?? host.alias}</option>
              ))}
            </datalist>
          </Field>
          <Field icon={NetworkIcon} label="Port SSH" hint="22 par défaut.">
            <input
              inputMode="numeric"
              value={sshPort}
              onChange={(event) => setSshPort(event.target.value)}
              disabled={busy}
              className={inputClass}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field icon={UserRoundIcon} label="Utilisateur" hint="Compte qui ouvre la session distante.">
            <input
              value={sshUser}
              onChange={(event) => setSshUser(event.target.value)}
              placeholder="root"
              autoComplete="off"
              disabled={busy}
              className={inputClass}
            />
          </Field>
          {sshAuth === "password" ? (
            <Field
              icon={KeyRoundIcon}
              label="Mot de passe SSH"
              hint={runtime?.sshPasswordConfigured ? "Déjà chiffré. Laissez vide si la cible ne change pas." : "Stocké chiffré côté serveur."}
            >
              <input
                type="password"
                autoComplete="new-password"
                value={sshPassword}
                onChange={(event) => setSshPassword(event.target.value)}
                placeholder={runtime?.sshPasswordConfigured ? "Inchangé si vide" : "Requis"}
                disabled={busy}
                className={inputClass}
              />
            </Field>
          ) : <div />}
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <Choice
            active={sshAuth === "agent"}
            onClick={() => setSshAuth("agent")}
            title="Clé ou agent SSH"
            description="Utilise ssh, les clés et ProxyJump disponibles pour apps/server."
          />
          <Choice
            active={sshAuth === "password"}
            onClick={() => setSshAuth("password")}
            title="Mot de passe"
            description="Utilise SSH2 avec vérification stricte de l’empreinte du VPS."
          />
        </div>

        <Field icon={NetworkIcon} label="URL Hermes vue depuis le VPS" hint="Généralement http://127.0.0.1:8642. Le transport est déjà chiffré par SSH.">
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
          htmlFor="ssh-runtime-token"
          action={<HermesTokenGuide />}
          hint={runtime?.tokenConfigured ? "Déjà chiffré. Laissez vide uniquement si la cible ne change pas." : "API_SERVER_KEY d’Hermes."}
        >
          <input
            id="ssh-runtime-token"
            type="password"
            autoComplete="new-password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder={runtime?.tokenConfigured ? "Inchangé si cible identique" : "Requis"}
            disabled={busy}
            className={inputClass}
          />
        </Field>

        {hostKey ? (
          <div className="space-y-3 rounded-xl border border-warn-100 bg-warn-soft p-3">
            <div className="flex items-start gap-2">
              <ShieldCheckIcon className="mt-0.5 size-4 shrink-0 text-warn-700" />
              <div className="min-w-0">
                <p className="text-[0.75rem] font-semibold text-warn-700">Vérifiez l’empreinte hors bande</p>
                <p className="mt-1 text-[0.6875rem] leading-5 text-warn-700">
                  Comparez cette valeur avec celle fournie par votre hébergeur ou affichée directement sur le VPS.
                </p>
                <code className="mt-2 block break-all rounded-lg bg-card px-2.5 py-2 font-mono text-[0.6875rem] text-foreground">
                  {hostKey.keyType} · {hostKey.fingerprintSha256}
                </code>
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button onClick={() => setHostKey(null)}>Annuler</Button>
              <Button variant="primary" onClick={() => void acceptHostKey()}>
                J’ai vérifié cette empreinte
              </Button>
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-3 border-t border-seam pt-4 sm:flex-row sm:items-center sm:justify-between">
          <StatusMessage
            status={connectionStatus}
            idle="Les informations ne sont enregistrées qu’après un test SSH et Hermes réussi."
          />
          <div className="flex flex-wrap gap-2 sm:shrink-0">
            <Button type="button" disabled={busy || !sshHost.trim()} onClick={() => void scanHostKey()}>
              Vérifier l’empreinte
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={busy}
              leadingIcon={connectionBusy ? SpinnerIcon : TerminalIcon}
              onClick={() => void connect()}
            >
              Tester et enregistrer
            </Button>
          </div>
        </div>
        {connectionDirty ? (
          <p className="text-[0.6875rem] text-warn-700">
            La cible affichée diffère de la configuration enregistrée. Relancez « Tester et enregistrer » avant la recherche du dossier.
          </p>
        ) : null}
      </section>

      <section aria-labelledby="ssh-step-2-title" className="space-y-5 border-t border-seam pt-6">
        <StepHeading
          number={2}
          title="Dossier de travail Hermes"
          description="La Console dépose les entrées et récupère les sorties dans un dossier dédié, jamais dans la racine des secrets Hermes."
          state={workspaceReady ? "done" : connectionSaved ? "current" : "locked"}
        />

        {!connectionSaved ? (
          <LockedMessage>Testez et enregistrez d’abord la connexion SSH.</LockedMessage>
        ) : (
          <>
            <div className="grid gap-3 text-[0.6875rem] leading-5 sm:grid-cols-3">
              <Definition term="HERMES_HOME">Configuration, secrets et sessions. Sa racine n’est pas proposée comme workspace.</Definition>
              <Definition term="terminal.cwd">Dossier d’exécution utilisé par les outils Hermes.</Definition>
              <Definition term="Workspace Console">Sous-dossiers isolés dans runs/&lt;mission&gt;.</Definition>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[0.75rem] font-medium">Détection guidée</p>
                <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">
                  Hermes natif, Docker, terminal.cwd et montages sont vérifiés à distance.
                </p>
              </div>
              <Button
                disabled={busy}
                leadingIcon={busy ? SpinnerIcon : FolderSearchIcon}
                onClick={() => void discoverWorkspace()}
              >
                Rechercher sur le VPS
              </Button>
            </div>

            {workspaceBusy && workspaceStatus.kind === "loading" && workspaceStatus.label.includes("Recherche") ? <WorkspaceSkeleton /> : null}
            {discovery ? (
              <DiscoveryResults
                discovery={discovery}
                selected={selected}
                onSelect={(candidate) => {
                  setSelected(candidate);
                  setConfirming(false);
                }}
              />
            ) : null}

            <StatusMessage
              status={workspaceStatus}
              idle="La recherche et l’activation ne modifient rien sans votre confirmation."
            />

            {selected ? (
              <div className="flex flex-col gap-3 rounded-xl bg-inset p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-[0.75rem] font-medium">Dossier sélectionné</p>
                  <code className="mt-1 block break-all font-mono text-[0.6875rem] text-muted-foreground">
                    VPS {selected.remoteWorkdir}
                  </code>
                  {selected.remoteHermesWorkdir !== selected.remoteWorkdir ? (
                    <code className="block break-all font-mono text-[0.6875rem] text-muted-foreground">
                      Hermes {selected.remoteHermesWorkdir}
                    </code>
                  ) : null}
                </div>
                <Button variant="primary" disabled={!selected.writable} onClick={() => setConfirming(true)}>
                  Utiliser ce dossier
                </Button>
              </div>
            ) : null}

            <details className="group border-t border-seam pt-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[0.75rem] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30">
                Vérifier un chemin manuel
                <ChevronDownIcon className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
              </summary>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field icon={FolderCheckIcon} label="Chemin sur le VPS" hint="Chemin absolu accessible par SFTP.">
                  <input
                    value={manualHostPath}
                    onChange={(event) => setManualHostPath(event.target.value)}
                    placeholder="/srv/hermes/workspace"
                    className={inputClass}
                  />
                </Field>
                <Field icon={TerminalIcon} label="Chemin vu par Hermes" hint="Identique en natif, différent dans Docker.">
                  <input
                    value={manualHermesPath}
                    onChange={(event) => setManualHermesPath(event.target.value)}
                    placeholder="/opt/data/workspace"
                    className={inputClass}
                  />
                </Field>
                <div className="sm:col-span-2 sm:justify-self-end">
                  <Button disabled={busy} onClick={() => void checkManualWorkspace()}>
                    Vérifier ce chemin
                  </Button>
                </div>
              </div>
            </details>

            {confirming && selected ? (
              <div className="space-y-3 rounded-xl border border-warn-100 bg-warn-soft p-3">
                <div className="flex items-start gap-2 text-warn-700">
                  <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
                  <div>
                    <p className="text-[0.75rem] font-semibold">Confirmer l’activation</p>
                    <p className="mt-1 text-[0.6875rem] leading-5">
                      {selected.requiresCreation ? "Le dossier sera créé avec des droits restreints. " : ""}
                      {selected.source !== "terminal_cwd" ? "Hermes sera configuré pour utiliser ce chemin comme terminal.cwd." : "Le terminal.cwd actuel sera conservé."}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button onClick={() => setConfirming(false)}>Annuler</Button>
                  <Button variant="primary" disabled={busy} onClick={() => void activateWorkspace()}>
                    Confirmer et activer
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </section>

      <section aria-labelledby="ssh-step-3-title" className="border-t border-seam pt-6">
        <AdvancedProvisioning
          target={{ host: sshHost, port: Number(sshPort), user: sshUser, auth: sshAuth, password: sshPassword }}
          remoteBaseUrl={baseUrl}
          token={token}
          defaultWorkdir={selected?.remoteWorkdir ?? manualHostPath}
          disabled={busy}
          onRuntimeChange={onRuntimeChange}
        />
      </section>
    </div>
  );
}

function DiscoveryResults({
  discovery,
  selected,
  onSelect,
}: {
  discovery: RuntimeSshWorkspaceDiscoveryDto;
  selected: RuntimeSshWorkspaceCandidateDto | null;
  onSelect: (candidate: RuntimeSshWorkspaceCandidateDto) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-[0.6875rem] text-muted-foreground">
        <Badge tone={discovery.installation.mode === "unknown" ? "warning" : "info"}>
          Hermes {discovery.installation.mode}
        </Badge>
        {discovery.installation.resolvedTerminalCwd ? (
          <span>terminal.cwd : <code className="font-mono">{discovery.installation.resolvedTerminalCwd}</code></span>
        ) : null}
      </div>
      <div role="radiogroup" aria-label="Dossiers de travail détectés" className="divide-y divide-seam overflow-hidden rounded-xl border border-input">
        {discovery.candidates.map((candidate) => {
          const active = selected?.id === candidate.id;
          return (
            <button
              key={candidate.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onSelect(candidate)}
              className={cn(
                "grid w-full gap-2 bg-card p-3 text-left transition-colors hover:bg-muted sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center",
                active && "bg-info-soft",
              )}
            >
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2">
                  <strong className="text-[0.75rem] font-medium">{candidate.label}</strong>
                  {candidate.recommended ? <Badge tone="success">Recommandé</Badge> : null}
                  {candidate.requiresCreation ? <Badge tone="neutral">À créer</Badge> : null}
                </span>
                <code className="mt-1 block break-all font-mono text-[0.6875rem] text-muted-foreground">
                  {candidate.remoteWorkdir}
                </code>
                {candidate.remoteHermesWorkdir !== candidate.remoteWorkdir ? (
                  <code className="block break-all font-mono text-[0.6875rem] text-muted-foreground">
                    Hermes : {candidate.remoteHermesWorkdir}
                  </code>
                ) : null}
                {candidate.warning ? <span className="mt-1 block text-[0.6875rem] text-warn-700">{candidate.warning}</span> : null}
              </span>
              <span className="flex items-center gap-2 text-[0.6875rem] text-muted-foreground">
                {candidate.writable ? <CheckCircle2Icon className="size-4 text-pos-700" /> : <AlertTriangleIcon className="size-4 text-warn-700" />}
                {candidate.writable ? "Accessible" : candidate.requiresCreation ? "Créable" : "À corriger"}
              </span>
            </button>
          );
        })}
      </div>
      {discovery.blockers.map((blocker) => (
        <p key={blocker} className="flex items-start gap-2 text-[0.6875rem] text-destructive">
          <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" />{blocker}
        </p>
      ))}
    </div>
  );
}

function AdvancedProvisioning({
  target,
  remoteBaseUrl,
  token,
  defaultWorkdir,
  disabled,
  onRuntimeChange,
}: {
  target: { host: string; port: number; user: string; auth: SshAuth; password: string };
  remoteBaseUrl: string;
  token: string;
  defaultWorkdir: string;
  disabled: boolean;
  onRuntimeChange: (runtime: RuntimePublicDto) => void;
}) {
  const [mode, setMode] = useState<RuntimeProvisionMode>("docker");
  const [workdir, setWorkdir] = useState(defaultWorkdir);
  const [plan, setPlan] = useState<RuntimeSshPlanDto | null>(null);
  const [job, setJob] = useState<RuntimeSshProvisionJobDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const running = job?.status === "running" || job?.status === "queued";

  const effectiveWorkdir = workdir || defaultWorkdir;

  function payload() {
    if (!target.host.trim() || !target.user.trim()) throw new Error("Renseignez d’abord la cible SSH.");
    if (!effectiveWorkdir.trim()) throw new Error("Indiquez le futur dossier de données Hermes sur le VPS.");
    return {
      target: {
        host: target.host.trim(),
        port: parsePort(String(target.port)),
        user: target.user.trim(),
        auth: target.auth,
        ...(target.password ? { password: target.password } : {}),
      },
      mode,
      remoteBaseUrl: remoteBaseUrl.trim(),
      remoteWorkdir: effectiveWorkdir.trim(),
      ...(token.trim() ? { token: token.trim() } : {}),
    };
  }

  async function preparePlan() {
    setError(null);
    try {
      const response = await fetch("/api/runtime/ssh/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload()),
      });
      const body = (await response.json()) as { plan?: RuntimeSshPlanDto; error?: { message?: string } };
      if (!response.ok || !body.plan) throw new Error(body.error?.message ?? "Plan impossible.");
      setPlan(body.plan);
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  async function provision() {
    if (!plan || plan.blockers.length) return;
    setError(null);
    try {
      const response = await fetch("/api/runtime/ssh/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload(), confirmation: plan.confirmation }),
      });
      const body = (await response.json()) as { job?: RuntimeSshProvisionJobDto; error?: { message?: string } };
      if (!response.ok || !body.job) throw new Error(body.error?.message ?? "Provisioning impossible.");
      setJob(body.job);
      const events = new EventSource(`/api/runtime/ssh/provision/${body.job.id}/events`);
      events.addEventListener("update", (event) => {
        const update = JSON.parse((event as MessageEvent).data) as { job: RuntimeSshProvisionJobDto };
        setJob(update.job);
        if (update.job.status === "succeeded" || update.job.status === "failed") {
          events.close();
          if (update.job.runtime) onRuntimeChange(update.job.runtime);
        }
      });
      events.onerror = () => {
        events.close();
        setError("Le flux de progression a été interrompu.");
      };
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30">
        <StepHeading
          number={3}
          title="Installation ou réparation"
          description="À utiliser uniquement si Hermes est absent ou si son installation distante doit être réparée."
          state="optional"
        />
        <ChevronDownIcon className="mt-2 size-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
      </summary>
      <div className="mt-5 space-y-4 pl-0 sm:pl-10">
        <div className="grid gap-2 sm:grid-cols-2">
          <Choice active={mode === "docker"} onClick={() => { setMode("docker"); setPlan(null); }} title="Hermes Docker" description="Déploiement isolé avec données persistantes et workspace dédié." />
          <Choice active={mode === "native"} onClick={() => { setMode("native"); setPlan(null); }} title="Hermes natif" description="Installation pour l’utilisateur SSH avec service systemd." />
        </div>
        <Field icon={FolderCheckIcon} label="Racine persistante sur le VPS" hint="Le plan exact sera affiché avant toute mutation.">
          <input value={effectiveWorkdir} onChange={(event) => setWorkdir(event.target.value)} placeholder="/srv/hermes-console" className={inputClass} />
        </Field>
        {plan ? (
          <div className="space-y-2 rounded-xl bg-inset p-3">
            {plan.steps.map((step) => (
              <div key={step.id} className="text-[0.6875rem] leading-5">
                <strong className="font-medium">{step.label}</strong>
                <span className="text-muted-foreground"> : {step.description}</span>
                {step.commandPreview ? <code className="mt-1 block overflow-x-auto rounded bg-card px-2 py-1 font-mono text-[0.625rem] text-muted-foreground">{step.commandPreview}</code> : null}
              </div>
            ))}
            {plan.blockers.map((blocker) => <p key={blocker} className="text-[0.6875rem] text-destructive">{blocker}</p>)}
          </div>
        ) : null}
        {job ? (
          <div role="status" className="space-y-2 text-[0.6875rem]">
            <div className="flex justify-between gap-3"><span>{job.message}</span><span className="font-mono">{job.progress}%</span></div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${job.progress}%` }} /></div>
          </div>
        ) : null}
        {error ? <p role="alert" className="text-[0.6875rem] text-destructive">{error}</p> : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button disabled={disabled || running} onClick={() => void preparePlan()}>Préparer le plan</Button>
          <Button variant="primary" disabled={disabled || running || !plan || plan.blockers.length > 0} leadingIcon={running ? SpinnerIcon : PlayIcon} onClick={() => void provision()}>Confirmer et installer</Button>
        </div>
      </div>
    </details>
  );
}

function StepHeading({ number, title, description, state }: { number: number; title: string; description: string; state: "current" | "done" | "locked" | "optional" }) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full font-mono text-[0.6875rem] font-medium", state === "done" ? "bg-pos-100 text-pos-700" : state === "current" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>{state === "done" ? "✓" : number}</span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2"><h3 id={`ssh-step-${number}-title`} className="text-[0.875rem] font-semibold">{title}</h3>{state === "locked" ? <Badge>Verrouillé</Badge> : state === "optional" ? <Badge>Avancé</Badge> : null}</div>
        <p className="mt-1 max-w-[70ch] text-[0.6875rem] leading-5 text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function Choice({ active, onClick, title, description }: { active: boolean; onClick: () => void; title: string; description: string }) {
  return <button type="button" aria-pressed={active} onClick={onClick} className={cn("flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors", active ? "border-ring bg-info-soft" : "border-input bg-card hover:bg-muted")}><span aria-hidden className={cn("mt-0.5 size-3.5 shrink-0 rounded-full border", active ? "border-primary bg-primary ring-2 ring-primary/15" : "border-input")} /><span><span className="block text-[0.75rem] font-medium">{title}</span><span className="mt-0.5 block text-[0.625rem] leading-4 text-muted-foreground">{description}</span></span></button>;
}

function Definition({ term, children }: { term: string; children: React.ReactNode }) {
  return <div className="border-t border-seam pt-2"><code className="font-mono text-[0.6875rem] text-foreground">{term}</code><p className="mt-1 text-muted-foreground">{children}</p></div>;
}

function LockedMessage({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl bg-inset p-3 text-[0.6875rem] text-muted-foreground">{children}</p>;
}

function WorkspaceSkeleton() {
  return <div className="divide-y divide-seam overflow-hidden rounded-xl border border-input" role="status" aria-label="Recherche des dossiers distants">{[0, 1, 2].map((item) => <div key={item} className="space-y-2 bg-card p-3"><div className="h-3 w-36 animate-pulse rounded bg-muted motion-reduce:animate-none" /><div className="h-3 w-3/4 animate-pulse rounded bg-muted motion-reduce:animate-none" /></div>)}</div>;
}

function SpinnerIcon({ className }: { className?: string }) {
  return <LoaderCircleIcon className={cn(className, "animate-spin motion-reduce:animate-none")} />;
}

function parsePort(value: string) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("Port SSH invalide (1 à 65535).");
  return port;
}

function apiError(error: { code?: string; message?: string } | undefined, fallback: string) {
  const next = new Error(error?.message ?? fallback) as Error & { code?: string };
  next.code = error?.code;
  return next;
}
