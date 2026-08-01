import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  ArrowRightIcon,
  Building2Icon,
  CheckIcon,
  CheckCircle2Icon,
  CircleAlertIcon,
  LoaderCircleIcon,
  RadioTowerIcon,
  ShieldCheckIcon,
} from "lucide-react";
import { z } from "zod";
import setupOperationBoard from "@/assets/setup-operation-board.png";
import { Button } from "@/components/ui/boardui";
import {
  selectSitePayload,
  siteAccessBlock,
  type AuthSite,
  type AuthSiteContext,
  selectMandatePayload,
  type AuthMandate,
} from "@/lib/auth-site-context";
import { useRouter } from "@/lib/router";

type AuthState = {
  authenticated: boolean;
  setupRequired: boolean;
  user?: { email?: string; name?: string | null } | null;
  siteContext: AuthSiteContext | null;
};

type SetupStep = "runtime" | "agent" | "completed";

export type AiDisclosure = {
  version: string;
  title: string;
  summary: string;
  items: readonly string[];
};

type SetupState = {
  step: SetupStep;
  runtimeVerifiedAt?: string | null;
  runtime?: { configured?: boolean; lastHealthStatus?: string } | null;
  disclosure: AiDisclosure;
  consent: {
    current: boolean;
    version: string | null;
    acceptedAt: string | null;
  };
};

type Notice = { tone: "error" | "success"; message: string } | null;

const agentSchema = z.object({
  name: z.string().trim().min(2, "Donnez un nom d’au moins 2 caractères.").max(120, "Le nom ne peut pas dépasser 120 caractères."),
  description: z.string().trim().max(500, "La description ne peut pas dépasser 500 caractères.").optional(),
  instructions: z.string().trim().min(12, "Décrivez au moins brièvement le cadre de travail de l’agent.").max(20_000, "Les instructions ne peuvent pas dépasser 20 000 caractères."),
});

type AgentFormValues = z.infer<typeof agentSchema>;

const inputClass =
  "h-11 w-full rounded-[10px] border border-white/12 bg-[oklch(0.215_0.008_258)] px-3 text-[0.8125rem] text-white outline-none transition-[border-color,box-shadow] placeholder:text-white/35 focus:border-[oklch(0.68_0.17_251)] focus:ring-2 focus:ring-[oklch(0.68_0.17_251/0.16)]";

export function needsAiDisclosureConsent(setup: SetupState) {
  return !setup.consent.current;
}

export function aiDisclosureConsentPayload(version: string) {
  return { consentVersion: version };
}

