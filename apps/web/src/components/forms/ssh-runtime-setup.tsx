"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  FolderCheckIcon,
  FolderSearchIcon,
  HardDriveIcon,
  KeyRoundIcon,
  LoaderCircleIcon,
  LockKeyholeIcon,
  NetworkIcon,
  PlayIcon,
  ServerIcon,
  ShieldCheckIcon,
  TerminalIcon,
  UserRoundIcon,
} from "lucide-react";
import type {
  RuntimeProvisionMode,
  RuntimeCredentialPlanDto,
  RuntimePublicDto,
  RuntimeSshPlanDto,
  RuntimeSshProvisionJobDto,
  RuntimeSshStorageMigrationJobDto,
  RuntimeSshStorageMigrationPlanDto,
  RuntimeSshWorkspaceCandidateDto,
  RuntimeSshWorkspaceDiscoveryDto,
} from "@console/core/types/api";
import { HermesTokenGuide } from "@/components/settings/hermes-token-guide";
import { Badge, Button } from "@/components/ui/boardui";
import { useRuntimeMutation } from "@/components/settings/runtime-mutation-provider";
import { cn } from "@/lib/cn";
import {
  canReuseSshPassword,
  canReuseSshRuntimeToken,
  isSameSshConnectionIdentity,
} from "@/lib/runtime-secret-reuse";
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
  section = "connection",
  onRuntimeChange,
}: {
  runtime: RuntimePublicDto | null;
  section?: "connection" | "workspace" | "advanced";
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
  const [storageMigrationBusy, setStorageMigrationBusy] = useState(false);
  const workspaceAutoRevisionRef = useRef<number | null>(null);
  const { runMutation } = useRuntimeMutation();

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
  const connectionIdentity = {
    baseUrl,
    sshHost,
    sshPort: Number(sshPort),
    sshUser,
    sshAuth,
  };
  const sameConnectionIdentity = isSameSshConnectionIdentity(runtime, connectionIdentity);
  const tokenReusable = canReuseSshRuntimeToken(runtime, connectionIdentity);
  const passwordReusable = canReuseSshPassword(runtime, connectionIdentity);
  const connectionDirty = Boolean(
    connectionStored && (!sameConnectionIdentity || token.trim() || sshPassword),
  );
  const connectionSaved = connectionStored && !connectionDirty;
  const workspaceReady = connectionSaved && runtime.workspaceStatus === "ready";
  const connectionBusy = connectionStatus.kind === "loading";
  const workspaceBusy = workspaceStatus.kind === "loading";
  const busy = connectionBusy || workspaceBusy || storageMigrationBusy;

  function connectionPayload() {
    const port = parsePort(sshPort);
    if (!sshHost.trim() || !sshUser.trim()) {
      throw new Error("Indiquez l’hôte et l’utilisateur SSH.");
    }
    if (!baseUrl.trim()) throw new Error("Indiquez l’URL Hermes distante.");
    if (
      sshAuth === "password" &&
      !sshPassword &&
      !passwordReusable
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
      ...(!token.trim() && !tokenReusable ? { credentialMode: "import" as const } : {}),
    };
  }

  async function connect() {
    setConnectionStatus({ kind: "loading", label: "Test SSH, tunnel et API Hermes…" });
    setHostKey(null);
    try {
      const body = await runMutation("Connexion SSH et vérification Hermes", async (signal) => {
        const response = await fetch("/api/runtime/ssh/connect", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Hermes-Toast": "0",
          },
          signal,
          body: JSON.stringify(connectionPayload()),
        });
        const nextBody = (await response.json()) as {
          runtime?: RuntimePublicDto;
          health?: { version?: string };
          error?: { code?: string; message?: string };
        };
        if (!response.ok || !nextBody.runtime) {
          throw apiError(nextBody.error, "La connexion SSH a échoué.");
        }
        return nextBody;
      });
      setToken("");
      setSshPassword("");
      onRuntimeChange(body.runtime!);
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
      const body = await runMutation("Lecture de l’empreinte SSH", async (signal) => {
        const response = await fetch("/api/runtime/ssh/host-key/scan", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Hermes-Toast": "0",
          },
          signal,
          body: JSON.stringify({ host: sshHost.trim(), port: parsePort(sshPort) }),
        });
        const nextBody = (await response.json()) as {
          hostKey?: HostKey;
          error?: { message?: string };
        };
        if (!response.ok || !nextBody.hostKey) {
          throw new Error(nextBody.error?.message ?? "Impossible de lire l’empreinte SSH.");
        }
        return nextBody;
      });
      setHostKey(body.hostKey!);
      setConnectionStatus({ kind: "idle" });
    } catch (reason) {
      setConnectionStatus({ kind: "error", message: errorMessage(reason) });
    }
  }

  async function acceptHostKey() {
    if (!hostKey) return;
    setConnectionStatus({ kind: "loading", label: "Enregistrement de l’empreinte vérifiée…" });
    try {
      await runMutation("Enregistrement de l’empreinte SSH", async (signal) => {
        const response = await fetch("/api/runtime/ssh/host-key", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "X-Hermes-Toast": "updated",
          },
          signal,
          body: JSON.stringify(hostKey),
        });
        const body = (await response.json()) as {
          accepted?: boolean;
          error?: { message?: string };
        };
        if (!response.ok || !body.accepted) {
          throw new Error(body.error?.message ?? "L’empreinte n’a pas été enregistrée.");
        }
        return body;
      });
      setHostKey(null);
      setConnectionStatus({ kind: "ok", message: "Empreinte enregistrée. Vous pouvez relancer le test." });
    } catch (reason) {
      setConnectionStatus({ kind: "error", message: errorMessage(reason) });
    }
  }

  const discoverWorkspace = useCallback(async (expectedRevision = runtime?.configRevision) => {
    setWorkspaceStatus({ kind: "loading", label: "Recherche de la configuration Hermes sur le VPS…" });
    setDiscovery(null);
    setSelected(null);
    try {
      const body = await runMutation("Recherche du workspace Hermes", async (signal) => {
        const response = await fetch("/api/runtime/ssh/workspace/discover", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Hermes-Toast": "0",
          },
          signal,
          body: JSON.stringify({ expectedRevision }),
        });
        const nextBody = (await response.json()) as {
          discovery?: RuntimeSshWorkspaceDiscoveryDto;
          error?: { message?: string };
        };
        if (!response.ok || !nextBody.discovery) {
          throw new Error(nextBody.error?.message ?? "La recherche distante a échoué.");
        }
        return nextBody;
      });
      setDiscovery(body.discovery!);
      const recommended = body.discovery!.candidates.find((candidate) => candidate.recommended);
      setSelected(recommended ?? body.discovery!.candidates[0] ?? null);
      setWorkspaceStatus({
        kind: "ok",
        message: body.discovery!.candidates.length
          ? `${body.discovery!.candidates.length} dossier${body.discovery!.candidates.length > 1 ? "s" : ""} évalué${body.discovery!.candidates.length > 1 ? "s" : ""}.`
          : "Aucun dossier sûr détecté. Utilisez la vérification manuelle.",
      });
    } catch (reason) {
      setWorkspaceStatus({ kind: "error", message: errorMessage(reason) });
    }
  }, [runMutation, runtime?.configRevision]);

  useEffect(() => {
    const revision = runtime?.configRevision ?? null;
    if (
      section !== "workspace" ||
      !connectionSaved ||
      revision === null ||
      workspaceAutoRevisionRef.current === revision
    ) {
      return;
    }
    workspaceAutoRevisionRef.current = revision;
    void discoverWorkspace(revision);
  }, [connectionSaved, discoverWorkspace, runtime?.configRevision, section]);

  async function checkManualWorkspace() {
    if (!manualHostPath.trim()) {
      setWorkspaceStatus({ kind: "error", message: "Indiquez le chemin présent sur le VPS." });
      return;
    }
    setWorkspaceStatus({ kind: "loading", label: "Vérification du dossier distant…" });
    try {
      const body = await runMutation("Vérification du workspace distant", async (signal) => {
        const response = await fetch("/api/runtime/ssh/workspace/check", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Hermes-Toast": "0",
          },
          signal,
          body: JSON.stringify({
            remoteWorkdir: manualHostPath.trim(),
            ...(manualHermesPath.trim() ? { remoteHermesWorkdir: manualHermesPath.trim() } : {}),
          }),
        });
        const nextBody = (await response.json()) as {
          candidate?: RuntimeSshWorkspaceCandidateDto;
          error?: { message?: string };
        };
        if (!response.ok || !nextBody.candidate) {
          throw new Error(nextBody.error?.message ?? "Ce dossier ne peut pas être utilisé.");
        }
        return nextBody;
      });
      setSelected(body.candidate!);
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
      const body = await runMutation("Activation du workspace Hermes", async (signal) => {
        const response = await fetch("/api/runtime/ssh/workspace", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "X-Hermes-Toast": "updated",
          },
          signal,
          body: JSON.stringify({
            remoteWorkdir: selected.remoteWorkdir,
            remoteHermesWorkdir: selected.remoteHermesWorkdir,
            create: selected.requiresCreation,
            alignHermesCwd: selected.source !== "terminal_cwd",
            expectedRevision: runtime.configRevision,
          }),
        });
        const nextBody = (await response.json()) as {
          runtime?: RuntimePublicDto;
          error?: { message?: string };
        };
        if (!response.ok || !nextBody.runtime) {
          throw new Error(nextBody.error?.message ?? "Le dossier n’a pas pu être activé.");
        }
        return nextBody;
      });
      onRuntimeChange(body.runtime!);
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
      {section === "connection" ? (
        <section aria-labelledby="ssh-step-1-title" className="space-y-5">
        <StepHeading
          number={1}
          title="Connexion SSH et Hermes"
          description="La Console vérifie SSH, ouvre le tunnel et appelle réellement l’API Hermes avant de sauvegarder."
          state={connectionSaved ? "done" : "current"}
        />

        <div className="flex items-center gap-2 overflow-x-auto rounded-xl bg-inset px-3 py-2 font-mono text-[0.6875rem] text-muted-foreground">
          <TerminalIcon className="size-3.5 shrink-0" aria-hidden />
          <span className="whitespace-nowrap">
            ssh {sshUser.trim() || "user"}@{sshHost.trim() || "hôte"}:{sshPort || "22"}
            <span className="mx-1.5 text-muted-foreground/60">→</span>
            {baseUrl.trim() || "http://127.0.0.1:8642"}
          </span>
        </div>

        <div className="divide-y divide-seam overflow-hidden rounded-2xl border border-input bg-card">
          <div className="space-y-4 p-4">
            <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
              Cible SSH
            </p>
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

            <div>
              <span className="flex items-center gap-2 text-[0.8125rem] font-medium">
                <ShieldCheckIcon className="size-3.5 text-muted-foreground" aria-hidden />
                Authentification SSH
              </span>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <AuthModeToggle value={sshAuth} onChange={setSshAuth} disabled={busy} />
                <span className="text-[0.6875rem] text-muted-foreground">
                  {sshAuth === "agent"
                    ? "Utilise ssh, les clés et ProxyJump disponibles pour apps/server."
                    : "Utilise SSH2 avec vérification stricte de l’empreinte du VPS."}
                </span>
              </div>
            </div>

            {sshAuth === "password" ? (
              <Field
                icon={LockKeyholeIcon}
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
            ) : null}
          </div>

          <div className="space-y-4 bg-inset/40 p-4">
            <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
              Point d’accès Hermes
            </p>
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
                hint={tokenReusable
                  ? "Déjà chiffré pour cette cible. Laissez vide pour le conserver."
                  : "Laissez vide pour importer automatiquement API_SERVER_KEY via SSH. Saisie manuelle disponible en secours."}
            >
              <input
                id="ssh-runtime-token"
                type="password"
                autoComplete="new-password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder={tokenReusable ? "Inchangé pour cette cible" : "Import automatique si vide"}
                disabled={busy}
                className={inputClass}
              />
            </Field>
            {connectionSaved ? (
              <CredentialAutomation
                runtime={runtime}
                disabled={busy}
                onRuntimeChange={onRuntimeChange}
              />
            ) : null}
          </div>
        </div>

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
            idle="Le test SSH + Hermes est obligatoire avant l’étape 2 et l’enregistrement de la cible."
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
              Tester SSH + enregistrer
            </Button>
          </div>
        </div>
        {connectionDirty ? (
          <p className="text-[0.6875rem] text-warn-700">
            La cible affichée diffère de la configuration enregistrée. Relancez « Tester SSH + enregistrer » avant la recherche du dossier.
          </p>
        ) : null}
        </section>
      ) : null}

      {section === "workspace" ? (
        <section aria-labelledby="ssh-step-2-title" className="space-y-5">
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
                {workspaceBusy ? "Analyse…" : "Relancer"}
              </Button>
            </div>

            {workspaceBusy && workspaceStatus.kind === "loading" && workspaceStatus.label.includes("Recherche") ? <WorkspaceSkeleton /> : null}
            {discovery ? (
              <>
                <DiscoveryResults
                  discovery={discovery}
                  selected={selected}
                  onSelect={(candidate) => {
                    setSelected(candidate);
                    setConfirming(false);
                  }}
                />
                {discovery.storageMigration ? (
                  <StorageMigration
                    discovery={discovery}
                    disabled={connectionBusy || workspaceBusy}
                    onBusyChange={setStorageMigrationBusy}
                    onCompleted={(nextRuntime) => {
                      onRuntimeChange(nextRuntime);
                      void discoverWorkspace(nextRuntime.configRevision);
                    }}
                  />
                ) : null}
              </>
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
                    placeholder="/srv/hermes-console/data/workspace"
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
      ) : null}

      {section === "advanced" ? (
        <section aria-labelledby="ssh-step-3-title">
          <AdvancedProvisioning
            target={{ host: sshHost, port: Number(sshPort), user: sshUser, auth: sshAuth, password: sshPassword }}
            remoteBaseUrl={baseUrl}
            token={token}
            defaultWorkdir={selected?.remoteWorkdir ?? manualHostPath}
            disabled={busy}
            onRuntimeChange={onRuntimeChange}
          />
        </section>
      ) : null}
    </div>
  );
}

