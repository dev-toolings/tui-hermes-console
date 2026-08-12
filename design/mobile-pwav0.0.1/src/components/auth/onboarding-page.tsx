import { useState, type ReactNode } from "react";
import { Navigate, useNavigate } from "react-router";
import {
  ArrowRight,
  Brain,
  Briefcase,
  Code2,
  Compass,
  FileEdit,
  GraduationCap,
  ListChecks,
  Megaphone,
  MoreHorizontal,
  Palette,
  PenLine,
  Plus,
  Rocket,
  Search,
  Settings2,
  User,
} from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { orgPath } from "../mobile/mobile-nav";
import {
  hasOnboarded,
  useAuthStore,
  type QuestionnaireAnswers,
} from "../../state/auth-store";
import {
  createDefaultChannelCategories,
  createDefaultChannels,
  loadConsoleState,
  saveConsoleState,
  type ConsoleState,
} from "../../state/console-store";
import type { Workspace } from "../sidebar/workspace-sidebar";
import { workspaceToneClasses } from "../shell/workspace-tone";

/**
 * First-run onboarding, mirrored from multica's OnboardingFlow
 * (packages/views/onboarding/onboarding-flow.tsx) minus the Runtime step,
 * which is specific to multica's local agent daemon:
 * Welcome → About you (role + use case) → Workspace (create or continue).
 */
type OnboardingStep = "welcome" | "about_you" | "workspace";

const STEP_RAIL: Array<{ id: OnboardingStep; label: string; detail: string }> = [
  { id: "about_you", label: "À propos de vous", detail: "Votre rôle, et ce que vous voulez faire." },
  { id: "workspace", label: "Espace de travail", detail: "Nommez-le et choisissez son URL." },
];

/** Router segments an organization slug may never shadow. */
const RESERVED_SLUGS = new Set(["login", "onboarding"]);
const SLUG_REGEX = /^[a-z0-9-]+$/;

export function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const WORKSPACE_TONES = [
  "bg-[#8b5cf6]",
  "bg-[#ec4899]",
  "bg-[#10b981]",
  "bg-[#f59e0b]",
];

/** Same shape as App's createWorkspace, with the slug as the routable id. */
function createWorkspace(
  state: ConsoleState,
  name: string,
  slug: string,
): ConsoleState {
  const workspace: Workspace = {
    id: slug,
    name,
    description: "Espace local",
    short: name.slice(0, 2).toUpperCase(),
    tone: WORKSPACE_TONES[state.workspaces.length % WORKSPACE_TONES.length],
  };
  return {
    ...state,
    activeWorkspaceId: slug,
    workspaces: [...state.workspaces, workspace],
    workspaceData: {
      ...state.workspaceData,
      [slug]: {
        items: [],
        members: [
          {
            name: state.profile.name,
            role: state.profile.role,
            state: "En ligne",
            initials: state.profile.name
              .split(" ")
              .map((part) => part[0])
              .join("")
              .slice(0, 2)
              .toUpperCase(),
          },
        ],
        audit: [
          {
            id: `audit-${Date.now()}`,
            level: "info" as const,
            label: "Workspace créé localement",
            time: "à l'instant",
          },
        ],
        notifications: true,
        selectedMember: state.profile.name,
        channelCategories: createDefaultChannelCategories(),
        channels: createDefaultChannels([state.profile.name]),
        messages: { general: [], "équipe": [], incidents: [] },
      },
    },
  };
}

export function OnboardingPage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const onboarded = useAuthStore(hasOnboarded);
  const [consoleState, setConsoleState] = useState(loadConsoleState);
  const [step, setStep] = useState<OnboardingStep>("welcome");

  if (!user) return <Navigate to="/login" replace />;
  if (onboarded) return <Navigate to="/" replace />;

  const existing =
    consoleState.workspaces.find(
      (workspace) => workspace.id === consoleState.activeWorkspaceId,
    ) ?? consoleState.workspaces[0];

  const finish = (workspaceId: string) => {
    useAuthStore.getState().completeOnboarding();
    navigate(orgPath(workspaceId, "/inbox"), { replace: true });
  };

  const handleCreate = (name: string, slug: string) => {
    const next = createWorkspace(consoleState, name, slug);
    setConsoleState(next);
    saveConsoleState(next);
    finish(slug);
  };

  if (step === "welcome")
    return (
      <StepWelcome
        userName={user.name}
        onNext={() => setStep("about_you")}
        onSkip={existing ? () => finish(existing.id) : undefined}
      />
    );

  return (
    <StepFrame
      currentStep={step}
      onBack={() =>
        setStep(step === "about_you" ? "welcome" : "about_you")
      }
    >
      {step === "about_you" ? (
        <StepAboutYou onAdvance={() => setStep("workspace")} />
      ) : (
        <StepWorkspace
          existing={existing}
          takenSlugs={
            new Set(
              [...consoleState.workspaces, ...consoleState.archivedWorkspaces].map(
                (workspace) => workspace.id,
              ),
            )
          }
          onOpenExisting={(workspace) => finish(workspace.id)}
          onCreate={handleCreate}
        />
      )}
    </StepFrame>
  );
}