/** Première mise en service, volontairement hors de la coque applicative. */
export function SetupScreen() {
  const router = useRouter();
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [setup, setSetup] = useState<SetupState | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = () => {
    setLoading(true);
    setNotice(null);
    setRefreshKey((key) => key + 1);
  };

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/auth", { cache: "no-store" })
      .then(async (response) => {
        const next = (await response.json()) as AuthState & { error?: { message?: string } };
        if (!response.ok) throw new Error(next.error?.message ?? "L’identité n’est pas disponible.");
        if (!next.authenticated || siteAccessBlock(next.siteContext) !== null) {
          return { next, setup: null };
        }

        const setupResponse = await fetch("/api/setup", { cache: "no-store" });
        const setupBody = (await setupResponse.json().catch(() => null)) as
          | { setup?: SetupState; error?: { message?: string } }
          | null;
        if (!setupResponse.ok || !setupBody?.setup) {
          throw new Error(setupBody?.error?.message ?? "L’état de mise en service est indisponible.");
        }
        return { next, setup: setupBody.setup };
      })
      .then(({ next, setup: nextSetup }) => {
        if (cancelled) return;
        setAuth(next);
        setSetup(nextSetup);
        const authError = oauthCallbackNotice();
        if (authError && !next.authenticated) {
          setNotice({ tone: "error", message: authError });
          window.history.replaceState({}, "", "/setup");
        } else if (authError) {
          window.history.replaceState({}, "", "/setup");
        }
        if (
          nextSetup?.step === "completed" &&
          !next.setupRequired &&
          !needsAiDisclosureConsent(nextSetup)
        ) {
          router.replace("/");
        }
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setNotice({
          tone: "error",
          message: reason instanceof Error ? reason.message : "Une erreur inattendue est survenue.",
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey, router]);

  let content: React.ReactNode;
  if (loading) {
    content = <LoadingState />;
  } else if (!auth?.authenticated) {
    content = <Welcome onGoogle={() => window.location.assign("/api/auth?action=login")} />;
  } else if (siteAccessBlock(auth.siteContext) === "membership") {
    content = <MembershipRequired email={auth.user?.email ?? "Opérateur Google"} />;
  } else if (siteAccessBlock(auth.siteContext) === "selection" && auth.siteContext) {
    content = (
      <SiteSelectionStep
        email={auth.user?.email ?? "Opérateur Google"}
        memberships={auth.siteContext.memberships}
      />
    );
  } else if (siteAccessBlock(auth.siteContext) === "mandate" && auth.siteContext) {
    content = (
      <MandateSelectionStep
        email={auth.user?.email ?? "Opérateur Google"}
        mandates={auth.siteContext.mandates}
      />
    );
  } else if (setup?.step === "completed" && needsAiDisclosureConsent(setup)) {
    content = (
      <ConsentStep
        email={auth.user?.email ?? "Opérateur Google"}
        disclosure={setup.disclosure}
        onComplete={refresh}
      />
    );
  } else if (setup?.step === "agent") {
    content = (
      <AgentStep
        email={auth.user?.email ?? "Opérateur Google"}
        disclosure={setup.disclosure}
        consentCurrent={setup.consent.current}
        onComplete={refresh}
      />
    );
  } else {
    content = <RuntimeStep email={auth.user?.email ?? "Opérateur Google"} onComplete={refresh} />;
  }

  return (
    <main className="h-dvh overflow-hidden bg-[oklch(0.13_0.006_258)] text-white">
      <div className="grid h-full min-h-0 lg:grid-cols-[minmax(0,0.94fr)_minmax(33rem,1.06fr)]">
        {content}
        <OperationPreview
          step={
            auth?.authenticated && siteAccessBlock(auth.siteContext) !== null
              ? "site"
              : auth?.authenticated
                ? setup?.step ?? "runtime"
                : "welcome"
          }
        />
      </div>
      {notice ? <NoticeLine notice={notice} /> : null}
    </main>
  );
}

function SiteSelectionStep({
  email,
  memberships,
}: {
  email: string;
  memberships: AuthSite[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const selectSite = async () => {
    if (!selectedId) return;
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/auth?action=select-site", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Hermes-Toast": "0" },
        body: JSON.stringify(selectSitePayload(selectedId)),
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      if (!response.ok) {
        throw new Error(body?.error?.message ?? "Ce site n’est plus disponible pour votre compte.");
      }
      window.location.assign("/");
    } catch (reason) {
      setNotice({
        tone: "error",
        message: reason instanceof Error ? reason.message : "Sélection impossible.",
      });
      setBusy(false);
    }
  };

  return (
    <section className="flex min-h-0 flex-col">
      <header className="flex shrink-0 items-center gap-5 border-b border-white/9 px-6 py-5 sm:px-10 lg:px-16 xl:px-24">
        <BrandMark compact />
        <div className="ml-auto hidden text-right sm:block">
          <p className="text-[0.6875rem] font-medium text-white/72">{email}</p>
          <p className="mt-0.5 text-[0.625rem] text-white/39">Identité Google vérifiée</p>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-8 pt-8 sm:px-10 lg:px-16 lg:pt-12 xl:px-24">
        <div className="mx-auto max-w-[35rem]">
          <StepHeading eyebrow="Périmètre de travail" title="Choisissez le site à ouvrir." />
          <p className="mt-4 max-w-[60ch] text-[0.875rem] leading-6 text-white/59">
            Cette sélection borne les agents, missions, connecteurs et fichiers visibles pendant la session.
          </p>
          <fieldset className="mt-8 space-y-2">
            <legend className="sr-only">Sites autorisés</legend>
            {memberships.map((site) => {
              const selected = selectedId === site.id;
              return (
                <label
                  key={site.id}
                  className={`flex w-full cursor-pointer items-center gap-3 rounded-[14px] border px-4 py-3.5 text-left outline-none transition-[border-color,background-color,box-shadow] duration-150 focus-within:ring-2 focus-within:ring-[oklch(0.68_0.17_251/0.45)] ${
                    selected
                      ? "border-[oklch(0.68_0.17_251/0.72)] bg-[oklch(0.62_0.19_251/0.12)]"
                      : "border-white/10 bg-white/[0.035] hover:border-white/20 hover:bg-white/[0.055]"
                  }`}
                >
                  <input
                    type="radio"
                    name="active-site"
                    value={site.id}
                    checked={selected}
                    onChange={() => setSelectedId(site.id)}
                    className="sr-only"
                  />
                  <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-white/7 text-white/72">
                    <Building2Icon className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.8125rem] font-medium text-white/91">{site.name}</span>
                    <span className="mt-0.5 block truncate font-mono text-[0.625rem] text-white/40">
                      {site.slug} · {roleLabel(site.role)}
                    </span>
                  </span>
                  <span className={`grid size-5 shrink-0 place-items-center rounded-full border ${selected ? "border-[oklch(0.68_0.17_251)] bg-[oklch(0.62_0.19_251)] text-white" : "border-white/18 text-transparent"}`}>
                    <CheckIcon className="size-3" aria-hidden />
                  </span>
                </label>
              );
            })}
          </fieldset>
          {notice ? <InlineNotice notice={notice} /> : null}
          <div className="mt-8 flex justify-end border-t border-white/9 pt-5">
            <Button
              type="button"
              variant="primary"
              disabled={!selectedId || busy}
              onClick={() => void selectSite()}
              className="h-10 !rounded-[10px] !bg-[oklch(0.62_0.19_251)]"
            >
              {busy ? <LoaderCircleIcon className="size-4 animate-spin" aria-hidden /> : null}
              Ouvrir ce site
              <ArrowRightIcon className="size-4" aria-hidden />
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function MandateSelectionStep({
  email,
  mandates,
}: {
  email: string;
  mandates: AuthMandate[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const selectMandate = async () => {
    if (!selectedId) return;
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/auth?action=select-mandate", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Hermes-Toast": "0" },
        body: JSON.stringify(selectMandatePayload(selectedId)),
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      if (!response.ok) {
        throw new Error(body?.error?.message ?? "Ce mandat n’est plus disponible pour votre compte.");
      }
      window.location.assign("/");
    } catch (reason) {
      setNotice({
        tone: "error",
        message: reason instanceof Error ? reason.message : "Sélection impossible.",
      });
      setBusy(false);
    }
  };

  return (
    <section className="flex min-h-0 flex-col">
      <header className="flex shrink-0 items-center gap-5 border-b border-white/9 px-6 py-5 sm:px-10 lg:px-16 xl:px-24">
        <BrandMark compact />
        <div className="ml-auto hidden text-right sm:block">
          <p className="text-[0.6875rem] font-medium text-white/72">{email}</p>
          <p className="mt-0.5 text-[0.625rem] text-white/39">Identité Google vérifiée</p>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-8 pt-8 sm:px-10 lg:px-16 lg:pt-12 xl:px-24">
        <div className="mx-auto max-w-[35rem]">
          <StepHeading eyebrow="Mandat opérateur" title="Choisissez le périmètre à ouvrir." />
          <p className="mt-4 max-w-[60ch] text-[0.875rem] leading-6 text-white/59">
            Plusieurs mandats actifs vous sont affectés sur ce site. Un seul contexte est utilisé à la fois.
          </p>
          <fieldset className="mt-8 space-y-2">
            <legend className="sr-only">Mandats autorisés</legend>
            {mandates.map((mandate) => {
              const selected = selectedId === mandate.id;
              const scope = mandate.projectId ? `Projet ${mandate.projectId}` : "Tous les projets du site";
              return (
                <label
                  key={mandate.id}
                  className={`flex w-full cursor-pointer items-center gap-3 rounded-[14px] border px-4 py-3.5 text-left outline-none transition-[border-color,background-color,box-shadow] duration-150 focus-within:ring-2 focus-within:ring-[oklch(0.68_0.17_251/0.45)] ${
                    selected
                      ? "border-[oklch(0.68_0.17_251/0.72)] bg-[oklch(0.62_0.19_251/0.12)]"
                      : "border-white/10 bg-white/[0.035] hover:border-white/20 hover:bg-white/[0.055]"
                  }`}
                >
                  <input
                    type="radio"
                    name="active-mandate"
                    value={mandate.id}
                    checked={selected}
                    onChange={() => setSelectedId(mandate.id)}
                    className="sr-only"
                  />
                  <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-white/7 text-white/72">
                    <RadioTowerIcon className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.8125rem] font-medium text-white/91">{scope}</span>
                    <span className="mt-0.5 block truncate font-mono text-[0.625rem] text-white/40">{mandate.id}</span>
                  </span>
                  <span className={`grid size-5 shrink-0 place-items-center rounded-full border ${selected ? "border-[oklch(0.68_0.17_251)] bg-[oklch(0.62_0.19_251)] text-white" : "border-white/18 text-transparent"}`}>
                    <CheckIcon className="size-3" aria-hidden />
                  </span>
                </label>
              );
            })}
          </fieldset>
          {notice ? <InlineNotice notice={notice} /> : null}
          <div className="mt-8 flex justify-end border-t border-white/9 pt-5">
            <Button
              type="button"
              variant="primary"
              disabled={!selectedId || busy}
              onClick={() => void selectMandate()}
              className="h-10 !rounded-[10px] !bg-[oklch(0.62_0.19_251)]"
            >
              {busy ? <LoaderCircleIcon className="size-4 animate-spin" aria-hidden /> : null}
              Ouvrir ce mandat
              <ArrowRightIcon className="size-4" aria-hidden />
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function MembershipRequired({ email }: { email: string }) {
  return (
    <section className="flex min-h-0 flex-col bg-[oklch(0.135_0.008_258)] px-6 py-7 sm:px-10 lg:px-16 xl:px-24">
      <BrandMark />
      <div className="flex min-h-0 flex-1 items-center py-8 lg:py-12">
        <div className="max-w-[35rem]">
          <p className="font-mono text-[0.625rem] font-medium uppercase tracking-[0.18em] text-[oklch(0.77_0.16_18)]">
            Accès non attribué
          </p>
          <h1 className="mt-5 max-w-[14ch] text-balance text-[2.25rem] font-semibold leading-[1.04] tracking-[-0.047em] text-white">
            Aucun site n’est lié à ce compte.
          </h1>
          <p className="mt-4 max-w-[58ch] text-[0.875rem] leading-6 text-white/59">
            Demandez à un administrateur d’ajouter {email} à un site, puis reconnectez-vous. Aucun périmètre par défaut ne sera utilisé.
          </p>
        </div>
      </div>
    </section>
  );
}

function roleLabel(role: AuthSite["role"]) {
  const labels = {
    admin: "Administrateur",
    operator: "Opérateur",
    requester: "Demandeur",
    approver: "Approbateur",
    auditor: "Auditeur",
  } satisfies Record<AuthSite["role"], string>;
  return labels[role];
}

function oauthCallbackNotice() {
  const code = new URLSearchParams(window.location.search).get("auth_error");
  if (!code) return null;
  if (code === "OIDC_STATE_INVALID") return "Cette tentative de connexion a expiré ou a déjà été utilisée. Recommencez avec Google.";
  if (code === "GOOGLE_EMAIL_FORBIDDEN") return "Ce compte Google n’est pas autorisé pour cette Console.";
  if (code === "SITE_MEMBERSHIP_REQUIRED") return "Ce compte est vérifié, mais aucun site ne lui a encore été attribué.";
  if (code === "SITE_BOOTSTRAP_AMBIGUOUS") return "Le premier accès ne peut pas choisir un site automatiquement. Préparez un site unique ou attribuez le compte manuellement.";
  if (code === "AUTH_RATE_LIMITED") return "Trop de tentatives ont été effectuées. Réessayez dans quelques minutes.";
  return "La connexion Google n’a pas pu être finalisée. Recommencez avec Google.";
}

function Welcome({ onGoogle }: { onGoogle: () => void }) {
  return (
    <section className="flex min-h-0 flex-col bg-[oklch(0.135_0.008_258)] px-6 py-7 sm:px-10 lg:px-16 xl:px-24">
      <BrandMark />
      <div className="flex min-h-0 flex-1 items-center py-8 lg:py-12">
        <div className="max-w-[35rem]">
          <div className="flex items-center gap-3">
            <span className="font-mono text-[0.625rem] font-medium uppercase tracking-[0.17em] text-[oklch(0.72_0.14_251)]">Première activation</span>
            <span className="h-px w-9 bg-white/14" />
            <span className="text-[0.6875rem] text-white/43">2 étapes, moins de 5 min</span>
          </div>
          <h1 className="mt-7 text-balance text-[2.9rem] font-semibold leading-[0.98] tracking-[-0.056em] text-white sm:text-[4rem]">
            Faites passer vos agents du potentiel à l’opérationnel.
          </h1>
          <p className="mt-7 max-w-[52ch] text-[0.9375rem] leading-7 text-white/61">
            Une identité vérifiée, un runtime relié, puis un premier agent. Le reste de la Console se construit à partir de décisions traçables.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={onGoogle}
              className="inline-flex h-11 items-center gap-3 rounded-[6px] border border-[oklch(0.78_0.004_258)] bg-[oklch(0.99_0.001_258)] px-4 text-[0.875rem] font-medium text-[oklch(0.28_0.008_258)] shadow-[0_1px_2px_oklch(0.06_0.006_258/0.22)] transition-colors duration-150 hover:bg-[oklch(0.96_0.002_258)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(0.63_0.18_251)] focus-visible:ring-offset-2 focus-visible:ring-offset-[oklch(0.135_0.008_258)] active:bg-[oklch(0.93_0.003_258)]"
            >
              <GoogleGlyph />
              Continuer avec Google
            </button>
            <span className="flex items-center gap-2 text-[0.6875rem] text-white/42"><ShieldCheckIcon className="size-3.5 text-[oklch(0.78_0.16_141)]" aria-hidden />Accès limité aux opérateurs autorisés</span>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-white/9 pt-5 text-[0.6875rem] text-white/38">
        <span>Google s’ouvre dans votre navigateur habituel.</span>
        <span>Hermes exécute, la Console conserve les décisions.</span>
      </div>
    </section>
  );
}

function RuntimeStep({ email, onComplete }: { email: string; onComplete: () => void }) {
  const [baseUrl, setBaseUrl] = useState("http://127.0.0.1:8642");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState<"test" | "save" | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const tested = notice?.tone === "success";

  const payload = () => ({
    baseUrl: baseUrl.trim(),
    ...(token.trim() ? { token: token.trim() } : {}),
    transport: "direct" as const,
  });

  const testRuntime = async () => {
    if (!token.trim()) {
      setNotice({ tone: "error", message: "Saisissez le token Hermes (API_SERVER_KEY) avant de lancer le test." });
      return;
    }
    setBusy("test");
    setNotice(null);
    try {
      const response = await fetch("/api/runtime/test", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Hermes-Toast": "0" },
        body: JSON.stringify(payload()),
      });
      const body = (await response.json().catch(() => null)) as { health?: { version?: string }; error?: { message?: string } } | null;
      if (!response.ok) throw new Error(body?.error?.message ?? "Le runtime ne répond pas.");
      setNotice({ tone: "success", message: `Hermes répond${body?.health?.version ? ` · ${body.health.version}` : ""}.` });
    } catch (reason) {
      setNotice({ tone: "error", message: reason instanceof Error ? reason.message : "Le test a échoué." });
    } finally {
      setBusy(null);
    }
  };

  const saveRuntime = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!tested) {
      setNotice({ tone: "error", message: "Testez Hermes avant de poursuivre." });
      return;
    }
    setBusy("save");
    try {
      const saved = await fetch("/api/runtime", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-Hermes-Toast": "0" },
        body: JSON.stringify(payload()),
      });
      const body = (await saved.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!saved.ok) throw new Error(body?.error?.message ?? "La connexion n’a pas été enregistrée.");
      const advanced = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Hermes-Toast": "0" },
        body: JSON.stringify({ step: "agent" }),
      });
      if (!advanced.ok) throw new Error("La connexion est enregistrée, mais l’étape suivante n’a pas été ouverte.");
      onComplete();
    } catch (reason) {
      setNotice({ tone: "error", message: reason instanceof Error ? reason.message : "Enregistrement impossible." });
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="flex min-h-0 flex-col">
      <StepTop step={1} email={email} />
      <form onSubmit={saveRuntime} className="min-h-0 flex-1 overflow-y-auto px-6 pb-8 pt-8 sm:px-10 lg:px-16 lg:pt-12 xl:px-24">
        <div className="mx-auto max-w-[35rem]">
          <StepHeading eyebrow="Runtime Hermes" title="Connectez le moteur qui exécutera vos missions." />
          <p className="mt-4 text-[0.875rem] leading-6 text-white/59">Cette première configuration reste locale. Le navigateur ne reçoit jamais votre token Hermes.</p>
          <div className="mt-8 space-y-5">
            <Field label="URL Hermes" hint="Service API local, pas le dashboard.">
              <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} className={inputClass} inputMode="url" required />
            </Field>
            <Field label="Token API" hint="La Console le chiffre avant de l’enregistrer.">
              <input value={token} onChange={(event) => { setToken(event.target.value); setNotice(null); }} className={inputClass} type="password" autoComplete="off" required />
            </Field>
          </div>
          {notice ? <InlineNotice notice={notice} /> : null}
          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-white/9 pt-5">
            <Button type="button" variant="secondary" onClick={testRuntime} disabled={busy !== null} className="h-10 !rounded-[10px]">
              {busy === "test" ? <LoaderCircleIcon className="size-4 animate-spin" /> : <RadioTowerIcon className="size-4" />}
              Tester Hermes
            </Button>
            <Button type="submit" variant="primary" disabled={busy !== null || !tested} className="h-10 !rounded-[10px] !bg-[oklch(0.62_0.19_251)]">
              {busy === "save" ? <LoaderCircleIcon className="size-4 animate-spin" /> : null}
              Continuer
              <ArrowRightIcon className="size-4" />
            </Button>
          </div>
        </div>
      </form>
    </section>
  );
}

