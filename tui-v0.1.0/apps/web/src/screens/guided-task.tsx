"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BotIcon,
  CheckIcon,
  FileCheck2Icon,
  LoaderCircleIcon,
  LockKeyholeIcon,
  MessageSquareTextIcon,
  ShieldCheckIcon,
  SparklesIcon,
} from "lucide-react";
import {
  buildGuidedDeliveryPrompt,
  GUIDED_TASK_INTENTS,
  guidedIntent,
  guidedPlan,
  guidedRisk,
  guidedTechnicalApprovalRequired,
  guidedUnderstanding,
  isGuidedDraftReady,
  type GuidedTaskDraft,
} from "@console/core/modules/guided-task/spec";
import { Button } from "@/components/ui/boardui";
import { cn } from "@/lib/cn";
import { useRouter } from "@/lib/router";
import {
  createGuidedRevision,
  createGuidedRepositoryProject,
  createGuidedTask,
  fetchGuidedRepositories,
  saveGuidedRepository,
  type GuidedRepositorySummary,
} from "@/lib/api";
import { readPersonaCapabilities } from "@/lib/persona-capabilities";

type Stage = "request" | "understanding" | "plan";

const EMPTY_DRAFT: GuidedTaskDraft = {
  intent: null,
  objective: "",
  audience: "",
  expectedResult: "",
  exclusions: "",
  example: "",
  touchesAuthentication: false,
  deletesData: false,
  allowsDependencies: false,
  changesDatabase: false,
  touchesPayments: false,
  touchesInfrastructure: false,
};

const STAGES: ReadonlyArray<{ id: Stage; label: string; short: string }> = [
  { id: "request", label: "Votre demande", short: "Demande" },
  { id: "understanding", label: "Résultat attendu", short: "Vérification" },
  { id: "plan", label: "Plan proposé", short: "Plan" },
];