function CredentialAutomation({
  runtime,
  disabled,
  onRuntimeChange,
}: {
  runtime: RuntimePublicDto | null;
  disabled: boolean;
  onRuntimeChange: (runtime: RuntimePublicDto) => void;
}) {
  const [plan, setPlan] = useState<RuntimeCredentialPlanDto | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [busy, setBusy] = useState(false);
  const { runMutation } = useRuntimeMutation();

  async function createPlan(operation: "import" | "rotate") {
    if (!runtime?.configRevision) return;
    setBusy(true);
    setStatus({ kind: "loading", label: "Inspection sécurisée du VPS…" });
    try {
      const body = await runMutation("Préparation de l’opération credentials", async (signal) => {
        const response = await fetch("/api/runtime/credentials/plan", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Hermes-Toast": "0",
          },
          signal,
          body: JSON.stringify({ operation, expectedRevision: runtime.configRevision }),
        });
        const nextBody = (await response.json()) as {
          plan?: RuntimeCredentialPlanDto;
          error?: { code?: string; message?: string };
        };
        if (!response.ok || !nextBody.plan) {
          throw apiError(nextBody.error, "Impossible de préparer l’opération credentials.");
        }
        return nextBody;
      });
      setPlan(body.plan!);
      setStatus(
        body.plan!.blockers.length
          ? { kind: "idle" }
          : { kind: "ok", message: "Plan prêt. Aucune modification distante n’a encore été effectuée." },
      );
    } catch (reason) {
      setStatus({ kind: "error", message: errorMessage(reason) });
    } finally {
      setBusy(false);
    }
  }

  async function applyPlan() {
    if (!plan || !runtime?.configRevision || plan.blockers.length > 0) return;
    setBusy(true);
    setStatus({ kind: "loading", label: "Application, redémarrage et vérification Hermes…" });
    try {
      const body = await runMutation("Rotation et vérification du token Hermes", async (signal) => {
        const response = await fetch("/api/runtime/credentials", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Hermes-Toast": "0",
          },
          signal,
          body: JSON.stringify({
            planId: plan.id,
            confirmation: plan.confirmation,
            expectedRevision: runtime.configRevision,
          }),
        });
        const nextBody = (await response.json()) as {
          runtime?: RuntimePublicDto;
          operation?: { status?: string };
          error?: { code?: string; message?: string };
        };
        if (!response.ok || !nextBody.runtime) {
          throw apiError(nextBody.error, "L’opération credentials a échoué.");
        }
        return nextBody;
      });
      onRuntimeChange(body.runtime!);
      setPlan(null);
      setStatus({ kind: "ok", message: "Token Hermes configuré et vérifié. Sa valeur reste masquée." });
    } catch (reason) {
      const code = reason instanceof Error && "code" in reason && typeof reason.code === "string"
        ? reason.code
        : null;
      if (code === "RUNTIME_CREDENTIAL_PLAN_EXPIRED" || code === "RUNTIME_CREDENTIAL_CONFIRMATION_REQUIRED" || code === "RUNTIME_CONFIGURATION_CHANGED") {
        setPlan(null);
        setStatus({ kind: "error", message: "Cette confirmation n’est plus valide. Choisissez à nouveau l’action pour obtenir un plan actualisé." });
      } else {
        setStatus({ kind: "error", message: errorMessage(reason) });
      }
    } finally {
      setBusy(false);
    }
  }

  function cancelPlan() {
    if (busy) return;
    setPlan(null);
    setStatus({ kind: "idle" });
  }

  return (
    <div className="space-y-3 rounded-xl border border-seam bg-inset/60 p-3">
      <div>
        <p className="text-[0.75rem] font-medium">Gestion automatique du token</p>
        <p className="mt-1 text-[0.6875rem] leading-5 text-muted-foreground">
          La Console peut importer le token existant ou en générer un nouveau côté serveur. Sa valeur reste masquée, sauf révélation ponctuelle protégée par OTP.
        </p>
      </div>
      {!plan ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => void createPlan("import")}
            className="rounded-lg border border-input bg-card p-3 text-left transition-colors hover:border-ring hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="block text-[0.75rem] font-semibold">Importer le token existant</span>
            <span className="mt-1 block text-[0.6875rem] leading-5 text-muted-foreground">Lecture sécurisée depuis le VPS, sans redémarrage.</span>
          </button>
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => void createPlan("rotate")}
            className="rounded-lg border border-primary/50 bg-primary/5 p-3 text-left transition-colors hover:border-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="block text-[0.75rem] font-semibold">Générer un nouveau token</span>
            <span className="mt-1 block text-[0.6875rem] leading-5 text-muted-foreground">Modifie le VPS, redémarre Hermes et vérifie le nouveau token.</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3 rounded-lg border border-warn-100 bg-warn-soft p-3 text-warn-700">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[0.625rem] font-semibold uppercase tracking-wide">Étape 2 sur 2 · Confirmation</span>
            <span className="rounded-full bg-warn-100 px-2 py-0.5 text-[0.625rem] font-medium">Prévisualisation</span>
          </div>
          <div>
            <p className="text-[0.8125rem] font-semibold">
              {plan.operation === "import" ? "Importer le token Hermes" : "Générer et appliquer un nouveau token"}
            </p>
            <p className="mt-1 text-[0.6875rem] leading-5">
              {plan.expectedDowntime ? "Hermes sera redémarré et l’ancien token sera restauré si le test échoue. " : "Le runtime sera testé avant l’enregistrement. "}
              Cible : <code className="font-mono">{plan.target}</code> · adapter {plan.adapter}.
            </p>
          </div>
          {plan.warnings.length ? (
            <ul className="list-disc space-y-1 pl-4 text-[0.6875rem] leading-5">
              {plan.warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          ) : null}
          {plan.blockers.length ? (
            <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-[0.6875rem] leading-5 text-destructive">
              <p className="font-semibold">Action indisponible</p>
              <ul className="mt-1 list-disc space-y-1 pl-4">
                {plan.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
              </ul>
            </div>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2 border-t border-warn-100 pt-3">
            <Button type="button" disabled={busy} onClick={cancelPlan}>Choisir une autre action</Button>
            {!plan.blockers.length ? (
              <Button type="button" variant="primary" disabled={busy} onClick={() => void applyPlan()}>
                {plan.operation === "import" ? "Confirmer l’import" : "Confirmer la génération et l’application"}
              </Button>
            ) : null}
          </div>
        </div>
      )}
      <StatusMessage status={status} idle="Import et rotation sont protégés par une confirmation et une vérification Hermes." />
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
          Hermes {installationManagerLabel(discovery.installation.manager)}
        </Badge>
        {discovery.installation.serviceUser ? (
          <span>Service : <code className="font-mono">{discovery.installation.serviceUser}</code></span>
        ) : null}
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

function installationManagerLabel(
  manager: RuntimeSshWorkspaceDiscoveryDto["installation"]["manager"],
) {
  switch (manager) {
    case "systemd-user": return "systemd utilisateur";
    case "systemd-system": return "systemd système";
    case "native-process": return "natif";
    default: return manager;
  }
}

function StorageMigration({
  discovery,
  disabled,
  onBusyChange,
  onCompleted,
}: {
  discovery: RuntimeSshWorkspaceDiscoveryDto;
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
  onCompleted: (runtime: RuntimePublicDto) => void;
}) {
  const availability = discovery.storageMigration;
  const [plan, setPlan] = useState<RuntimeSshStorageMigrationPlanDto | null>(null);
  const [job, setJob] = useState<RuntimeSshStorageMigrationJobDto | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const { runMutation, beginMutation, updateMutation, finishMutation, failMutation } = useRuntimeMutation();
  const running = job?.status === "queued" || job?.status === "running";
  const targetHostRoot = availability?.defaultTargetRoot ?? "";
  const eventsRef = useRef<EventSource | null>(null);
  const onCompletedRef = useRef(onCompleted);

  useEffect(() => {
    onCompletedRef.current = onCompleted;
  }, [onCompleted]);

  useEffect(() => {
    onBusyChange(Boolean(preparing || running));
    return () => onBusyChange(false);
  }, [onBusyChange, preparing, running]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/runtime/ssh/storage-migration", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("État de migration indisponible.");
        return response.json() as Promise<{
          migration?: {
            job: RuntimeSshStorageMigrationJobDto;
            plan: RuntimeSshStorageMigrationPlanDto | null;
          } | null;
        }>;
      })
      .then((body) => {
        if (cancelled || !body.migration) return;
        setJob(body.migration.job);
        setPlan(body.migration.plan);
        if (body.migration.job.status === "queued" || body.migration.job.status === "running") {
          beginMutation("Reprise de la migration Docker", body.migration.job.message);
          eventsRef.current = subscribeStorageMigration(
            body.migration.job.id,
            setJob,
            (runtime) => {
              void finishMutation();
              if (runtime) onCompletedRef.current(runtime);
            },
            (message) => {
              failMutation();
              setError(message);
            },
            (nextJob) => updateMutation(nextJob.message, nextJob.progress),
          );
        }
      })
      .catch((reason) => {
        if (!cancelled) setError(errorMessage(reason));
      });
    return () => {
      cancelled = true;
      eventsRef.current?.close();
      eventsRef.current = null;
    };
  }, [
    beginMutation,
    discovery.configRevision,
    failMutation,
    finishMutation,
    updateMutation,
  ]);

  if (!availability) return null;

  async function preparePlan() {
    setPreparing(true);
    setError(null);
    setPlan(null);
    setJob(null);
    setConfirmation("");
    try {
      const body = await runMutation("Préparation de la migration Docker", async (signal) => {
      const response = await fetch("/api/runtime/ssh/storage-migration/plan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Hermes-Toast": "0",
        },
          signal,
          body: JSON.stringify({
            expectedRevision: discovery.configRevision,
            targetHostRoot,
          }),
        });
        const nextBody = (await response.json()) as {
          plan?: RuntimeSshStorageMigrationPlanDto;
          error?: { message?: string };
        };
        if (!response.ok || !nextBody.plan) {
          throw new Error(nextBody.error?.message ?? "Le préflight de migration a échoué.");
        }
        return nextBody;
      });
      setPlan(body.plan!);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setPreparing(false);
    }
  }

  async function startMigration() {
    if (!plan || confirmation !== plan.confirmation || plan.blockers.length > 0) return;
    setError(null);
    if (!beginMutation("Migration Docker avec rollback", "Hermes est arrêté, les données sont copiées puis vérifiées.")) return;
    try {
      const response = await fetch("/api/runtime/ssh/storage-migration", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Hermes-Toast": "0",
        },
        body: JSON.stringify({
          planId: plan.id,
          expectedRevision: plan.expectedRevision,
          confirmation,
        }),
      });
      const body = (await response.json()) as {
        job?: RuntimeSshStorageMigrationJobDto;
        error?: { message?: string };
      };
      if (!response.ok || !body.job) {
        throw new Error(body.error?.message ?? "La migration n’a pas pu démarrer.");
      }
      setJob(body.job);
      updateMutation(body.job.message, body.job.progress);
      eventsRef.current?.close();
      eventsRef.current = subscribeStorageMigration(
        body.job.id,
        setJob,
        (runtime) => {
          void finishMutation();
          if (runtime) onCompletedRef.current(runtime);
        },
        (message) => {
          failMutation();
          setError(message);
        },
        (nextJob) => updateMutation(nextJob.message, nextJob.progress),
      );
    } catch (reason) {
      failMutation();
      setError(errorMessage(reason));
    }
  }

  const manual = availability.state === "manual_required" || Boolean(plan?.blockers.length);
  return (
    <section aria-labelledby="storage-migration-title" className="space-y-4 rounded-2xl border border-warn-100 bg-warn-soft p-4">
      <div className="flex items-start gap-3">
        <HardDriveIcon className="mt-0.5 size-5 shrink-0 text-warn-700" aria-hidden />
        <div className="min-w-0">
          <h4 id="storage-migration-title" className="text-[0.8125rem] font-semibold text-warn-700">
            Migrer le stockage Docker
          </h4>
          <p className="mt-1 text-[0.6875rem] leading-5 text-warn-700">
            Le volume nommé <code className="font-mono">{availability.sourceVolume ?? "inconnu"}</code> ne peut pas être parcouru proprement par SFTP. La cible déclarative sera <code className="font-mono">{availability.defaultTargetRoot}</code>, montée sur <code className="font-mono">/opt/data</code>.
          </p>
        </div>
      </div>

      {availability.state === "available" ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[0.6875rem] text-warn-700">
            Le préflight est en lecture seule. Aucune donnée ne sera déplacée avant la confirmation exacte.
          </p>
          <Button disabled={disabled || preparing || running} leadingIcon={preparing ? SpinnerIcon : HardDriveIcon} onClick={() => void preparePlan()}>
            Préparer la migration
          </Button>
        </div>
      ) : null}

      {plan ? (
        <div className="space-y-3 rounded-xl border border-input bg-card p-3 text-[0.6875rem] leading-5">
          <div className="grid gap-2 sm:grid-cols-2">
            <Definition term="Source">
              {plan.source.volumeName} · {formatBytes(plan.source.bytes)} · {plan.source.fileCount} fichiers
            </Definition>
            <Definition term="Cible">
              {plan.target.hostDataRoot} → {plan.target.hermesDataRoot}
            </Definition>
          </div>
          <ol className="space-y-1.5">
            {plan.steps.map((step, index) => (
              <li key={step.id} className="flex gap-2">
                <span className="font-mono text-muted-foreground">{index + 1}.</span>
                <span><strong className="font-medium">{step.label}</strong> — {step.description}</span>
              </li>
            ))}
          </ol>
          {plan.warnings.map((warning) => <p key={warning} className="text-warn-700">{warning}</p>)}
          {plan.blockers.map((blocker) => <p key={blocker} role="alert" className="text-destructive">{blocker}</p>)}
          {!plan.blockers.length ? (
            <div className="space-y-2 border-t border-seam pt-3">
              <label htmlFor="storage-migration-confirmation" className="block font-medium">
                Saisissez exactement <code className="select-all rounded bg-inset px-1.5 py-0.5 font-mono">{plan.confirmation}</code>
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  id="storage-migration-confirmation"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  autoComplete="off"
                  disabled={running}
                  className={cn(inputClass, "flex-1 font-mono")}
                />
                <Button
                  variant="primary"
                  disabled={disabled || running || confirmation !== plan.confirmation}
                  leadingIcon={running ? SpinnerIcon : PlayIcon}
                  onClick={() => void startMigration()}
                >
                  Migrer avec rollback
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {job ? (
        <div role="status" className="space-y-2 rounded-xl bg-card p-3 text-[0.6875rem]">
          <div className="flex justify-between gap-3"><span>{job.message}</span><span className="font-mono">{job.progress}%</span></div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${job.progress}%` }} /></div>
          {job.error ? <p className="text-destructive">{job.error.message}</p> : null}
          {job.rollbackAvailable ? <p className="text-muted-foreground">Le volume et le conteneur de rollback sont conservés.</p> : null}
        </div>
      ) : null}

      {error ? <p role="alert" className="text-[0.6875rem] text-destructive">{error}</p> : null}
      {manual ? <ManualStorageMigrationGuide /> : null}
    </section>
  );
}

function subscribeStorageMigration(
  jobId: string,
  onUpdate: (job: RuntimeSshStorageMigrationJobDto) => void,
  onTerminal: (runtime?: RuntimePublicDto) => void,
  onError: (message: string) => void,
  onProgress: (job: RuntimeSshStorageMigrationJobDto) => void,
) {
  const events = new EventSource(`/api/runtime/ssh/storage-migration/${jobId}/events`);
  events.addEventListener("update", (event) => {
    const update = JSON.parse((event as MessageEvent).data) as {
      job: RuntimeSshStorageMigrationJobDto;
    };
    onUpdate(update.job);
    onProgress(update.job);
    if (["succeeded", "rolled_back", "failed", "recovery_required"].includes(update.job.status)) {
      events.close();
      onTerminal(update.job.runtime);
    }
  });
  events.onerror = () => {
    events.close();
    onError("Le flux de progression a été interrompu. Rechargez la page pour consulter l’état persistant.");
  };
  return events;
}

function ManualStorageMigrationGuide() {
  return (
    <details className="group border-t border-warn-100 pt-3">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[0.75rem] font-medium text-warn-700">
        Procédure manuelle pour une installation personnalisée
        <ChevronDownIcon className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
      </summary>
      <ol className="mt-3 space-y-2 pl-5 text-[0.6875rem] leading-5 text-warn-700">
        <li>1. Sauvegardez tout <code className="font-mono">/opt/data</code>, puis arrêtez Hermes afin de figer les écritures.</li>
        <li>2. Copiez le volume vers <code className="font-mono">/srv/hermes-console/data</code> en conservant UID, GID, modes et dates ; comparez les manifestes.</li>
        <li>3. Conservez l’ancien conteneur et son volume, puis recréez Hermes avec un bind mount vers <code className="font-mono">/opt/data</code> et le port <code className="font-mono">127.0.0.1:8642</code>.</li>
        <li>4. Vérifiez health, capabilities, SFTP et une écriture Hermes avant d’activer <code className="font-mono">/srv/hermes-console/data/workspace</code>.</li>
      </ol>
      <a href="/docs/installation-utilisation#migration-dun-volume-docker-vers-un-bind-mount" target="_blank" rel="noreferrer" className="mt-3 inline-block text-[0.6875rem] font-medium text-warn-700 underline underline-offset-2">
        Ouvrir le guide opérateur complet
      </a>
    </details>
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
  const [provisionerHost, setProvisionerHost] = useState(target.host);
  const [provisionerPort, setProvisionerPort] = useState(String(target.port || 22));
  const [provisionerUser, setProvisionerUser] = useState("hermes-admin");
  const [provisionerAuth, setProvisionerAuth] = useState<SshAuth>(target.auth);
  const [provisionerPassword, setProvisionerPassword] = useState("");
  const [plan, setPlan] = useState<RuntimeSshPlanDto | null>(null);
  const [job, setJob] = useState<RuntimeSshProvisionJobDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { runMutation, beginMutation, updateMutation, finishMutation, failMutation } = useRuntimeMutation();
  const running = job?.status === "running" || job?.status === "queued";

  const effectiveWorkdir = workdir || defaultWorkdir;

  function payload() {
    if (!target.host.trim() || !target.user.trim()) throw new Error("Renseignez d’abord la cible SSH.");
    if (!provisionerHost.trim() || !provisionerUser.trim()) {
      throw new Error("Renseignez la cible SSH d’administration.");
    }
    if (provisionerUser.trim() === target.user.trim()) {
      throw new Error("Les comptes admin et service doivent être distincts.");
    }
    if (provisionerAuth === "password" && !provisionerPassword) {
      throw new Error("Saisissez le mot de passe du compte d’administration.");
    }
    if (!effectiveWorkdir.trim()) throw new Error("Indiquez le futur dossier de données Hermes sur le VPS.");
    return {
      provisioner: {
        host: provisionerHost.trim(),
        port: parsePort(provisionerPort),
        user: provisionerUser.trim(),
        auth: provisionerAuth,
        ...(provisionerPassword ? { password: provisionerPassword } : {}),
      },
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
      const body = await runMutation("Préparation du plan Hermes distant", async (signal) => {
        const response = await fetch("/api/runtime/ssh/plan", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Hermes-Toast": "0",
          },
          signal,
          body: JSON.stringify(payload()),
        });
        const nextBody = (await response.json()) as { plan?: RuntimeSshPlanDto; error?: { message?: string } };
        if (!response.ok || !nextBody.plan) throw new Error(nextBody.error?.message ?? "Plan impossible.");
        return nextBody;
      });
      setPlan(body.plan!);
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  async function provision() {
    if (!plan || plan.blockers.length) return;
    setError(null);
    if (!beginMutation("Installation Hermes distante", "Le déploiement est suivi jusqu’à la fin du job serveur.")) return;
    try {
      const response = await fetch("/api/runtime/ssh/provision", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Hermes-Toast": "0",
        },
        body: JSON.stringify({ ...payload(), confirmation: plan.confirmation }),
      });
      const body = (await response.json()) as { job?: RuntimeSshProvisionJobDto; error?: { message?: string } };
      if (!response.ok || !body.job) throw new Error(body.error?.message ?? "Provisioning impossible.");
      setJob(body.job);
      updateMutation(body.job.message, body.job.progress);
      const events = new EventSource(`/api/runtime/ssh/provision/${body.job.id}/events`);
      events.addEventListener("update", (event) => {
        const update = JSON.parse((event as MessageEvent).data) as { job: RuntimeSshProvisionJobDto };
        setJob(update.job);
        updateMutation(update.job.message, update.job.progress);
        if (update.job.status === "succeeded" || update.job.status === "failed") {
          events.close();
          if (update.job.status === "succeeded") {
            void finishMutation();
          } else {
            failMutation();
          }
          if (update.job.runtime) onRuntimeChange(update.job.runtime);
        }
      });
      events.onerror = () => {
        events.close();
        failMutation();
        setError("Le flux de progression a été interrompu.");
      };
    } catch (reason) {
      failMutation();
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
          <Choice active={mode === "native"} onClick={() => { setMode("native"); setPlan(null); }} title="Hermes system-wide" description="Release vérifiée sous /opt, exécutée par systemd avec le compte service sans sudo." />
        </div>
        <div className="space-y-4 rounded-xl border border-input bg-card p-4">
          <div>
            <p className="text-[0.75rem] font-semibold">Identité d’administration temporaire</p>
            <p className="mt-1 text-[0.6875rem] leading-5 text-muted-foreground">
              Utilisée uniquement pour installer Docker ou la release system-wide, gérer systemd et préparer les fichiers. Le compte service ci-dessus reste sans sudo ni accès Docker et sera le seul enregistré pour les missions.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
            <Field icon={ServerIcon} label="Hôte ou alias SSH admin" hint="Peut être un alias ~/.ssh/config avec sa propre IdentityFile.">
              <input value={provisionerHost} onChange={(event) => { setProvisionerHost(event.target.value); setPlan(null); }} placeholder={target.host || "hermes-admin-vm"} className={inputClass} />
            </Field>
            <Field icon={NetworkIcon} label="Port SSH admin" hint="Doit viser la même VM.">
              <input inputMode="numeric" value={provisionerPort} onChange={(event) => { setProvisionerPort(event.target.value); setPlan(null); }} className={inputClass} />
            </Field>
          </div>
          <Field icon={UserRoundIcon} label="Utilisateur admin" hint="Compte sudo distinct du compte service.">
            <input value={provisionerUser} onChange={(event) => { setProvisionerUser(event.target.value); setPlan(null); }} placeholder="hermes-admin" className={inputClass} />
          </Field>
          <AuthModeToggle value={provisionerAuth} onChange={(value) => { setProvisionerAuth(value); setPlan(null); }} />
          {provisionerAuth === "password" ? (
            <Field icon={KeyRoundIcon} label="Mot de passe admin" hint="Chiffré en transit, jamais persisté comme identité runtime.">
              <input type="password" value={provisionerPassword} onChange={(event) => { setProvisionerPassword(event.target.value); setPlan(null); }} autoComplete="current-password" className={inputClass} />
            </Field>
          ) : null}
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

function AuthModeToggle({
  value,
  onChange,
  disabled,
}: {
  value: SshAuth;
  onChange: (value: SshAuth) => void;
  disabled?: boolean;
}) {
  const options: Array<{ value: SshAuth; label: string; icon: typeof KeyRoundIcon }> = [
    { value: "agent", label: "Clé ou agent", icon: KeyRoundIcon },
    { value: "password", label: "Mot de passe", icon: LockKeyholeIcon },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="Méthode d’authentification SSH"
      className="inline-flex rounded-full border border-input bg-inset p-1"
    >
      {options.map(({ value: mode, label, icon: Icon }) => {
        const active = value === mode;
        return (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(mode)}
            className={cn(
              "flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[0.75rem] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
              active ? "bg-primary text-primary-foreground shadow-board-xs" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-3.5 shrink-0" aria-hidden />
            {label}
          </button>
        );
      })}
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

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "taille inconnue";
  const units = ["o", "Kio", "Mio", "Gio", "Tio"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function apiError(error: { code?: string; message?: string } | undefined, fallback: string) {
  const next = new Error(error?.message ?? fallback) as Error & { code?: string };
  next.code = error?.code;
  return next;
}