function AgentStep({
  email,
  disclosure,
  consentCurrent,
  onComplete,
}: {
  email: string;
  disclosure: AiDisclosure;
  consentCurrent: boolean;
  onComplete: () => void;
}) {
  const [busy, setBusy] = useState<"create" | "skip" | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [consentChecked, setConsentChecked] = useState(consentCurrent);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<AgentFormValues>({ resolver: zodResolver(agentSchema), mode: "onBlur" });

  const finishSetup = async () => {
    if (!consentCurrent) {
      if (!consentChecked) {
        throw new Error("Lisez et acceptez la notice IA avant d’ouvrir la Console.");
      }
      await submitAiDisclosureConsent(disclosure.version);
    }
    const completed = await fetch("/api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Hermes-Toast": "0" },
      body: JSON.stringify({ step: "completed" }),
    });
    const completedBody = (await completed.json().catch(() => null)) as
      | { error?: { message?: string } }
      | null;
    if (!completed.ok) {
      throw new Error(
        completedBody?.error?.message ?? "La mise en service n’a pas été finalisée.",
      );
    }
    onComplete();
  };

  const createAgent = async (values: AgentFormValues) => {
    setBusy("create");
    setNotice(null);
    try {
      const response = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Hermes-Toast": "0" },
        body: JSON.stringify({
          name: values.name,
          description: values.description || null,
          instructions: values.instructions,
        }),
      });
      const body = (await response.json().catch(() => null)) as { agent?: { id?: string }; error?: { message?: string; fields?: Partial<Record<keyof AgentFormValues, string[]>> } } | null;
      if (!response.ok || !body?.agent?.id) {
        for (const [field, messages] of Object.entries(body?.error?.fields ?? {})) {
          const message = messages?.[0];
          if (message && field in agentSchema.shape) setError(field as keyof AgentFormValues, { type: "server", message });
        }
        throw new Error(body?.error?.message ?? "L’agent n’a pas été créé.");
      }
      await finishSetup();
    } catch (reason) {
      setNotice({ tone: "error", message: reason instanceof Error ? reason.message : "Création impossible." });
    } finally {
      setBusy(null);
    }
  };

  const skipAgent = async () => {
    setBusy("skip");
    setNotice(null);
    try {
      await finishSetup();
    } catch (reason) {
      setNotice({ tone: "error", message: reason instanceof Error ? reason.message : "Impossible d’ouvrir la Console." });
      setBusy(null);
    }
  };

  return (
    <section className="flex min-h-0 flex-col">
      <StepTop step={2} email={email} />
      <form onSubmit={handleSubmit(createAgent)} noValidate className="min-h-0 flex-1 overflow-y-auto px-6 pb-8 pt-8 sm:px-10 lg:px-16 lg:pt-12 xl:px-24">
        <div className="mx-auto max-w-[35rem]">
          <StepHeading eyebrow="Premier agent" title="Définissez l’identité qui recevra vos premières missions." />
          <p className="mt-4 text-[0.875rem] leading-6 text-white/59">Vous pourrez la préciser, la dupliquer ou créer d’autres agents après cette première mise en service.</p>
          <div className="mt-8 space-y-5">
            <Field label="Nom" hint="Visible dans la sélection d’agent." error={errors.name?.message}>
              <input {...register("name")} aria-invalid={Boolean(errors.name)} placeholder="Ex. Recherche et synthèse" className={fieldInputClass(Boolean(errors.name))} />
            </Field>
            <Field label="Description" hint="Une phrase pour situer son rôle." error={errors.description?.message}>
              <input {...register("description")} aria-invalid={Boolean(errors.description)} placeholder="Ex. Prépare des notes sourcées pour l’équipe" className={fieldInputClass(Boolean(errors.description))} />
            </Field>
            <Field label="Instructions" hint="Injectées dans le prompt système à chaque mission." error={errors.instructions?.message}>
              <textarea {...register("instructions")} aria-invalid={Boolean(errors.instructions)} rows={5} placeholder="Décrivez son périmètre, ses règles et la forme attendue de ses résultats." className={`${fieldInputClass(Boolean(errors.instructions))} h-auto min-h-32 resize-y py-3`} />
            </Field>
          </div>
          <AiDisclosurePanel
            disclosure={disclosure}
            accepted={consentCurrent}
            checked={consentChecked}
            onCheckedChange={setConsentChecked}
          />
          {notice ? <InlineNotice notice={notice} /> : null}
          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-white/9 pt-5">
            <Button type="button" variant="secondary" onClick={() => void skipAgent()} disabled={busy !== null || (!consentCurrent && !consentChecked)} className="h-10 !rounded-[10px]">
              {busy === "skip" ? <LoaderCircleIcon className="size-4 animate-spin" /> : null}
              Skip
            </Button>
            <Button type="submit" variant="primary" disabled={busy !== null || (!consentCurrent && !consentChecked)} className="h-10 !rounded-[10px] !bg-[oklch(0.62_0.19_251)]">
              {busy === "create" ? <LoaderCircleIcon className="size-4 animate-spin" /> : null}
              Créer l’agent et ouvrir la Console
              <ArrowRightIcon className="size-4" />
            </Button>
          </div>
        </div>
      </form>
    </section>
  );
}

