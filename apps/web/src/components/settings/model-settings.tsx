"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BrainCircuitIcon,
  CheckCircle2Icon,
  CopyIcon,
  ExternalLinkIcon,
  GaugeIcon,
  KeyRoundIcon,
  LoaderCircleIcon,
  LogInIcon,
  RefreshCwIcon,
  XIcon,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input, Skeleton } from "@boardui/ui";
import { Badge, Button, Card, CardSurface } from "@/components/ui/boardui";
import {
  getModelSettingsClient,
  peekModelSettingsClient,
  setModelSettingsClient,
  type ModelSettingsDto,
} from "@/lib/runtime/models-client";
import {
  DEFAULT_REASONING_EFFORT,
  HERMES_REASONING_EFFORT_LABELS,
  HERMES_REASONING_EFFORTS,
  isHermesReasoningEffort,
  type HermesReasoningEffort,
} from "@/lib/runtime/reasoning-effort";

type CodexAuthSession = {
  sessionId: string;
  status: "starting" | "pending" | "connected" | "failed" | "cancelled";
  verificationUri: string | null;
  userCode: string | null;
  error: string | null;
};

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; data: ModelSettingsDto }
  | { kind: "error"; message: string };

function selectionFromSettings(body: ModelSettingsDto): {
  provider: string;
  model: string;
  effort: HermesReasoningEffort | "";
} {
  return {
    provider: body.selectedProvider,
    model: body.selectedModel,
    effort: isHermesReasoningEffort(body.selectedReasoningEffort)
      ? body.selectedReasoningEffort
      : body.availableReasoningEfforts.length > 0
        ? DEFAULT_REASONING_EFFORT
        : "",
  };
}