// ---------------------------------------------------------------------------
// Step 0 — Welcome
// ---------------------------------------------------------------------------

function StepWelcome({
  userName,
  onNext,
  onSkip,
}: {
  userName: string;
  onNext: () => void;
  onSkip?: () => void;
}) {
  return (
    <div className="flex min-h-svh flex-col bg-[var(--surface-sunken)] lg:flex-row">
      <LogoutButton />
      <div className="flex flex-1 flex-col justify-center px-6 py-12 sm:px-10 md:px-20 xl:px-24">
        <div className="flex w-full max-w-[540px] flex-col gap-8">
          <div className="flex items-center gap-2.5">
            <img src="/hermesbot-logo.png" alt="" aria-hidden className="size-6 rounded-md" />
            <span className="text-base font-semibold tracking-tight text-foreground">
              Bienvenue sur Hermes Console, {userName.split(" ")[0]}
            </span>
          </div>

          <h1 className="text-balance text-4xl font-semibold leading-[1.08] tracking-tight text-foreground sm:text-5xl">
            Vos agents et votre équipe,
            <br />
            dans <em className="italic text-primary">un seul espace.</em>
          </h1>

          <div className="flex flex-col gap-3">
            <p className="text-base leading-relaxed text-foreground">
              Confiez-leur des missions comme à des collègues — ils s'en
              emparent, mettent à jour l'état et commentent une fois terminé.
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              À la fin, votre organisation aura sa propre URL et son espace prêt
              à l'emploi.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button size="lg" onClick={onNext}>
              Commencer l'exploration
              <ArrowRight className="size-4" />
            </Button>
            {onSkip && (
              <Button size="lg" variant="ghost" onClick={onSkip}>
                J'ai déjà fait ça
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="hidden flex-1 flex-col items-center justify-center gap-7 border-l border-[var(--border)] bg-muted/40 px-8 py-8 lg:flex">
        <p className="max-w-[440px] text-balance text-center text-sm italic leading-snug text-muted-foreground">
          Chaque mission, chaque fil, chaque décision — partagés par votre
          équipe et vos agents.
        </p>
        <WelcomeIllustration />
      </div>
    </div>
  );
}

/** Reduced take on multica's mock activity pile: three cards, slight rotations. */
function WelcomeIllustration() {
  const cards = [
    {
      actor: "Vous",
      body: "peux-tu préparer un brouillon d'annonce ? Appuie-toi sur les entretiens de l'agent Recherche.",
      meta: "HRM-42",
      className: "",
    },
    {
      actor: "Agent Contenu",
      body: "Je m'en occupe. Je reprends les citations de Recherche, angle « temps gagné »…",
      meta: "HRM-42 · En cours",
      className: "-translate-x-5 -rotate-[1.2deg]",
    },
    {
      actor: "Agent Recherche",
      body: "Entretiens de la semaine synthétisés — 12 appels, 4 thèmes récurrents, 3 citations.",
      meta: "HRM-38 · Terminé · il y a 15 min",
      className: "translate-x-8 rotate-[1.6deg]",
    },
  ];
  return (
    <div className="flex w-full max-w-[460px] flex-col gap-3">
      {cards.map((card) => (
        <div
          key={card.actor}
          className={`rounded-lg border border-[var(--border)] bg-card px-4 py-3.5 shadow-[var(--shadow-xs)] transition-all duration-200 ease-out hover:-translate-y-0.5 hover:rotate-0 ${card.className}`}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="truncate text-sm font-medium text-foreground">{card.actor}</span>
            <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{card.meta}</span>
          </div>
          <p className="mt-2 text-sm leading-snug text-foreground">{card.body}</p>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shell for the persisted steps — progress rail + scrolling column
// ---------------------------------------------------------------------------

function StepFrame({
  currentStep,
  onBack,
  children,
}: {
  currentStep: OnboardingStep;
  onBack: () => void;
  children: ReactNode;
}) {
  const currentIndex = STEP_RAIL.findIndex((entry) => entry.id === currentStep);
  return (
    <div className="flex min-h-svh bg-[var(--surface-sunken)]">
      <aside className="hidden w-72 shrink-0 flex-col justify-between border-r border-[var(--border)] bg-card px-6 py-8 md:flex">
        <div className="flex flex-col gap-8">
          <div className="flex items-center gap-2.5">
            <img src="/hermesbot-logo.png" alt="" aria-hidden className="size-6 rounded-md" />
            <span className="text-sm font-semibold text-foreground">Hermes Console</span>
          </div>
          <nav aria-label="Étapes de l'onboarding" className="flex flex-col gap-5">
            {STEP_RAIL.map((entry, index) => {
              const state =
                index < currentIndex ? "done" : index === currentIndex ? "current" : "todo";
              return (
                <div key={entry.id} className="flex items-start gap-3">
                  <span
                    aria-hidden
                    className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
                      state === "current"
                        ? "bg-primary text-primary-foreground"
                        : state === "done"
                          ? "bg-[var(--state-info)] text-[var(--state-info-fg)]"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {index + 1}
                  </span>
                  <span className="flex flex-col">
                    <span
                      className={`text-sm font-medium ${state === "current" ? "text-foreground" : "text-muted-foreground"}`}
                    >
                      {entry.label}
                    </span>
                    <span className="text-xs text-muted-foreground">{entry.detail}</span>
                  </span>
                </div>
              );
            })}
          </nav>
        </div>
        <LogoutButton inline />
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto px-6 py-8 sm:px-10 lg:px-14 lg:py-10">
        <div className="mx-auto flex min-h-full w-full max-w-[28rem] flex-col">
          <div className="mb-6 flex items-center justify-between md:mb-2">
            <button
              type="button"
              onClick={onBack}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              ← Retour
            </button>
            <span className="text-xs text-muted-foreground md:hidden">
              Étape {currentIndex + 1} / {STEP_RAIL.length}
            </span>
            <span className="md:hidden">
              <LogoutButton inline />
            </span>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}

function StepHeading({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex flex-col gap-1.5" aria-live="polite">
      <h1 className="text-balance text-xl font-semibold text-foreground">{title}</h1>
      {description ? (
        <p className="text-pretty text-sm text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}

function StepFooter({ hint, children }: { hint?: string; children: ReactNode }) {
  return (
    <div className="mt-auto flex flex-col gap-2 pb-2 pt-10">
      {hint ? (
        <p aria-live="polite" className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {children}
    </div>
  );
}

function LogoutButton({ inline = false }: { inline?: boolean }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => {
        useAuthStore.getState().logout();
        navigate("/login", { replace: true });
      }}
      className={
        inline
          ? "self-start text-xs text-muted-foreground hover:text-foreground"
          : "absolute right-4 top-4 z-10 text-xs text-muted-foreground hover:text-foreground"
      }
    >
      Se déconnecter
    </button>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — About you (role single-select + use case multi-select)
// ---------------------------------------------------------------------------

type Option = { slug: string; icon: ReactNode; label: string; isOther?: boolean };

const ROLE_OPTIONS: Option[] = [
  { slug: "engineer", icon: <Code2 className="size-4" />, label: "Ingénieur / développeur" },
  { slug: "product", icon: <Briefcase className="size-4" />, label: "Product manager" },
  { slug: "designer", icon: <Palette className="size-4" />, label: "Designer" },
  { slug: "founder", icon: <Rocket className="size-4" />, label: "Fondateur / dirigeant" },
  { slug: "marketing", icon: <Megaphone className="size-4" />, label: "Marketing / growth" },
  { slug: "writer", icon: <PenLine className="size-4" />, label: "Rédaction / contenu" },
  { slug: "research", icon: <Search className="size-4" />, label: "Recherche / analyse" },
  { slug: "ops", icon: <Settings2 className="size-4" />, label: "Ops / gestion de projet" },
  { slug: "student", icon: <GraduationCap className="size-4" />, label: "Étudiant / usage perso" },
  { slug: "other", icon: <MoreHorizontal className="size-4" />, label: "Autre", isOther: true },
];

const USE_CASE_OPTIONS: Option[] = [
  { slug: "ship_code", icon: <Code2 className="size-4" />, label: "Livrer du code avec des agents" },
  { slug: "manage_team", icon: <ListChecks className="size-4" />, label: "Gérer les tâches de mon équipe" },
  { slug: "personal_tasks", icon: <User className="size-4" />, label: "Organiser mes propres tâches" },
  { slug: "plan_research", icon: <Brain className="size-4" />, label: "Planifier, brainstormer, chercher" },
  { slug: "write_publish", icon: <FileEdit className="size-4" />, label: "Écrire, relire, publier" },
  { slug: "automate_ops", icon: <Settings2 className="size-4" />, label: "Automatiser ops & workflows" },
  { slug: "evaluate", icon: <Compass className="size-4" />, label: "Juste explorer" },
  { slug: "other", icon: <MoreHorizontal className="size-4" />, label: "Autre", isOther: true },
];

function StepAboutYou({ onAdvance }: { onAdvance: () => void }) {
  const answers = useAuthStore((state) => state.questionnaire);
  const onChange = (patch: Partial<QuestionnaireAnswers>) =>
    useAuthStore.getState().saveQuestionnaire(patch);

  const roleOtherFilled = (answers.role_other ?? "").trim().length > 0;
  const roleAnswered =
    answers.role !== null && (answers.role !== "other" || roleOtherFilled);
  const useCaseOtherFilled = (answers.use_case_other ?? "").trim().length > 0;
  const useCaseHasNonOther = answers.use_case.some((slug) => slug !== "other");
  const useCaseAnswered =
    answers.use_case.length > 0 && (useCaseHasNonOther || useCaseOtherFilled);
  const canContinue = roleAnswered || useCaseAnswered;

  const pickRole = (slug: string) => {
    if (slug === "other") onChange({ role: "other", role_skipped: false });
    else onChange({ role: slug, role_other: null, role_skipped: false });
  };

  const toggleUseCase = (slug: string) => {
    const current = answers.use_case;
    const next = current.includes(slug)
      ? current.filter((entry) => entry !== slug)
      : [...current, slug];
    onChange({
      use_case: next,
      use_case_skipped: false,
      ...(slug === "other" && current.includes("other")
        ? { use_case_other: null }
        : {}),
    });
  };

  // A group the user looked at but left unanswered is a decline — stamp its
  // skip marker, exactly like multica's confirmAdvance.
  const confirmAdvance = () => {
    if (!canContinue) return;
    const patch: Partial<QuestionnaireAnswers> = {};
    if (!roleAnswered) {
      patch.role = null;
      patch.role_other = null;
      patch.role_skipped = true;
    }
    if (!useCaseAnswered) {
      patch.use_case = [];
      patch.use_case_other = null;
      patch.use_case_skipped = true;
    }
    if (Object.keys(patch).length > 0) onChange(patch);
    onAdvance();
  };

  const handleSkip = () => {
    onChange({
      role: null,
      role_other: null,
      role_skipped: true,
      use_case: [],
      use_case_other: null,
      use_case_skipped: true,
    });
    onAdvance();
  };

  return (
    <>
      <div className="flex flex-col gap-8 pt-2 sm:pt-6">
        <StepHeading title="Parlez-nous un peu de vous." />
        <QuestionGroup
          question="Qu'est-ce qui vous décrit le mieux ?"
          options={ROLE_OPTIONS}
          selected={answers.role ? [answers.role] : []}
          otherValue={answers.role_other ?? ""}
          onOtherChange={(value) => onChange({ role_other: value })}
          otherPlaceholder="ex. enseignant, responsable support"
          onAnswer={pickRole}
          mode="radio"
        />
        <QuestionGroup
          question="Que voulez-vous faire avec Hermes ?"
          options={USE_CASE_OPTIONS}
          selected={answers.use_case}
          otherValue={answers.use_case_other ?? ""}
          onOtherChange={(value) => onChange({ use_case_other: value })}
          otherPlaceholder="ex. coordination d'un groupe d'étude"
          onAnswer={toggleUseCase}
          mode="checkbox"
        />
      </div>
      <StepFooter
        hint={
          canContinue
            ? "Parfait. Cliquez sur Continuer quand vous êtes prêt."
            : "Choisissez une réponse pour continuer — ou passez si vous préférez ne pas répondre."
        }
      >
        <Button className="w-full" disabled={!canContinue} onClick={confirmAdvance}>
          Continuer
        </Button>
        <Button variant="ghost" className="w-full" onClick={handleSkip}>
          Passer
        </Button>
      </StepFooter>
    </>
  );
}

function QuestionGroup({
  question,
  options,
  selected,
  otherValue,
  onOtherChange,
  otherPlaceholder,
  onAnswer,
  mode,
}: {
  question: string;
  options: Option[];
  selected: readonly string[];
  otherValue: string;
  onOtherChange: (value: string) => void;
  otherPlaceholder: string;
  onAnswer: (slug: string) => void;
  mode: "radio" | "checkbox";
}) {
  const otherSelected = selected.includes("other");
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-foreground">{question}</h2>
      <fieldset
        role={mode === "checkbox" ? "group" : "radiogroup"}
        aria-label={question}
        className="m-0 flex flex-row flex-wrap gap-2 p-0"
      >
        {options.map((option) => (
          <button
            key={option.slug}
            type="button"
            role={mode === "checkbox" ? "checkbox" : "radio"}
            aria-checked={selected.includes(option.slug)}
            onClick={() => onAnswer(option.slug)}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
              selected.includes(option.slug)
                ? "border-primary bg-primary/10 font-medium text-foreground"
                : "border-[var(--border)] bg-card text-muted-foreground hover:border-[var(--border-control)] hover:text-foreground"
            }`}
          >
            {option.icon}
            {option.label}
          </button>
        ))}
      </fieldset>
      {otherSelected && (
        <Input
          autoFocus
          value={otherValue}
          onChange={(event) => onOtherChange(event.target.value)}
          placeholder={otherPlaceholder}
          aria-label="Précisez"
        />
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — Workspace (continue with existing, or create name → slug)
// ---------------------------------------------------------------------------

function StepWorkspace({
  existing,
  takenSlugs,
  onOpenExisting,
  onCreate,
}: {
  existing: Workspace | undefined;
  takenSlugs: Set<string>;
  onOpenExisting: (workspace: Workspace) => void;
  onCreate: (name: string, slug: string) => void;
}) {
  const [mode, setMode] = useState<"existing" | "create" | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const urlHost = window.location.host;

  const slugError =
    slug.length === 0
      ? null
      : !SLUG_REGEX.test(slug)
        ? "Uniquement des minuscules, chiffres et tirets"
        : RESERVED_SLUGS.has(slug)
          ? "Cette URL est réservée et ne peut pas être utilisée."
          : takenSlugs.has(slug)
            ? "Cette URL d'espace est déjà prise."
            : null;
  const canCreate = name.trim().length > 0 && slug.trim().length > 0 && !slugError;

  const handleNameChange = (value: string) => {
    setName(value);
    if (!slugTouched) setSlug(nameToSlug(value));
  };

  const handleCreate = () => {
    if (!canCreate) return;
    onCreate(name.trim(), slug.trim());
  };

  const creatingActive = !existing || mode === "create";
  const existingActive = Boolean(existing) && mode === "existing";

  let hint: string;
  let continueLabel: string;
  let continueDisabled: boolean;
  let onContinue: () => void;
  if (existingActive && existing) {
    hint = `Ouverture de ${existing.name}.`;
    continueLabel = `Ouvrir ${existing.name}`;
    continueDisabled = false;
    onContinue = () => onOpenExisting(existing);
  } else if (creatingActive && canCreate) {
    hint = `Création de ${name.trim()}.`;
    continueLabel = `Créer ${name.trim()}`;
    continueDisabled = false;
    onContinue = handleCreate;
  } else if (creatingActive) {
    hint = "Nommez votre espace pour le créer.";
    continueLabel = "Créer l'espace";
    continueDisabled = true;
    onContinue = () => {};
  } else {
    hint = "Choisissez votre espace ou créez-en un nouveau.";
    continueLabel = "Continuer";
    continueDisabled = true;
    onContinue = () => {};
  }

  const createFields = (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="ws-name" className="text-sm font-medium text-foreground">
          Nom de l'espace
        </label>
        <Input
          id="ws-name"
          autoFocus
          value={name}
          onChange={(event) => handleNameChange(event.target.value)}
          placeholder="Acme Inc, Mon Lab, Side Projects…"
          onKeyDown={(event) => {
            if (event.key === "Enter") handleCreate();
          }}
        />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="ws-slug" className="text-sm font-medium text-foreground">
          URL
        </label>
        <div
          className={`flex items-center rounded-md border bg-muted transition-colors focus-within:border-ring ${slugError ? "border-destructive" : "border-[var(--border-control)]"}`}
        >
          <span className="select-none pl-3 font-mono text-sm text-muted-foreground">
            {urlHost}/
          </span>
          <Input
            id="ws-slug"
            value={slug}
            onChange={(event) => {
              setSlugTouched(true);
              setSlug(event.target.value);
            }}
            placeholder="acme"
            className="border-0 bg-transparent font-mono shadow-none focus-visible:ring-0"
            onKeyDown={(event) => {
              if (event.key === "Enter") handleCreate();
            }}
          />
        </div>
        {slugError && <p className="text-sm text-destructive">{slugError}</p>}
      </div>
    </div>
  );

  return (
    <>
      <div className="flex flex-col gap-8 pt-2 sm:pt-6">
        <StepHeading
          title={
            existing
              ? `Continuer avec ${existing.name}, ou repartir de zéro.`
              : "Nommez votre espace."
          }
          description={
            existing
              ? "Reprenez avec l'espace que vous avez déjà, ou créez-en un autre à côté — vous pouvez appartenir à autant d'espaces que vous voulez."
              : "Un espace, c'est là où vivent vos missions, agents et canaux. Vous pourrez inviter des collègues ou créer d'autres espaces plus tard."
          }
        />
        {existing ? (
          <div className="flex flex-col gap-3">
            <button
              type="button"
              role="radio"
              aria-checked={mode === "existing"}
              onClick={() => setMode((m) => (m === "existing" ? null : "existing"))}
              className={`flex w-full items-center gap-4 rounded-lg border bg-card px-5 py-4 text-left transition-all ${
                mode === "existing"
                  ? "border-primary ring-1 ring-primary"
                  : "border-[var(--border)] hover:border-[var(--border-control)]"
              }`}
            >
              <span
                aria-hidden
                className={`flex size-9 shrink-0 items-center justify-center rounded-md text-xs font-semibold ${workspaceToneClasses(existing.tone)}`}
              >
                {existing.short}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium text-foreground">
                  {existing.name}
                </span>
                <span className="truncate font-mono text-xs text-muted-foreground">
                  {urlHost}/{existing.id}
                </span>
              </span>
              <RadioMark selected={mode === "existing"} />
            </button>

            <div
              className={`overflow-hidden rounded-lg border bg-card transition-all ${
                mode === "create"
                  ? "border-primary ring-1 ring-primary"
                  : "border-[var(--border)] hover:border-[var(--border-control)]"
              }`}
            >
              <button
                type="button"
                role="radio"
                aria-checked={mode === "create"}
                aria-expanded={mode === "create"}
                onClick={() => setMode((m) => (m === "create" ? null : "create"))}
                className="flex w-full items-center gap-4 px-5 py-4 text-left"
              >
                <span
                  aria-hidden
                  className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
                >
                  <Plus className="size-4" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium text-foreground">
                    Créer un nouvel espace
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    Repartir de zéro — un espace séparé pour une autre facette de votre travail.
                  </span>
                </span>
                <RadioMark selected={mode === "create"} />
              </button>
              {mode === "create" && (
                <div className="border-t border-[var(--border)] px-5 py-5">{createFields}</div>
              )}
            </div>
          </div>
        ) : (
          createFields
        )}
      </div>
      <StepFooter hint={hint}>
        <Button className="w-full" disabled={continueDisabled} onClick={onContinue}>
          {continueLabel}
        </Button>
      </StepFooter>
    </>
  );
}

function RadioMark({ selected }: { selected: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex size-4 shrink-0 items-center justify-center rounded-full border ${
        selected ? "border-primary" : "border-[var(--border-control)]"
      }`}
    >
      {selected && <span className="size-2 rounded-full bg-primary" />}
    </span>
  );
}
