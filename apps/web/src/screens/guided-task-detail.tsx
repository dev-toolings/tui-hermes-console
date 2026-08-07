"use client";

import { useEffect, useRef, useState } from "react";
import {
  CheckIcon,
  CircleIcon,
  CircleXIcon,
  FileDiffIcon,
  LoaderCircleIcon,
  LockKeyholeIcon,
  PlayIcon,
  RotateCcwIcon,
  ShieldCheckIcon,
} from "lucide-react";
import type { GuidedDecisionKind } from "@console/core/modules/guided-task/spec";
import type { GuidedTaskDto } from "@console/core/modules/guided-task/task";
import { Badge, Button, CardSurface } from "@/components/ui/boardui";
import {
  createGuidedRevision,
  decideGuidedTask,
  fetchGuidedTask,
  startGuidedAttempt,
} from "@/lib/api";
import { cn } from "@/lib/cn";
import { readPersonaRole } from "@/lib/persona-capabilities";

export function GuidedTaskDetailScreen({ taskId }: { taskId: string }) {
  const [task, setTask] = useState<GuidedTaskDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mutationKeys = useRef(new Map<string, string>());
  const role = readPersonaRole();

  useEffect(() => {
    let cancelled = false;
    void fetchGuidedTask(taskId)
      .then((next) => {
        if (cancelled) return;
        setTask(next);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : "La tâche n’a pas pu être chargée.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  const activeAttempt = task?.attempts.at(-1) ?? null;
  const poll = activeAttempt?.status === "pending" || activeAttempt?.status === "running";
  useEffect(() => {
    if (!poll) return;
    const timer = window.setInterval(() => {
      void fetchGuidedTask(taskId)
        .then((next) => {
          setTask(next);
          setError(null);
        })
        .catch((reason: unknown) => {
          setError(reason instanceof Error ? reason.message : "La tâche n’a pas pu être actualisée.");
        });
    }, 1_500);
    return () => window.clearInterval(timer);
  }, [poll, taskId]);

  const revision = task?.revisions.find((item) => item.id === task.currentRevisionId) ?? null;
  const latestDecision = (kind: GuidedDecisionKind) =>
    task?.decisions.filter((decision) => decision.revisionId === revision?.id && decision.kind === kind).at(-1) ?? null;
  const planApproved = latestDecision("plan")?.outcome === "approved";
  const technicalApproved = latestDecision("technical")?.outcome === "approved";
  const toolApproved = latestDecision("tool")?.outcome === "approved";
  const needsTechnical = revision?.requiresTechnicalApproval ?? false;
  const canTechnical = role === "admin" || role === "operator" || role === "approver";
  const canTool = canTechnical;
  const canExecute = role === "admin" || role === "operator";
  const canFunctional = role === "admin" || role === "requester";

  const mutationKey = (action: string) => {
    const existing = mutationKeys.current.get(action);
    if (existing) return existing;
    const created = `${action}_${crypto.randomUUID()}`;
    mutationKeys.current.set(action, created);
    return created;
  };

  const decide = async (
    kind: "technical" | "tool" | "functional",
    outcome: "approved" | "rejected",
  ) => {
    if (!task || !revision || pendingAction) return;
    const action = `${kind}_${outcome}_${activeAttempt?.id ?? "revision"}`;
    setPendingAction(action);
    setError(null);
    try {
      const next = await decideGuidedTask(task.id, {
        revisionId: revision.id,
        attemptId: kind === "functional" ? activeAttempt?.id ?? null : null,
        kind,
        outcome,
        idempotencyKey: mutationKey(action),
      });
      mutationKeys.current.delete(action);
      setTask(next);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "La décision n’a pas pu être enregistrée.");
    } finally {
      setPendingAction(null);
    }
  };

  const start = async () => {
    if (!task || !revision || pendingAction) return;
    const action = `attempt_${revision.id}`;
    setPendingAction(action);
    setError(null);
    try {
      const next = await startGuidedAttempt(task.id, {
        revisionId: revision.id,
        idempotencyKey: mutationKey(action),
      });
      mutationKeys.current.delete(action);
      setTask(next);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "La tentative n’a pas pu être lancée.");
    } finally {
      setPendingAction(null);
    }
  };

  if (loading && !task) {
    return <p role="status" className="p-6 text-sm text-muted-foreground">Chargement de la tâche…</p>;
  }
  if (!task || !revision) {
    return <p role="alert" className="p-6 text-sm text-neg-700">{error ?? "Tâche introuvable."}</p>;
  }

  const executionReady =
    planApproved && toolApproved && (!needsTechnical || technicalApproved) && !activeAttempt;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 px-4 py-5 sm:px-6 lg:py-8">
      <header className="border-b border-border pb-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Tâche guidée
            </p>
            <h1 className="mt-2 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              {task.title}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Projet relié · révision {revision.number} · préparée par {task.authorUserId}
            </p>
          </div>
          <TaskStatusBadge status={task.status} />
        </div>
      </header>

      <DeliveryProgress task={task} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <main className="min-w-0 space-y-5">
          <CardSurface>
            <h2 className="text-sm font-semibold text-foreground">Mandat validé</h2>
            <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
              <SummaryItem label="Objectif" value={revision.content.objective} />
              <SummaryItem label="Résultat attendu" value={revision.content.expectedResult} />
              <SummaryItem label="Hors périmètre" value={revision.content.exclusions} />
            </dl>
          </CardSurface>

          {activeAttempt ? <AttemptResult task={task} attempt={activeAttempt} /> : null}

          {task.status === "ready" || task.status === "failed" ? (
            <CorrectionForm key={revision.id} task={task} onUpdated={setTask} mutationKey={mutationKey} />
          ) : null}
        </main>

        <aside className="space-y-4">
          <DecisionCard
            title="Validation du plan"
            description="Le demandeur confirme la compréhension et le périmètre."
            outcome={latestDecision("plan")?.outcome ?? null}
          />

          {needsTechnical ? (
            <DecisionCard
              title="Validation technique"
              description="Requise pour dépendance, migration, auth, paiement, infrastructure ou suppression."
              outcome={latestDecision("technical")?.outcome ?? null}
              actions={canTechnical && !technicalApproved ? (
                <DecisionButtons
                  prefix="technical"
                  pending={pendingAction}
                  onApprove={() => void decide("technical", "approved")}
                  onReject={() => void decide("technical", "rejected")}
                />
              ) : undefined}
            />
          ) : null}

          <DecisionCard
            title="Approbation d’outil"
            description="Autorise séparément Git, Bubblewrap, Hermes et les commandes Bun configurées."
            outcome={latestDecision("tool")?.outcome ?? null}
            actions={canTool && !toolApproved ? (
              <DecisionButtons
                prefix="tool"
                pending={pendingAction}
                onApprove={() => void decide("tool", "approved")}
                onReject={() => void decide("tool", "rejected")}
              />
            ) : undefined}
          />

          {executionReady && canExecute ? (
            <Button className="min-h-11 w-full" variant="primary" onClick={() => void start()} disabled={Boolean(pendingAction)}>
              {pendingAction?.startsWith("attempt_") ? <LoaderCircleIcon className="size-4 animate-spin" aria-hidden /> : <PlayIcon className="size-4" aria-hidden />}
              Lancer la tentative isolée
            </Button>
          ) : null}

          {activeAttempt && (activeAttempt.status === "awaiting_functional_validation" || latestDecision("functional")) ? (
            <DecisionCard
              title="Validation fonctionnelle"
              description="Le demandeur juge le résultat avec les preuves, sans remplacer la revue technique."
              outcome={latestDecision("functional")?.outcome ?? null}
              actions={canFunctional && activeAttempt.status === "awaiting_functional_validation" ? (
                <DecisionButtons
                  prefix="functional"
                  pending={pendingAction}
                  onApprove={() => void decide("functional", "approved")}
                  onReject={() => void decide("functional", "rejected")}
                />
              ) : undefined}
            />
          ) : null}
        </aside>
      </div>

      {error ? <p role="alert" className="rounded-xl bg-neg-soft p-3 text-sm text-neg-700">{error}</p> : null}
    </div>
  );
}

function DeliveryProgress({ task }: { task: GuidedTaskDto }) {
  const attempt = task.attempts.at(-1);
  const stages = [
    { label: "Demande cadrée", state: task.currentRevisionId ? "done" : "idle" },
    { label: "Décisions préparées", state: attempt ? "done" : task.status === "ready" ? "active" : "idle" },
    { label: "Réalisation isolée", state: attempt?.status === "running" || attempt?.status === "pending" ? "active" : attempt ? (attempt.status === "failed" ? "error" : "done") : "idle" },
    { label: "Résultat vérifié", state: attempt?.evidenceComplete && attempt.testsPassed ? "done" : attempt?.status === "failed" ? "error" : "idle" },
  ] as const;
  return (
    <ol className="grid gap-2 sm:grid-cols-4" aria-label="Progression de la livraison">
      {stages.map((stage, index) => (
        <li key={stage.label} className="flex min-h-11 items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs">
          <StageIcon state={stage.state} />
          <span className={cn(stage.state === "idle" ? "text-muted-foreground" : "text-foreground")}>{index + 1}. {stage.label}</span>
        </li>
      ))}
    </ol>
  );
}

function StageIcon({ state }: { state: "done" | "active" | "error" | "idle" }) {
  if (state === "done") return <CheckIcon className="size-4 shrink-0 text-pos-700" aria-hidden />;
  if (state === "active") return <LoaderCircleIcon className="size-4 shrink-0 animate-spin text-info-700" aria-hidden />;
  if (state === "error") return <CircleXIcon className="size-4 shrink-0 text-neg-700" aria-hidden />;
  return <CircleIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />;
}

function AttemptResult({
  task,
  attempt,
}: {
  task: GuidedTaskDto;
  attempt: GuidedTaskDto["attempts"][number];
}) {
  const files = attempt.evidence.find((item) => item.kind === "files")?.payload.files;
  const tests = attempt.evidence.find((item) => item.kind === "tests")?.payload;
  const diff = attempt.evidence.find((item) => item.kind === "diff")?.payload.diff;
  const commands = attempt.evidence.find((item) => item.kind === "commands")?.payload;
  return (
    <CardSurface>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Résultat de la tentative {attempt.attemptNumber}</h2>
          <p className="mt-1 text-xs text-muted-foreground">Proposition isolée, vérifiée puis nettoyée par la Console.</p>
        </div>
        <Badge tone={attempt.testsPassed ? "success" : attempt.status === "failed" ? "danger" : "info"}>
          {attempt.testsPassed ? "Vérifications réussies" : attempt.status === "failed" ? "Échec non accepté" : "En cours"}
        </Badge>
      </div>
      {attempt.error ? <p role="alert" className="mt-4 rounded-lg bg-neg-soft p-3 text-sm text-neg-700">{attempt.error}</p> : null}
      {attempt.status === "running" || attempt.status === "pending" ? (
        <div className="mt-4 space-y-2" role="status" aria-label="Hermes réalise la tâche">
          <div className="h-4 w-4/5 animate-pulse rounded bg-muted" />
          <div className="h-4 w-3/5 animate-pulse rounded bg-muted" />
        </div>
      ) : attempt.testsPassed ? (
        <p className="mt-4 text-sm leading-6 text-foreground">
          La proposition respecte le mandat et toutes les vérifications configurées ont réussi.
        </p>
      ) : (
        <p className="mt-4 text-sm leading-6 text-foreground">
          La proposition a été refusée avant validation. Une correction est nécessaire.
        </p>
      )}
      {Array.isArray(files) ? (
        <ul className="mt-4 space-y-1 text-sm text-muted-foreground">
          {files.map((item, index) => (
            <li key={index} className="flex min-w-0 items-center gap-2">
              <FileDiffIcon className="size-4 shrink-0" aria-hidden />
              <span className="break-all">{typeof item === "object" && item && "file" in item ? String(item.file) : String(item)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <details className="mt-5 rounded-lg border border-border bg-muted/35 p-3 text-xs">
        <summary className="min-h-11 cursor-pointer py-3 font-medium text-foreground">Détails techniques exhaustifs</summary>
        <dl className="grid gap-3 py-3 sm:grid-cols-2">
          <SummaryItem label="Tâche" value={task.id} mono />
          <SummaryItem label="Révision" value={attempt.revisionId} mono />
          <SummaryItem label="Empreinte de révision" value={task.revisions.find((item) => item.id === attempt.revisionId)?.contentSha256 ?? "indisponible"} mono />
          <SummaryItem label="Projet" value={task.projectId} mono />
          <SummaryItem label="Auteur" value={task.authorUserId} mono />
          <SummaryItem label="Commit de base" value={attempt.baseCommit} mono />
          <SummaryItem label="Nettoyage" value={attempt.cleanedUpAt ?? "non terminé"} mono />
        </dl>
        <TechnicalPayload title="Tests" value={tests} />
        <TechnicalPayload title="Commandes" value={commands} />
        <TechnicalPayload title="Diff" value={diff} />
        <TechnicalPayload title="Sortie Hermes" value={attempt.hermesOutput} />
        <TechnicalPayload title="Artefacts et empreintes SHA-256" value={attempt.evidence} />
      </details>
    </CardSurface>
  );
}

function TechnicalPayload({ title, value }: { title: string; value: unknown }) {
  if (value === undefined) return null;
  return (
    <section className="mt-3 min-w-0">
      <h3 className="font-semibold text-foreground">{title}</h3>
      <pre className="mt-2 max-h-80 max-w-full overflow-auto whitespace-pre-wrap break-words rounded-lg bg-inset p-3 font-mono leading-5 text-muted-foreground">
        {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
      </pre>
    </section>
  );
}

function DecisionCard({
  title,
  description,
  outcome,
  actions,
}: {
  title: string;
  description: string;
  outcome: "approved" | "rejected" | null;
  actions?: React.ReactNode;
}) {
  return (
    <CardSurface>
      <div className="flex items-start gap-2">
        {outcome === "approved" ? <ShieldCheckIcon className="mt-0.5 size-4 shrink-0 text-pos-700" aria-hidden /> : <LockKeyholeIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />}
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="mt-3">
        <Badge tone={outcome === "approved" ? "success" : outcome === "rejected" ? "danger" : "warning"}>
          {outcome === "approved" ? "Approuvée" : outcome === "rejected" ? "Refusée" : "En attente"}
        </Badge>
      </div>
      {actions ? <div className="mt-4">{actions}</div> : null}
    </CardSurface>
  );
}

function DecisionButtons({
  prefix,
  pending,
  onApprove,
  onReject,
}: {
  prefix: string;
  pending: string | null;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <div className="grid gap-2">
      <Button className="min-h-11 w-full" variant="primary" onClick={onApprove} disabled={Boolean(pending)}>
        {pending?.startsWith(`${prefix}_`) ? <LoaderCircleIcon className="size-4 animate-spin" aria-hidden /> : <CheckIcon className="size-4" aria-hidden />}
        Approuver
      </Button>
      <Button className="min-h-11 w-full" onClick={onReject} disabled={Boolean(pending)}>
        Refuser
      </Button>
    </div>
  );
}

function CorrectionForm({
  task,
  onUpdated,
  mutationKey,
}: {
  task: GuidedTaskDto;
  onUpdated: (task: GuidedTaskDto) => void;
  mutationKey: (action: string) => string;
}) {
  const revision = task.revisions.find((item) => item.id === task.currentRevisionId)!;
  const [draft, setDraft] = useState(revision.content);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const action = `correction_${revision.id}`;
  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      onUpdated(await createGuidedRevision(task.id, {
        draft,
        validate: true,
        idempotencyKey: mutationKey(action),
      }));
      setOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "La correction n’a pas pu être enregistrée.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <CardSurface>
      <button type="button" className="flex min-h-11 w-full items-center gap-2 text-left text-sm font-semibold text-foreground" onClick={() => setOpen((value) => !value)}>
        <RotateCcwIcon className="size-4" aria-hidden />
        Préparer une correction
      </button>
      {open ? (
        <div className="mt-4 grid gap-4">
          <CorrectionField label="Objectif" value={draft.objective} onChange={(objective) => setDraft({ ...draft, objective })} />
          <CorrectionField label="Résultat attendu" value={draft.expectedResult} onChange={(expectedResult) => setDraft({ ...draft, expectedResult })} />
          <CorrectionField label="Hors périmètre" value={draft.exclusions} onChange={(exclusions) => setDraft({ ...draft, exclusions })} />
          {error ? <p role="alert" className="text-sm text-neg-700">{error}</p> : null}
          <Button className="min-h-11" variant="primary" disabled={saving} onClick={() => void save()}>
            {saving ? <LoaderCircleIcon className="size-4 animate-spin" aria-hidden /> : <CheckIcon className="size-4" aria-hidden />}
            Enregistrer et valider la nouvelle révision
          </Button>
        </div>
      ) : null}
    </CardSurface>
  );
}

function CorrectionField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label>
      <span className="mb-2 block text-sm font-medium text-foreground">{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={3} className="min-h-24 w-full resize-y rounded-[10px] border border-input bg-background px-3 py-3 text-sm leading-6 text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/20" />
    </label>
  );
}

function SummaryItem({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className={cn("mt-1 break-words leading-5 text-foreground", mono && "break-all font-mono text-xs")}>{value || "Non précisé"}</dd>
    </div>
  );
}

function TaskStatusBadge({ status }: { status: GuidedTaskDto["status"] }) {
  const labels = {
    draft: "Brouillon",
    ready: "Prête",
    running: "En réalisation",
    awaiting_validation: "À valider",
    completed: "Terminée",
    failed: "Correction requise",
  } as const;
  const tone = status === "completed" ? "success" : status === "failed" ? "danger" : status === "running" ? "info" : "warning";
  return <Badge tone={tone}>{labels[status]}</Badge>;
}