export function ModelSettings() {
  const cached = peekModelSettingsClient();
  const initialSelection = cached ? selectionFromSettings(cached) : null;
  const [state, setState] = useState<LoadState>(
    cached ? { kind: "ready", data: cached } : { kind: "loading" },
  );
  const [selectedProvider, setSelectedProvider] = useState(initialSelection?.provider ?? "");
  const [selectedModel, setSelectedModel] = useState(initialSelection?.model ?? "");
  const [selectedEffort, setSelectedEffort] = useState<HermesReasoningEffort | "">(
    initialSelection?.effort ?? DEFAULT_REASONING_EFFORT,
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [auth, setAuth] = useState<CodexAuthSession | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [apiKeyBusy, setApiKeyBusy] = useState(false);
  const [apiKeyStatus, setApiKeyStatus] = useState<
    | { kind: "idle" }
    | { kind: "success"; message: string }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  function applySelection(body: ModelSettingsDto) {
    const next = selectionFromSettings(body);
    setSelectedProvider(next.provider);
    setSelectedModel(next.model);
    setSelectedEffort(next.effort);
  }

  async function load() {
    setState({ kind: "loading" });
    setSaved(false);
    try {
      const body = await getModelSettingsClient({ refresh: true });
      applySelection(body);
      setState({ kind: "ready", data: body });
    } catch (reason) {
      setState({
        kind: "error",
        message:
          reason instanceof Error ? reason.message : "Impossible de charger les modèles Hermes.",
      });
    }
  }

  useEffect(() => {
    let active = true;
    void getModelSettingsClient()
      .then((body) => {
        if (!active) return;
        applySelection(body);
        setState({ kind: "ready", data: body });
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setState({
          kind: "error",
          message:
            reason instanceof Error ? reason.message : "Impossible de charger les modèles Hermes.",
        });
      });
    return () => {
      active = false;
    };
  }, []);

  const selected = useMemo(
    () => {
      if (state.kind !== "ready") return undefined;
      return state.data.catalog.providers
        .find((provider) => provider.slug === selectedProvider)
        ?.models.find((model) => model.id === selectedModel);
    },
    [selectedModel, selectedProvider, state],
  );

  function effortForModel(model: { reasoning: boolean } | undefined): HermesReasoningEffort | "" {
    if (!model?.reasoning) return "";
    return isHermesReasoningEffort(selectedEffort) ? selectedEffort : DEFAULT_REASONING_EFFORT;
  }

  async function save() {
    if (state.kind !== "ready" || !selectedProvider || !selectedModel) return;
    setSaving(true);
    setSaved(false);
    try {
      const response = await fetch("/api/runtime/models", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: selectedProvider,
          model: selectedModel,
          reasoningEffort: selected?.reasoning
            ? effortForModel(selected) || DEFAULT_REASONING_EFFORT
            : null,
        }),
      });
      const body = (await response.json()) as ModelSettingsDto & {
        error?: { message?: string };
      };
      if (!response.ok || !body.catalog) {
        throw new Error(body.error?.message ?? "Impossible d’enregistrer le modèle.");
      }
      applySelection(body);
      setModelSettingsClient(body);
      setState({ kind: "ready", data: body });
      setSaved(true);
    } catch (reason) {
      setState({
        kind: "error",
        message: reason instanceof Error ? reason.message : "Impossible d’enregistrer le modèle.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function connectCodex() {
    setAuthBusy(true);
    try {
      const response = await fetch("/api/runtime/providers/openai-codex/auth", {
        method: "POST",
      });
      const body = (await response.json()) as CodexAuthSession & {
        error?: { message?: string };
      };
      if (!response.ok || !body.sessionId) {
        throw new Error(body.error?.message ?? "Impossible de démarrer la connexion OpenAI.");
      }
      setAuth(body);
    } catch (reason) {
      setAuth({
        sessionId: "",
        status: "failed",
        verificationUri: null,
        userCode: null,
        error:
          reason instanceof Error ? reason.message : "Impossible de démarrer la connexion OpenAI.",
      });
    } finally {
      setAuthBusy(false);
    }
  }

  async function cancelCodex() {
    if (!auth?.sessionId) return;
    await fetch(
      `/api/runtime/providers/openai-codex/auth?sessionId=${encodeURIComponent(auth.sessionId)}`,
      { method: "DELETE" },
    );
    setAuth(null);
  }

  async function saveApiKey() {
    if (state.kind !== "ready" || !activeProvider?.acceptsApiKey || apiKey.length < 8) {
      return;
    }
    const providerSlug = activeProvider.slug;
    setApiKeyBusy(true);
    setApiKeyStatus({ kind: "idle" });
    try {
      const response = await fetch(
        `/api/runtime/providers/${encodeURIComponent(providerSlug)}/credentials`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ apiKey }),
        },
      );
      const body = (await response.json()) as {
        ok?: boolean;
        authenticated?: boolean;
        modelCount?: number;
        error?: { message?: string };
      };
      if (!response.ok || !body.ok) {
        throw new Error(body.error?.message ?? "Hermes n’a pas enregistré cette clé.");
      }

      setApiKey("");
      const refreshed = await getModelSettingsClient({ refresh: true });
      const refreshedProvider = refreshed.catalog.providers.find(
        (provider) => provider.slug === providerSlug,
      );
      setState({ kind: "ready", data: refreshed });
      setSelectedProvider(providerSlug);
      setSelectedModel(refreshedProvider?.models[0]?.id ?? "");
      setSelectedEffort(
        refreshedProvider?.models[0]?.reasoning ? DEFAULT_REASONING_EFFORT : "",
      );
      setApiKeyStatus({
        kind: "success",
        message:
          body.authenticated && body.modelCount
            ? `Clé enregistrée dans Hermes, ${body.modelCount} modèles disponibles.`
            : "Clé enregistrée dans le pool Hermes. Elle sera vérifiée lors du prochain appel.",
      });
    } catch (reason) {
      setApiKeyStatus({
        kind: "error",
        message:
          reason instanceof Error ? reason.message : "Hermes n’a pas enregistré cette clé.",
      });
    } finally {
      setApiKeyBusy(false);
    }
  }

  useEffect(() => {
    if (!auth?.sessionId || !["starting", "pending"].includes(auth.status)) return;
    const interval = window.setInterval(() => {
      void fetch(
        `/api/runtime/providers/openai-codex/auth?sessionId=${encodeURIComponent(auth.sessionId)}`,
        { cache: "no-store" },
      )
        .then(async (response) => {
          const body = (await response.json()) as CodexAuthSession;
          if (!response.ok) throw new Error("Autorisation OpenAI introuvable.");
          setAuth(body);
          if (body.status === "connected") void load();
        })
        .catch((reason: unknown) => {
          setAuth((current) =>
            current
              ? {
                  ...current,
                  status: "failed",
                  error:
                    reason instanceof Error
                      ? reason.message
                      : "Le suivi de l’autorisation OpenAI a échoué.",
                }
              : null,
          );
        });
    }, 1_500);
    return () => window.clearInterval(interval);
  }, [auth?.sessionId, auth?.status]);

  const providers = state.kind === "ready" ? state.data.catalog.providers : [];
  const activeProvider = providers.find((provider) => provider.slug === selectedProvider);
  const selectableProviders = providers.filter(
    (provider) => provider.authenticated && provider.models.length > 0,
  );
  const modelCount = selectableProviders.reduce(
    (count, provider) => count + provider.models.length,
    0,
  );
  const codexProvider = providers.find((provider) => provider.slug === "openai-codex");

  return (
    <Card>
      <CardSurface>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[0.8125rem] font-semibold">Modèle LLM par défaut</p>
              {state.kind === "ready" ? (
                <>
                  <Badge tone="info">{selectableProviders.length} providers connectés</Badge>
                  <Badge>{modelCount} modèles</Badge>
                </>
              ) : null}
            </div>
            <p className="mt-1 max-w-[70ch] text-[0.6875rem] leading-5 text-muted-foreground">
              Catalogue lu directement depuis Hermes. Le choix s’applique aux nouvelles
              conversations et chaque mission transmet explicitement son modèle au runtime.
            </p>
          </div>
          <Button
            aria-label="Actualiser les modèles Hermes"
            disabled={state.kind === "loading" || saving}
            onClick={() => void load()}
          >
            <RefreshCwIcon className="size-4" />
            Actualiser
          </Button>
        </div>

        {state.kind === "loading" ? (
          <ModelSettingsSkeleton />
        ) : state.kind === "error" ? (
          <div
            role="alert"
            className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-neg-soft p-3 text-[0.75rem] text-neg-700"
          >
            <span>{state.message}</span>
            <Button onClick={() => void load()}>Réessayer</Button>
          </div>
        ) : (
          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(220px,0.45fr)]">
            <div className="grid gap-4">
              <div>
                <label
                  htmlFor="llm-provider"
                  className="block text-[0.75rem] font-medium"
                >
                  Provider
                </label>
                <Select
                  value={selectedProvider}
                  disabled={saving}
                  onValueChange={(value) => {
                    const provider = state.data.catalog.providers.find(
                      (item) => item.slug === value,
                    );
                    const nextModel = provider?.models[0];
                    setSelectedProvider(value);
                    setSelectedModel(nextModel?.id ?? "");
                    setSelectedEffort(
                      nextModel?.reasoning ? DEFAULT_REASONING_EFFORT : "",
                    );
                    setSaved(false);
                    setApiKey("");
                    setApiKeyStatus({ kind: "idle" });
                  }}
                >
                  <SelectTrigger id="llm-provider" className="mt-2">
                    <SelectValue placeholder="Choisir un provider" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {state.data.catalog.providers.map((provider) => (
                        <SelectItem key={provider.slug} value={provider.slug}>
                          <span className="truncate">{provider.name}</span>
                          <span className="ml-auto text-[0.6875rem] text-muted-foreground">
                            {provider.authenticated && provider.models.length > 0
                              ? `${provider.models.length} modèles`
                              : "à connecter"}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label
                  htmlFor="llm-model"
                  className="block text-[0.75rem] font-medium"
                >
                  Modèle actif pour les prochains fils
                </label>
                <Select
                  value={selectedModel || undefined}
                  disabled={
                    saving ||
                    !activeProvider?.authenticated ||
                    !activeProvider.models.length
                  }
                  onValueChange={(value) => {
                    const model = activeProvider?.models.find((item) => item.id === value);
                    setSelectedModel(value);
                    setSelectedEffort(
                      model?.reasoning
                        ? isHermesReasoningEffort(selectedEffort)
                          ? selectedEffort
                          : DEFAULT_REASONING_EFFORT
                        : "",
                    );
                    setSaved(false);
                  }}
                >
                  <SelectTrigger id="llm-model" className="mt-2">
                    <SelectValue
                      placeholder={
                        activeProvider?.authenticated
                          ? "Aucun modèle retourné par Hermes"
                          : "Connectez ce provider pour charger ses modèles"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {(activeProvider?.models ?? []).map((model) => (
                        <SelectItem key={model.id} value={model.id}>
                          {model.id}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <span className="mt-2 block text-[0.6875rem] text-muted-foreground">
                  Valeur Hermes actuelle : {state.data.catalog.runtimeDefaultModel}
                </span>
              </div>

              {selected?.reasoning ? (
                <div>
                  <label
                    htmlFor="llm-effort"
                    className="block text-[0.75rem] font-medium"
                  >
                    Effort de raisonnement
                  </label>
                  <Select
                    value={effortForModel(selected) || DEFAULT_REASONING_EFFORT}
                    disabled={saving}
                    onValueChange={(value) => {
                      if (!isHermesReasoningEffort(value)) return;
                      setSelectedEffort(value);
                      setSaved(false);
                    }}
                  >
                    <SelectTrigger id="llm-effort" className="mt-2">
                      <SelectValue placeholder="Choisir un niveau" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {HERMES_REASONING_EFFORTS.map((effort) => (
                          <SelectItem key={effort} value={effort}>
                            {HERMES_REASONING_EFFORT_LABELS[effort]}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <span className="mt-2 block text-[0.6875rem] text-muted-foreground">
                    Hermes n’expose pas les niveaux par modèle — set fixe API
                    (`none` → `xhigh`), envoyé via `model_options.reasoning_effort`.
                  </span>
                </div>
              ) : null}
            </div>

            <div className="rounded-xl bg-surface-sunken p-3">
              <p className="text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Capacités annoncées
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge tone={activeProvider?.authenticated ? "success" : "warning"}>
                  {activeProvider?.authenticated ? "Connecté" : "Connexion requise"}
                </Badge>
                <Badge tone={selected?.reasoning ? "success" : "neutral"}>
                  <BrainCircuitIcon className="size-3.5" />
                  {selected?.reasoning ? "Reasoning" : "Sans reasoning annoncé"}
                </Badge>
                {selected?.reasoning && effortForModel(selected) ? (
                  <Badge tone="info">
                    Effort {HERMES_REASONING_EFFORT_LABELS[effortForModel(selected) as HermesReasoningEffort]}
                  </Badge>
                ) : null}
                <Badge tone={selected?.fast ? "info" : "neutral"}>
                  <GaugeIcon className="size-3.5" />
                  {selected?.fast ? "Fast" : "Standard"}
                </Badge>
              </div>
              {activeProvider?.warning && !activeProvider.authenticated ? (
                <p className="mt-3 text-[0.6875rem] leading-5 text-warn-700">
                  Hermes indique : {activeProvider.warning}
                </p>
              ) : null}
              <p className="mt-3 text-[0.6875rem] leading-5 text-muted-foreground">
                La Console ne modifie pas `.env` : Hermes autorise la sélection par mission, mais
                pas l’écriture distante de sa configuration.
              </p>
            </div>

            {activeProvider?.acceptsApiKey ? (
              <div className="border-t border-border pt-4 lg:col-span-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-[0.75rem] font-semibold">
                        Clé API {activeProvider.name}
                      </p>
                      <Badge tone={activeProvider.authenticated ? "success" : "warning"}>
                        {activeProvider.authenticated ? "Credential détecté" : "À configurer"}
                      </Badge>
                    </div>
                    <p className="mt-1 max-w-[70ch] text-[0.6875rem] leading-5 text-muted-foreground">
                      La clé est transmise au CLI local par entrée sécurisée, puis stockée dans le
                      pool Hermes. Elle n’est jamais enregistrée dans la base Console ou le
                      navigateur.
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="relative min-w-0 flex-1">
                    <KeyRoundIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="password"
                      autoComplete="new-password"
                      aria-label={`Clé API ${activeProvider.name}`}
                      value={apiKey}
                      disabled={apiKeyBusy}
                      onChange={(event) => {
                        setApiKey(event.target.value);
                        setApiKeyStatus({ kind: "idle" });
                      }}
                      placeholder={
                        activeProvider.authenticated
                          ? "Nouvelle clé pour remplacer celle gérée par la Console"
                          : "Coller la clé API"
                      }
                      className="h-11 pl-9"
                    />
                  </div>
                  <Button
                    variant="primary"
                    className="h-11 shrink-0 px-3"
                    disabled={apiKeyBusy || apiKey.trim().length < 8}
                    onClick={() => void saveApiKey()}
                  >
                    {apiKeyBusy ? (
                      <LoaderCircleIcon className="size-4 animate-spin" />
                    ) : (
                      <KeyRoundIcon className="size-4" />
                    )}
                    {apiKeyBusy
                      ? "Enregistrement…"
                      : activeProvider.authenticated
                        ? "Mettre à jour la clé"
                        : "Enregistrer la clé"}
                  </Button>
                </div>
                {apiKeyStatus.kind !== "idle" ? (
                  <p
                    role={apiKeyStatus.kind === "error" ? "alert" : "status"}
                    className={`mt-2 text-[0.75rem] ${
                      apiKeyStatus.kind === "error" ? "text-neg-700" : "text-pos-700"
                    }`}
                  >
                    {apiKeyStatus.message}
                  </p>
                ) : (
                  <p className="mt-2 text-[0.6875rem] text-muted-foreground">
                    Les credentials injectés par `.env` restent inchangés. Seule une précédente clé
                    ajoutée par cette Console est remplacée.
                  </p>
                )}
              </div>
            ) : null}

            {codexProvider && !codexProvider.authenticated ? (
              <div className="rounded-xl border border-border bg-card p-4 lg:col-span-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-[0.75rem] font-semibold">
                        OpenAI Codex — abonnement ChatGPT
                      </p>
                      <Badge>OAuth</Badge>
                    </div>
                    <p className="mt-1 max-w-[70ch] text-[0.6875rem] leading-5 text-muted-foreground">
                      Identité distincte de la clé OpenAI API. L’autorisation est enregistrée par
                      Hermes, jamais dans la base ni dans le navigateur de la Console.
                    </p>
                  </div>
                  {!auth || ["failed", "cancelled"].includes(auth.status) ? (
                    <Button disabled={authBusy} onClick={() => void connectCodex()}>
                      {authBusy ? (
                        <LoaderCircleIcon className="size-4 animate-spin" />
                      ) : (
                        <LogInIcon className="size-4" />
                      )}
                      Connecter mon abonnement
                    </Button>
                  ) : null}
                </div>

                {auth?.status === "starting" ? (
                  <p role="status" className="mt-3 text-[0.75rem] text-muted-foreground">
                    <LoaderCircleIcon className="mr-2 inline size-4 animate-spin" />
                    Hermes prépare le code d’autorisation…
                  </p>
                ) : null}

                {auth?.status === "pending" && auth.verificationUri && auth.userCode ? (
                  <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-surface-sunken p-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[0.6875rem] text-muted-foreground">
                        Ouvrez OpenAI, puis saisissez ce code :
                      </p>
                      <p className="mt-1 font-mono text-[1rem] font-semibold tracking-[0.12em]">
                        {auth.userCode}
                      </p>
                    </div>
                    <Button
                      onClick={() => void navigator.clipboard.writeText(auth.userCode ?? "")}
                    >
                      <CopyIcon className="size-4" />
                      Copier
                    </Button>
                    <Button onClick={() => window.open(auth.verificationUri ?? "", "_blank")}>
                      <ExternalLinkIcon className="size-4" />
                      Ouvrir OpenAI
                    </Button>
                    <Button aria-label="Annuler l’autorisation OpenAI" onClick={() => void cancelCodex()}>
                      <XIcon className="size-4" />
                    </Button>
                  </div>
                ) : null}

                {auth?.status === "failed" ? (
                  <p role="alert" className="mt-3 text-[0.75rem] text-neg-700">
                    {auth.error ?? "La connexion OpenAI a échoué."}
                  </p>
                ) : null}
              </div>
            ) : codexProvider?.authenticated ? (
              <div className="flex items-center gap-2 rounded-xl bg-pos-soft p-3 text-[0.75rem] text-pos-700 lg:col-span-2">
                <CheckCircle2Icon className="size-4" />
                Abonnement OpenAI Codex connecté dans Hermes.
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 lg:col-span-2">
              {saved ? (
                <p role="status" className="flex items-center gap-2 text-[0.75rem] text-pos-700">
                  <CheckCircle2Icon className="size-4" />
                  Modèle enregistré pour les nouvelles conversations.
                </p>
              ) : (
                <p className="text-[0.6875rem] text-muted-foreground">
                  Les conversations existantes gardent leur modèle pour rester reproductibles.
                </p>
              )}
              <Button
                variant="primary"
                disabled={
                  saving ||
                  !activeProvider?.authenticated ||
                  !selectedModel ||
                  (selectedProvider === state.data.selectedProvider &&
                    selectedModel === state.data.selectedModel &&
                    (effortForModel(selected) || null) ===
                      (state.data.selectedReasoningEffort || null))
                }
                onClick={() => void save()}
              >
                {saving ? <LoaderCircleIcon className="size-4 animate-spin" /> : null}
                {saving ? "Enregistrement…" : "Définir par défaut"}
              </Button>
            </div>
          </div>
        )}
      </CardSurface>
    </Card>
  );
}

function FieldSkeleton() {
  return (
    <div className="grid gap-2">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-10 w-full rounded-lg" />
    </div>
  );
}

function ModelSettingsSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Chargement des modèles Hermes" className="mt-4">
      <span className="sr-only">Lecture du catalogue modèles…</span>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(220px,0.45fr)]">
        <div className="grid gap-4">
          <FieldSkeleton />
          <div className="grid gap-2">
            <Skeleton className="h-3 w-44" />
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-3 w-56" />
          </div>
          <div className="grid gap-2">
            <Skeleton className="h-3 w-36" />
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-3 w-full max-w-[42ch]" />
          </div>
        </div>

        <div className="rounded-xl bg-surface-sunken p-3">
          <Skeleton className="h-3 w-32" />
          <div className="mt-3 flex flex-wrap gap-2">
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-6 w-24 rounded-full" />
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-6 w-14 rounded-full" />
          </div>
          <div className="mt-3 grid gap-1.5">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-[88%]" />
            <Skeleton className="h-3 w-[72%]" />
          </div>
        </div>

        <div className="border-t border-border pt-4 lg:col-span-2">
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-5 w-28 rounded-full" />
          </div>
          <div className="mt-2 grid gap-1.5">
            <Skeleton className="h-3 w-full max-w-[60ch]" />
            <Skeleton className="h-3 w-full max-w-[48ch]" />
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <Skeleton className="h-11 min-w-0 flex-1 rounded-lg" />
            <Skeleton className="h-11 w-40 shrink-0 rounded-lg" />
          </div>
          <Skeleton className="mt-2 h-3 w-full max-w-[52ch]" />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 lg:col-span-2">
          <Skeleton className="h-3 w-full max-w-[40ch]" />
          <Skeleton className="h-10 w-40 rounded-lg" />
        </div>
      </div>
    </div>
  );
}