export function GuidedTaskScreen() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("request");
  const [draft, setDraft] = useState<GuidedTaskDraft>(EMPTY_DRAFT);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [repositories, setRepositories] = useState<GuidedRepositorySummary[]>([]);
  const [projectId, setProjectId] = useState("");
  const [repositoriesLoading, setRepositoriesLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mutationKey = useRef(newMutationKey("draft"));
  const currentIndex = STAGES.findIndex((item) => item.id === stage);
  const selectedRepository = repositories.find((item) => item.projectId === projectId) ?? null;
  const canManageRepository = readPersonaCapabilities().has("guided.repository.manage");

  const loadRepositories = async (preferredProjectId?: string) => {
    setRepositoriesLoading(true);
    try {
      const next = await fetchGuidedRepositories();
      setRepositories(next);
      setProjectId((current) =>
        preferredProjectId || current || next.find((item) => item.configured)?.projectId || next[0]?.projectId || "",
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Les projets n’ont pas pu être chargés.");
    } finally {
      setRepositoriesLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    void fetchGuidedRepositories()
      .then((next) => {
        if (cancelled) return;
        setRepositories(next);
        setProjectId(next.find((item) => item.configured)?.projectId || next[0]?.projectId || "");
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : "Les projets n’ont pas pu être chargés.");
        }
      })
      .finally(() => {
        if (!cancelled) setRepositoriesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const update = <Key extends keyof GuidedTaskDraft>(
    key: Key,
    value: GuidedTaskDraft[Key],
  ) => setDraft((current) => ({ ...current, [key]: value }));

  const goTo = (next: Stage) => {
    setError(null);
    setStage(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const persistAndGo = async (next: Stage) => {
    if (!projectId || !selectedRepository?.configured || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      if (taskId) {
        await createGuidedRevision(taskId, {
          draft,
          validate: false,
          idempotencyKey: mutationKey.current,
        });
      } else {
        const task = await createGuidedTask({
          projectId,
          draft,
          idempotencyKey: mutationKey.current,
        });
        setTaskId(task.id);
      }
      mutationKey.current = newMutationKey("revision");
      goTo(next);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Le brouillon n’a pas pu être enregistré.");
    } finally {
      setSubmitting(false);
    }
  };

  const validatePlan = async () => {
    if (!isGuidedDraftReady(draft) || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      let persistedTaskId = taskId;
      if (!persistedTaskId) {
        const task = await createGuidedTask({ projectId, draft, idempotencyKey: mutationKey.current });
        persistedTaskId = task.id;
        setTaskId(task.id);
        mutationKey.current = newMutationKey("revision");
      }
      const task = await createGuidedRevision(persistedTaskId, {
        draft,
        validate: true,
        idempotencyKey: mutationKey.current,
      });
      router.push(`/tasks/${task.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Le plan n’a pas pu être validé.");
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-5 sm:px-6 lg:py-8">
      <header className="mb-6 flex flex-col gap-4 border-b border-border pb-5 lg:mb-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <p className="mb-2 flex items-center gap-2 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            <SparklesIcon className="size-3.5" aria-hidden />
            Nouvelle tâche
          </p>
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            Décrivez le résultat, la Console prépare le travail.
          </h1>
          <p className="mt-2 max-w-[65ch] text-sm leading-6 text-muted-foreground">
            Aucun vocabulaire technique n’est nécessaire. Rien n’est exécuté avant votre validation du plan.
          </p>
        </div>
        <p className="max-w-sm text-xs leading-5 text-muted-foreground lg:text-right">
          Le brouillon et chaque correction sont enregistrés comme révisions distinctes. L’exécution attend ensuite ses décisions attribuées.
        </p>
      </header>

      <ProjectRepositoryPicker
        key={`${projectId}:${selectedRepository?.rootPath ?? "unconfigured"}:${selectedRepository?.baseRef ?? "HEAD"}`}
        repositories={repositories}
        projectId={projectId}
        loading={repositoriesLoading}
        canManage={canManageRepository}
        onChange={setProjectId}
        onConfigured={(configuredProjectId) => void loadRepositories(configuredProjectId)}
      />

      <div className="grid min-h-0 gap-7 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10">
        <TaskProgress currentIndex={currentIndex} />
        <main className="min-w-0 pb-10">
          {stage === "request" ? (
            <RequestStep
              draft={draft}
              update={update}
              submitting={submitting}
              repositoryReady={Boolean(selectedRepository?.configured)}
              onContinue={() => void persistAndGo("understanding")}
            />
          ) : stage === "understanding" ? (
            <UnderstandingStep
              draft={draft}
              update={update}
              submitting={submitting}
              onBack={() => goTo("request")}
              onContinue={() => void persistAndGo("plan")}
            />
          ) : (
            <PlanStep
              draft={draft}
              update={update}
              submitting={submitting}
              error={error}
              onBack={() => goTo("understanding")}
              onLaunch={() => void validatePlan()}
            />
          )}
        </main>
      </div>
    </div>
  );
}

function TaskProgress({ currentIndex }: { currentIndex: number }) {
  return (
    <nav aria-label="Étapes de la tâche" className="lg:pt-1">
      <ol className="grid grid-cols-3 gap-2 lg:grid-cols-1 lg:gap-1">
        {STAGES.map((item, index) => {
          const complete = index < currentIndex;
          const current = index === currentIndex;
          return (
            <li
              key={item.id}
              aria-current={current ? "step" : undefined}
              className={cn(
                "flex min-w-0 items-center gap-2 rounded-lg px-2 py-2 text-xs lg:px-3",
                current && "bg-ai-tertiary font-medium text-foreground",
                !current && "text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full border text-[0.6875rem] tabular-nums",
                  complete && "border-pos-700/25 bg-pos-100 text-pos-700",
                  current && "border-primary/30 bg-primary text-primary-foreground",
                  !complete && !current && "border-border bg-background",
                )}
                aria-hidden
              >
                {complete ? <CheckIcon className="size-3.5" /> : index + 1}
              </span>
              <span className="truncate lg:hidden">{item.short}</span>
              <span className="hidden truncate lg:inline">{item.label}</span>
            </li>
          );
        })}
        <li className="hidden items-center gap-2 px-3 py-2 text-xs text-muted-foreground lg:flex">
          <span className="grid size-6 shrink-0 place-items-center rounded-full border border-border bg-background text-[0.6875rem]" aria-hidden>
            4
          </span>
          Réalisation
        </li>
      </ol>
    </nav>
  );
}

function ProjectRepositoryPicker({
  repositories,
  projectId,
  loading,
  canManage,
  onChange,
  onConfigured,
}: {
  repositories: GuidedRepositorySummary[];
  projectId: string;
  loading: boolean;
  canManage: boolean;
  onChange: (projectId: string) => void;
  onConfigured: (projectId?: string) => void;
}) {
  const selected = repositories.find((item) => item.projectId === projectId) ?? null;
  const [projectName, setProjectName] = useState("");
  const [rootPath, setRootPath] = useState(selected?.rootPath ?? "");
  const [baseRef, setBaseRef] = useState(selected?.baseRef ?? "HEAD");
  const [networkPolicy, setNetworkPolicy] = useState<"none" | "host">(
    selected?.networkPolicy ?? "host",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if ((!selected && !projectName.trim()) || !rootPath.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const repositoryInput = {
        rootPath: rootPath.trim(),
        baseRef: baseRef.trim() || "HEAD",
        networkPolicy,
        testCommands: [
          ["bun", "run", "test"],
          ["bun", "run", "typecheck"],
          ["bun", "run", "lint"],
          ["bun", "run", "build"],
        ],
      };
      if (selected) {
        await saveGuidedRepository(selected.projectId, repositoryInput);
        onConfigured(selected.projectId);
      } else {
        const created = await createGuidedRepositoryProject({
          projectName: projectName.trim(),
          ...repositoryInput,
        });
        onConfigured(created.projectId);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Le dépôt n’a pas pu être vérifié.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mb-6 rounded-xl border border-border bg-muted/35 p-4" aria-label="Projet de la tâche">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-0 flex-1">
          <FieldLabel
            label="Projet de la tâche"
            hint={selected?.configured ? "Dépôt vérifié" : "Dépôt à connecter"}
          />
          <select
            value={projectId}
            onChange={(event) => onChange(event.target.value)}
            disabled={loading}
            className={INPUT_CLASS}
          >
            <option value="">{loading ? "Chargement des projets…" : "Choisir un projet"}</option>
            {repositories.map((repository) => (
              <option key={repository.projectId} value={repository.projectId}>
                {repository.projectName}{repository.configured ? " — prêt" : " — dépôt manquant"}
              </option>
            ))}
          </select>
        </label>
        {selected?.configured ? (
          <span className="inline-flex min-h-11 items-center rounded-lg bg-pos-100 px-3 text-xs font-medium text-pos-700">
            Sandbox disponible
          </span>
        ) : null}
      </div>

      {!loading && repositories.length === 0 && !canManage ? (
        <p role="alert" className="mt-3 text-sm text-neg-700">
          Aucun projet n’est disponible dans ce périmètre. Un administrateur doit d’abord créer ou attribuer un projet.
        </p>
      ) : null}

      {selected && !selected.configured && !canManage ? (
        <p role="alert" className="mt-3 text-sm text-warn-700">
          Le dépôt de ce projet doit être connecté par un administrateur avant d’enregistrer la tâche.
        </p>
      ) : null}

      {canManage && (selected || !loading) ? (
        <details className="mt-3 border-t border-border pt-3">
          <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium text-foreground">
            {selected?.configured ? "Vérifier la configuration du dépôt" : selected ? "Connecter le dépôt" : "Créer le premier projet et connecter son dépôt"}
          </summary>
          <div className="grid gap-4 pt-2 sm:grid-cols-2">
            {!selected ? (
              <label className="sm:col-span-2">
                <FieldLabel label="Nom du projet" hint="Visible dans la Console" />
                <input
                  value={projectName}
                  onChange={(event) => setProjectName(event.target.value)}
                  placeholder="Hermes Console"
                  className={INPUT_CLASS}
                />
              </label>
            ) : null}
            <label className="sm:col-span-2">
              <FieldLabel label="Chemin absolu du dépôt" hint="Validé par Git côté serveur" />
              <input
                type="text"
                inputMode="url"
                autoComplete="off"
                value={rootPath}
                onChange={(event) => setRootPath(event.target.value)}
                placeholder="/srv/projets/mon-projet"
                className={INPUT_CLASS}
              />
            </label>
            <label>
              <FieldLabel label="Référence de base" hint="Branche, tag ou commit" />
              <input
                value={baseRef}
                onChange={(event) => setBaseRef(event.target.value)}
                className={INPUT_CLASS}
              />
            </label>
            <label>
              <FieldLabel label="Réseau Hermes" hint="Policy explicite" />
              <select
                value={networkPolicy}
                onChange={(event) => setNetworkPolicy(event.target.value as "none" | "host")}
                className={INPUT_CLASS}
              >
                <option value="host">Hôte — inférence distante autorisée</option>
                <option value="none">Aucun réseau — modèle local uniquement</option>
              </select>
            </label>
          </div>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            Les preuves lanceront exactement les quatre scripts Bun du dépôt : test, typecheck, lint et build. Aucune commande shell libre n’est enregistrée.
          </p>
          {error ? <p role="alert" className="mt-3 text-sm text-neg-700">{error}</p> : null}
          <div className="mt-4 flex justify-end">
            <Button className="min-h-11" variant="primary" disabled={!rootPath.trim() || (!selected && !projectName.trim()) || saving} onClick={() => void save()}>
              {saving ? "Vérification…" : "Enregistrer et vérifier"}
            </Button>
          </div>
        </details>
      ) : null}
    </section>
  );
}

function RequestStep({
  draft,
  update,
  submitting,
  repositoryReady,
  onContinue,
}: {
  draft: GuidedTaskDraft;
  update: UpdateDraft;
  submitting: boolean;
  repositoryReady: boolean;
  onContinue: () => void;
}) {
  const intent = guidedIntent(draft.intent);
  const canContinue = Boolean(intent && draft.objective.trim().length >= 12);
  return (
    <section aria-labelledby="request-title">
      <StepHeading
        icon={MessageSquareTextIcon}
        eyebrow="Étape 1 sur 3"
        title="Que souhaitez-vous obtenir ?"
        description="Choisissez l’intention la plus proche. Elle sert uniquement à poser les bonnes questions."
      />

      <div className="mt-6 grid gap-2 sm:grid-cols-2">
        {GUIDED_TASK_INTENTS.map((item) => {
          const selected = draft.intent === item.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={selected}
              onClick={() => update("intent", item.id)}
              className={cn(
                "group flex min-h-24 items-start gap-3 rounded-xl border p-4 text-left outline-none transition-[border-color,background-color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-ring/30",
                selected
                  ? "border-primary/45 bg-primary/6 shadow-board-xs"
                  : "border-border bg-background hover:border-input hover:bg-muted/50",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border",
                  selected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-background text-transparent",
                )}
                aria-hidden
              >
                <CheckIcon className="size-3" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">{item.label}</span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                  {item.description}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {intent ? (
        <div className="mt-7 border-t border-border pt-6">
          <FieldLabel htmlFor="guided-objective" label={intent.objectiveLabel} hint="Décrivez un exemple concret, avec vos mots." />
          <textarea
            id="guided-objective"
            value={draft.objective}
            onChange={(event) => update("objective", event.target.value)}
            rows={5}
            autoFocus
            placeholder={intent.objectivePlaceholder}
            className={TEXTAREA_CLASS}
          />
          <div className="mt-5 flex justify-end">
            <Button className="min-h-11" variant="primary" disabled={!canContinue || !repositoryReady || submitting} onClick={onContinue}>
              {submitting ? "Enregistrement…" : "Continuer"}
              <ArrowRightIcon className="size-4" aria-hidden />
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function UnderstandingStep({
  draft,
  update,
  submitting,
  onBack,
  onContinue,
}: {
  draft: GuidedTaskDraft;
  update: UpdateDraft;
  submitting: boolean;
  onBack: () => void;
  onContinue: () => void;
}) {
  const intent = guidedIntent(draft.intent);
  return (
    <section aria-labelledby="understanding-title">
      <StepHeading
        icon={FileCheck2Icon}
        eyebrow="Étape 2 sur 3"
        title="Vérifions le résultat attendu."
        description="Ces réponses deviennent le contrat de la tâche. Elles évitent les modifications implicites."
      />

      <div className="mt-6 rounded-xl border border-border bg-muted/45 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.07em] text-muted-foreground">
          Demande initiale
        </p>
        <p className="mt-2 text-sm leading-6 text-foreground">{draft.objective}</p>
      </div>

      <div className="mt-6 grid gap-5">
        <label>
          <FieldLabel
            label={intent?.id === "bug" ? "Que devait-il se passer ?" : "Quel résultat doit être obtenu ?"}
            hint="Décrivez ce que vous pourrez observer pour considérer la tâche terminée."
          />
          <textarea
            value={draft.expectedResult}
            onChange={(event) => update("expectedResult", event.target.value)}
            rows={3}
            placeholder="Le résultat est correct lorsque…"
            className={TEXTAREA_CLASS}
          />
        </label>
        <label>
          <FieldLabel
            label="Que ne faut-il pas modifier ?"
            hint="Indiquez les comportements, données ou écrans qui doivent rester inchangés."
          />
          <textarea
            value={draft.exclusions}
            onChange={(event) => update("exclusions", event.target.value)}
            rows={3}
            placeholder="Ne pas modifier…"
            className={TEXTAREA_CLASS}
          />
        </label>
        <div className="grid gap-5 sm:grid-cols-2">
          <label>
            <FieldLabel label="Qui est concerné ?" hint="Facultatif" />
            <input
              value={draft.audience}
              onChange={(event) => update("audience", event.target.value)}
              placeholder="Client, administrateur, équipe…"
              className={INPUT_CLASS}
            />
          </label>
          <label>
            <FieldLabel label="Un exemple concret ?" hint="Facultatif" />
            <input
              value={draft.example}
              onChange={(event) => update("example", event.target.value)}
              placeholder="Commande ACME-42, écran concerné…"
              className={INPUT_CLASS}
            />
          </label>
        </div>
      </div>

      <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
        <Button className="min-h-11" onClick={onBack} disabled={submitting}>
          <ArrowLeftIcon className="size-4" aria-hidden />
          Modifier la demande
        </Button>
        <Button className="min-h-11" variant="primary" disabled={!isGuidedDraftReady(draft) || submitting} onClick={onContinue}>
          {submitting ? "Enregistrement…" : "Vérifier le plan"}
          <ArrowRightIcon className="size-4" aria-hidden />
        </Button>
      </div>
    </section>
  );
}

function PlanStep({
  draft,
  update,
  submitting,
  error,
  onBack,
  onLaunch,
}: {
  draft: GuidedTaskDraft;
  update: UpdateDraft;
  submitting: boolean;
  error: string | null;
  onBack: () => void;
  onLaunch: () => void;
}) {
  const understanding = useMemo(() => guidedUnderstanding(draft), [draft]);
  const plan = useMemo(() => guidedPlan(draft), [draft]);
  const risk = guidedRisk(draft);
  const technicalApproval = guidedTechnicalApprovalRequired(draft);
  const prompt = buildGuidedDeliveryPrompt(draft);
  return (
    <section aria-labelledby="plan-title">
      <StepHeading
        icon={ShieldCheckIcon}
        eyebrow="Étape 3 sur 3"
        title="Validez le travail avant son lancement."
        description="Cette synthèse devient une révision immuable. Les validations technique et d’outil restent séparées avant l’exécution."
      />

      <div className="mt-6 divide-y divide-border rounded-xl border border-border bg-background">
        <section className="p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-foreground">J’ai compris que :</h2>
          <ul className="mt-3 space-y-2">
            {understanding.map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm leading-6 text-muted-foreground">
                <CheckIcon className="mt-1 size-4 shrink-0 text-pos-700" aria-hidden />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-foreground">Plan proposé</h2>
          <ol className="mt-3 space-y-2.5">
            {plan.map((item, index) => (
              <li key={item} className="flex items-start gap-3 text-sm leading-6 text-muted-foreground">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-ai-tertiary text-xs font-medium text-foreground" aria-hidden>
                  {index + 1}
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Limites techniques</h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Signalez les sujets sensibles connus. Ils ne seront jamais déduits silencieusement.
              </p>
            </div>
            <RiskBadge risk={risk} />
          </div>
          <div className="mt-4 grid gap-2">
            <BoundaryToggle
              checked={draft.touchesAuthentication}
              onChange={(value) => update("touchesAuthentication", value)}
              label="Cette tâche touche à la connexion ou aux permissions"
              description="Une validation technique sera exigée avant toute action sensible."
            />
            <BoundaryToggle
              checked={draft.deletesData}
              onChange={(value) => update("deletesData", value)}
              label="Cette tâche peut supprimer des données"
              description="La suppression restera bloquée sans validation technique explicite."
            />
            <BoundaryToggle
              checked={draft.allowsDependencies}
              onChange={(value) => update("allowsDependencies", value)}
              label="Une nouvelle dépendance peut être proposée"
              description="Elle devra être justifiée et restera visible dans le résultat."
            />
            <BoundaryToggle
              checked={draft.changesDatabase}
              onChange={(value) => update("changesDatabase", value)}
              label="Cette tâche modifie la base de données ou ajoute une migration"
              description="Un développeur devra valider la migration avant effet."
            />
            <BoundaryToggle
              checked={draft.touchesPayments}
              onChange={(value) => update("touchesPayments", value)}
              label="Cette tâche touche aux paiements ou remboursements"
              description="Le périmètre financier impose une validation technique distincte."
            />
            <BoundaryToggle
              checked={draft.touchesInfrastructure}
              onChange={(value) => update("touchesInfrastructure", value)}
              label="Cette tâche touche à l’infrastructure ou au déploiement"
              description="Aucun changement d’infrastructure ne part sans approbation développeur."
            />
          </div>
          {technicalApproval ? (
            <div className="mt-4 flex items-start gap-2 rounded-lg bg-warn-soft p-3 text-xs leading-5 text-warn-700">
              <LockKeyholeIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>
                Après validation du plan, la tâche attendra une décision technique attribuée à un développeur habilité. L’accord métier ne pourra pas la remplacer.
              </p>
            </div>
          ) : null}
        </section>
      </div>

      <details className="mt-4 rounded-xl border border-border bg-muted/35 px-4 py-3 text-xs">
        <summary className="cursor-pointer font-medium text-foreground">
          Afficher les détails techniques transmis à Hermes
        </summary>
        <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-inset p-3 font-mono leading-5 text-muted-foreground scrollbar-subtle">
          {prompt}
        </pre>
      </details>

      {error ? (
        <p role="alert" className="mt-4 rounded-xl bg-neg-soft p-3 text-sm text-neg-700">
          {error}
        </p>
      ) : null}

      <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
        <Button className="min-h-11" onClick={onBack} disabled={submitting}>
          <ArrowLeftIcon className="size-4" aria-hidden />
          Modifier
        </Button>
        <Button
          variant="primary"
          className="min-h-11"
          onClick={onLaunch}
          disabled={submitting}
        >
          {submitting ? <LoaderCircleIcon className="size-4 animate-spin" aria-hidden /> : <BotIcon className="size-4" aria-hidden />}
          {submitting ? "Validation…" : "Valider le plan"}
        </Button>
      </div>
    </section>
  );
}

function BoundaryToggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description: string;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-transparent px-2 py-2.5 transition-colors active:bg-muted hover:border-border hover:bg-muted/45">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-5 rounded border-input accent-primary"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground">{label}</span>
        <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{description}</span>
      </span>
    </label>
  );
}

function RiskBadge({ risk }: { risk: ReturnType<typeof guidedRisk> }) {
  const style =
    risk === "élevé"
      ? "bg-neg-soft text-neg-700"
      : risk === "modéré"
        ? "bg-warn-soft text-warn-700"
        : "bg-pos-100 text-pos-700";
  return (
    <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", style)}>
      Risque estimé : {risk}
    </span>
  );
}

function StepHeading({
  icon: Icon,
  eyebrow,
  title,
  description,
}: {
  icon: typeof MessageSquareTextIcon;
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-[10px] bg-ai-tertiary text-muted-foreground">
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {eyebrow}
        </p>
        <h2 className="mt-1 text-lg font-semibold tracking-tight text-foreground" id={`${eyebrow.startsWith("Étape 1") ? "request" : eyebrow.startsWith("Étape 2") ? "understanding" : "plan"}-title`}>
          {title}
        </h2>
        <p className="mt-1.5 max-w-[68ch] text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function FieldLabel({
  htmlFor,
  label,
  hint,
}: {
  htmlFor?: string;
  label: string;
  hint?: string;
}) {
  return (
    <span className="mb-2 flex flex-wrap items-baseline justify-between gap-2" id={htmlFor ? `${htmlFor}-label` : undefined}>
      <span className="text-sm font-medium text-foreground">{label}</span>
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </span>
  );
}

type UpdateDraft = <Key extends keyof GuidedTaskDraft>(
  key: Key,
  value: GuidedTaskDraft[Key],
) => void;

const INPUT_CLASS =
  "h-11 w-full rounded-[10px] border border-input bg-background px-3 text-sm text-foreground shadow-board-xs outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20";
const TEXTAREA_CLASS = `${INPUT_CLASS} min-h-24 resize-y py-3 leading-6`;

function newMutationKey(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}