async function submitAiDisclosureConsent(version: string) {
  const response = await fetch("/api/setup", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Hermes-Toast": "0" },
    body: JSON.stringify(aiDisclosureConsentPayload(version)),
  });
  const body = (await response.json().catch(() => null)) as
    | { error?: { message?: string } }
    | null;
  if (!response.ok) {
    throw new Error(
      body?.error?.message ?? "Le consentement à la notice IA n’a pas été enregistré.",
    );
  }
}

function ConsentStep({
  email,
  disclosure,
  onComplete,
}: {
  email: string;
  disclosure: AiDisclosure;
  onComplete: () => void;
}) {
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const accept = async () => {
    if (!checked) return;
    setBusy(true);
    setNotice(null);
    try {
      await submitAiDisclosureConsent(disclosure.version);
      onComplete();
    } catch (reason) {
      setNotice({
        tone: "error",
        message:
          reason instanceof Error ? reason.message : "Enregistrement impossible.",
      });
      setBusy(false);
    }
  };

  return (
    <section className="flex min-h-0 flex-col">
      <StepTop step={2} email={email} />
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-8 pt-8 sm:px-10 lg:px-16 lg:pt-12 xl:px-24">
        <div className="mx-auto max-w-[35rem]">
          <StepHeading
            eyebrow="Notice IA mise à jour"
            title="Gardez le contrôle avant votre prochaine mission."
          />
          <p className="mt-4 text-[0.875rem] leading-6 text-white/59">
            Votre installation est prête. Cette version de la notice doit être acceptée par chaque opérateur avant tout nouveau calcul.
          </p>
          <AiDisclosurePanel
            disclosure={disclosure}
            accepted={false}
            checked={checked}
            onCheckedChange={setChecked}
          />
          {notice ? <InlineNotice notice={notice} /> : null}
          <div className="mt-8 flex justify-end border-t border-white/9 pt-5">
            <Button
              type="button"
              variant="primary"
              disabled={busy || !checked}
              onClick={() => void accept()}
              className="h-10 !rounded-[10px] !bg-[oklch(0.62_0.19_251)]"
            >
              {busy ? <LoaderCircleIcon className="size-4 animate-spin" /> : null}
              Accepter et ouvrir la Console
              <ArrowRightIcon className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

export function AiDisclosurePanel({
  disclosure,
  accepted,
  checked,
  onCheckedChange,
}: {
  disclosure: AiDisclosure;
  accepted: boolean;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <section
      role="region"
      aria-labelledby="ai-disclosure-title"
      className="mt-8 rounded-[12px] border border-white/11 bg-white/[0.035] p-5"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-[oklch(0.62_0.19_251/0.16)] text-[oklch(0.76_0.13_251)]">
          <ShieldCheckIcon className="size-4" aria-hidden />
        </span>
        <div>
          <h2 id="ai-disclosure-title" className="text-[0.8125rem] font-medium text-white/91">
            {disclosure.title}
          </h2>
          <p className="mt-1 font-mono text-[0.5625rem] uppercase tracking-[0.13em] text-white/38">
            Version {disclosure.version}
          </p>
        </div>
      </div>
      <p id="ai-disclosure-summary" className="mt-4 text-[0.75rem] leading-5 text-white/59">{disclosure.summary}</p>
      <ul id="ai-disclosure-items" className="mt-3 space-y-2 text-[0.75rem] leading-5 text-white/55">
        {disclosure.items.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="mt-[0.52rem] size-1 shrink-0 rounded-full bg-white/35" aria-hidden />
            <span>{item}</span>
          </li>
        ))}
      </ul>
      {accepted ? (
        <p className="mt-4 flex items-center gap-2 border-t border-white/9 pt-4 text-[0.6875rem] text-[oklch(0.79_0.17_141)]">
          <CheckCircle2Icon className="size-3.5" aria-hidden />
          Version actuelle déjà acceptée pour votre compte.
        </p>
      ) : (
        <label htmlFor="ai-disclosure-consent" className="mt-4 flex cursor-pointer items-start gap-3 border-t border-white/9 pt-4 text-[0.75rem] leading-5 text-white/76">
          <input
            id="ai-disclosure-consent"
            type="checkbox"
            checked={checked}
            onChange={(event) => onCheckedChange(event.target.checked)}
            aria-describedby="ai-disclosure-summary ai-disclosure-items"
            className="mt-0.5 size-4 rounded border-white/20 accent-[oklch(0.62_0.19_251)]"
          />
          <span>J’ai lu cette notice et j’accepte le traitement de mes missions dans ce cadre.</span>
        </label>
      )}
    </section>
  );
}

function StepTop({ step, email }: { step: 1 | 2; email: string }) {
  return (
    <header className="flex shrink-0 items-center gap-5 border-b border-white/9 px-6 py-5 sm:px-10 lg:px-16 xl:px-24">
      <BrandMark compact />
      <div className="ml-auto hidden text-right sm:block">
        <p className="text-[0.6875rem] font-medium text-white/72">{email}</p>
        <p className="mt-0.5 text-[0.625rem] text-white/39">Identité Google vérifiée</p>
      </div>
      <div className="flex items-center gap-2" role="progressbar" aria-valuemin={1} aria-valuemax={2} aria-valuenow={step} aria-label={`Étape ${step} sur 2`}>
        {[1, 2].map((index) => <span key={index} className={`size-2 rounded-full ${index <= step ? "bg-[oklch(0.67_0.18_251)]" : "bg-white/16"}`} />)}
        <span className="ml-1 font-mono text-[0.625rem] text-white/45">{step}/2</span>
      </div>
    </header>
  );
}

function OperationPreview({ step }: { step: SetupStep | "welcome" | "site" }) {
  const state = step === "welcome" ? "En attente de votre identité" : step === "site" ? "Périmètre à sélectionner" : step === "runtime" ? "Runtime en cours de connexion" : step === "agent" ? "Premier agent à définir" : "Poste prêt";

  return (
    <aside className="relative hidden min-h-0 overflow-hidden border-l border-white/9 bg-[oklch(0.12_0.006_258)] lg:block">
      <img src={setupOperationBoard} alt="Plan de travail matérialisant le passage d’une mission à un agent opérationnel." className="absolute inset-0 h-full w-full object-cover object-center" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,oklch(0.11_0.006_258/0.15)_0%,oklch(0.11_0.006_258/0.18)_36%,oklch(0.11_0.006_258/0.82)_100%)]" />
      <div className="relative flex h-full flex-col justify-between p-9 xl:p-12">
        <div className="flex items-center justify-between">
          <p className="font-mono text-[0.625rem] font-medium uppercase tracking-[0.18em] text-white/56">Mission control</p>
          <span className="flex items-center gap-2 rounded-full border border-white/14 bg-[oklch(0.16_0.008_258/0.72)] px-2.5 py-1 text-[0.625rem] text-white/72"><span className="size-1.5 rounded-full bg-[oklch(0.78_0.18_141)]" />Local</span>
        </div>
        <div className="max-w-[28rem]">
          <p className="text-[2.15rem] font-semibold leading-[1.01] tracking-[-0.048em] text-white">Une mission claire. Une trace lisible. Une décision humaine.</p>
          <div className="mt-7 flex items-center gap-3 border-t border-white/16 pt-4">
            <span className="grid size-8 place-items-center rounded-[10px] bg-[oklch(0.62_0.19_251)] text-white"><RadioTowerIcon className="size-4" aria-hidden /></span>
            <div><p className="text-[0.75rem] font-medium text-white">{state}</p><p className="mt-0.5 text-[0.6875rem] text-white/54">Le contrôle reste dans la Console.</p></div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-8 place-items-center rounded-[9px] border border-white/15 bg-white/7 text-[0.75rem] font-semibold text-white">H</span>
      <div>
        <p className="text-[0.8125rem] font-semibold tracking-[-0.02em] text-white">Hermes Console</p>
        {!compact ? <p className="mt-0.5 font-mono text-[0.5625rem] uppercase tracking-[0.15em] text-white/42">System operations</p> : null}
      </div>
    </div>
  );
}

function StepHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return <><p className="font-mono text-[0.625rem] font-medium uppercase tracking-[0.18em] text-[oklch(0.72_0.14_251)]">{eyebrow}</p><h1 className="mt-4 max-w-[14ch] text-balance text-[2.25rem] font-semibold leading-[1.04] tracking-[-0.047em] text-white">{title}</h1></>;
}

function fieldInputClass(invalid: boolean) {
  return `${inputClass} ${invalid ? "border-[oklch(0.66_0.16_18)] focus:border-[oklch(0.72_0.15_18)] focus:ring-[oklch(0.7_0.14_18/0.16)]" : ""}`;
}

function Field({ label, hint, error, children }: { label: string; hint: string; error?: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-[0.8125rem] font-medium text-white/88">{label}</span><span className="mt-1 block text-[0.6875rem] text-white/43">{hint}</span><span className="mt-2 block">{children}</span>{error ? <span role="alert" className="mt-1.5 flex items-center gap-1.5 text-[0.6875rem] text-[oklch(0.77_0.16_18)]"><CircleAlertIcon className="size-3 shrink-0" aria-hidden />{error}</span> : null}</label>;
}

function InlineNotice({ notice }: { notice: Exclude<Notice, null> }) {
  const Icon = notice.tone === "success" ? CheckCircle2Icon : CircleAlertIcon;
  return <p role={notice.tone === "error" ? "alert" : "status"} className={`mt-5 flex items-start gap-2 text-[0.75rem] leading-5 ${notice.tone === "success" ? "text-[oklch(0.79_0.17_141)]" : "text-[oklch(0.77_0.16_18)]"}`}><Icon className="mt-0.5 size-3.5 shrink-0" />{notice.message}</p>;
}

function NoticeLine({ notice }: { notice: Exclude<Notice, null> }) {
  return <div role="alert" className="fixed inset-x-0 bottom-0 z-10 flex justify-center p-4"><p className="flex max-w-[42rem] items-center gap-2 rounded-[10px] border border-[oklch(0.65_0.15_18/0.45)] bg-[oklch(0.22_0.02_18)] px-3 py-2 text-[0.75rem] text-[oklch(0.85_0.12_18)] shadow-lg"><CircleAlertIcon className="size-4 shrink-0" />{notice.message}</p></div>;
}

function LoadingState() {
  return <section className="flex min-h-0 flex-col px-6 py-7 sm:px-10 lg:px-16 xl:px-24"><BrandMark /><div className="flex flex-1 items-center"><div className="space-y-4"><div className="h-3 w-28 animate-pulse rounded bg-white/8" /><div className="h-12 w-80 animate-pulse rounded bg-white/8" /><div className="h-3 w-64 animate-pulse rounded bg-white/8" /></div></div></section>;
}

function GoogleGlyph() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-[18px] shrink-0">
      <path fill="#4285F4" d="M21.35 12.27c0-.79-.07-1.55-.2-2.27H12v4.3h5.22a4.46 4.46 0 0 1-1.94 2.92v2.79h3.59c2.1-1.94 3.31-4.8 3.31-8.19Z" />
      <path fill="#34A853" d="M12 21.82c2.64 0 4.85-.88 6.47-2.39l-3.59-2.79c-.99.67-2.25 1.07-3.88 1.07-2.53 0-4.67-1.71-5.44-4.01H1.85v2.88A9.78 9.78 0 0 0 12 21.82Z" />
      <path fill="#FBBC05" d="M5.56 13.7a5.9 5.9 0 0 1 0-3.78V7.04H1.85a9.82 9.82 0 0 0 0 9.54l3.71-2.88Z" />
      <path fill="#EA4335" d="M12 5.91c1.74 0 3.3.6 4.53 1.79l3.4-3.4C16.84 1.42 14.64.18 12 .18A9.78 9.78 0 0 0 1.85 7.04l3.71 2.88c.77-2.3 2.91-4.01 5.44-4.01Z" />
    </svg>
  );
}
