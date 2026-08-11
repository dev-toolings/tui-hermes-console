"use client";

import { useState } from "react";
import {
  ArchiveIcon,
  DownloadIcon,
  FileBoxIcon,
  LoaderCircleIcon,
  MessageSquareIcon,
  RouteIcon,
  ShieldAlertIcon,
  Trash2Icon,
} from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Badge, Button, Card, CardSurface, SectionHeading } from "@/components/ui/boardui";
import { SettingsContent } from "@/components/settings/settings-content";
import { formatBytes } from "@console/core/lib/format-bytes";
import type { RetentionData } from "@/loaders";
import {
  createLifecyclePreview,
  downloadLifecycleExport,
  purgeLifecyclePreview,
  saveLifecyclePolicy,
  type LifecyclePolicyDto,
  type LifecyclePreviewDto,
} from "@/lib/api";
import { readPersonaCapabilities } from "@/lib/persona-capabilities";
import { useRouter } from "@/lib/router";

export type LifecyclePreviewSummary = {
  threads: number;
  runs: number;
  messages: number;
  artifacts: number;
  artifactBytes: number;
};

export function summarizeLifecyclePreview(preview: LifecyclePreviewDto): LifecyclePreviewSummary {
  return preview.items.reduce<LifecyclePreviewSummary>(
    (summary, item) => ({
      threads: summary.threads + 1,
      runs: summary.runs + item.runCount,
      messages: summary.messages + item.messageCount,
      artifacts: summary.artifacts + item.artifactCount,
      artifactBytes: summary.artifactBytes + item.artifactBytes,
    }),
    { threads: 0, runs: 0, messages: 0, artifacts: 0, artifactBytes: 0 },
  );
}

export function SettingsRetentionScreen({ data }: { data: RetentionData }) {
  const { stats, limits } = data;
  const router = useRouter();
  const capabilities = readPersonaCapabilities();
  const canRead = capabilities.has("data.lifecycle.read");
  const canManage = capabilities.has("data.lifecycle.manage");
  const canPreview = capabilities.has("data.lifecycle.preview");
  const canExport = capabilities.has("data.lifecycle.export");
  const canPurge = capabilities.has("data.lifecycle.purge");
  const [policy, setPolicy] = useState<LifecyclePolicyDto | null>(data.policy);
  const [retentionDays, setRetentionDays] = useState(String(data.policy?.retentionDays ?? 30));
  const [legalHoldEnabled, setLegalHoldEnabled] = useState(
    data.policy?.legalHoldEnabled ?? false,
  );
  const [legalHoldReason, setLegalHoldReason] = useState(data.policy?.legalHoldReason ?? "");
  const [preview, setPreview] = useState<LifecyclePreviewDto | null>(null);
  const [pending, setPending] = useState<"policy" | "preview" | "export" | "purge" | null>(null);
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const rows = [
    { label: "Agents", value: stats.agents, icon: ArchiveIcon },
    { label: "Conversations (threads)", value: stats.threads, icon: MessageSquareIcon },
    { label: "Messages", value: stats.messages, icon: MessageSquareIcon },
    { label: "Événements bruts", value: stats.events, icon: RouteIcon },
  ];
  const summary = preview ? summarizeLifecyclePreview(preview) : null;
  const parsedRetentionDays = Number(retentionDays);
  const policyValid =
    Number.isInteger(parsedRetentionDays) &&
    parsedRetentionDays >= 1 &&
    parsedRetentionDays <= 3650 &&
    (!legalHoldEnabled || legalHoldReason.trim().length > 0);

  async function savePolicy() {
    if (!policyValid) return;
    setPending("policy");
    setError(null);
    setNotice(null);
    try {
      const saved = await saveLifecyclePolicy({
        retentionDays: parsedRetentionDays,
        legalHoldEnabled,
        legalHoldReason: legalHoldEnabled ? legalHoldReason.trim() : null,
        expectedVersion: policy?.version ?? 0,
      });
      setPolicy(saved);
      setPreview(null);
      setNotice("Politique de conservation enregistrée.");
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setPending(null);
    }
  }

  async function createPreview() {
    setPending("preview");
    setError(null);
    setNotice(null);
    try {
      setPreview(await createLifecyclePreview());
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setPending(null);
    }
  }

  async function exportPreview() {
    if (!preview) return;
    setPending("export");
    setError(null);
    try {
      await downloadLifecycleExport(preview.id);
      setNotice("Export JSON téléchargé.");
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setPending(null);
    }
  }

  async function purgePreview() {
    if (!preview) return;
    setPending("purge");
    setError(null);
    try {
      const result = await purgeLifecyclePreview(preview.id);
      setPurgeOpen(false);
      setPreview(null);
      setNotice(
        `${result.purgedThreadCount} conversation(s), ${result.purgedRunCount} mission(s) et ${result.purgedArtifactCount} fichier(s) supprimés.`,
      );
      router.refresh();
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setPending(null);
    }
  }

  return (
    <SettingsContent>
      <SectionHeading
        title="Conservation"
        description="La Console est la source de vérité de l’historique — le runtime ne rejoue pas ses événements."
      />

      <Card>
        <CardSurface>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-[0.8125rem] font-medium">Données persistées</h3>
              <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">
                Comptage PostgreSQL sur cette instance. La purge est manuelle et précédée d’un aperçu.
              </p>
            </div>
            <Badge tone="neutral">{policy ? `${policy.retentionDays} jours` : "Non configurée"}</Badge>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {rows.map((row) => {
              const Icon = row.icon;
              return (
                <div
                  key={row.label}
                  className="flex items-center justify-between rounded-xl border border-input bg-card px-3 py-2.5"
                >
                  <span className="flex items-center gap-2 text-[0.8125rem]">
                    <Icon className="size-4 text-muted-foreground" />
                    {row.label}
                  </span>
                  <span className="font-mono text-[0.8125rem] font-medium">{row.value}</span>
                </div>
              );
            })}
          </div>
        </CardSurface>
      </Card>

      {canRead ? (
        <Card>
          <CardSurface className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-[0.8125rem] font-medium">Politique de cycle de vie</h3>
                <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">
                  Les conversations sans activité avant la date limite deviennent éligibles.
                </p>
              </div>
              {policy?.legalHoldEnabled ? (
                <Badge tone="warning">Rétention légale active</Badge>
              ) : (
                <Badge tone={policy ? "success" : "neutral"}>
                  {policy ? `Version ${policy.version}` : "À configurer"}
                </Badge>
              )}
            </div>

            {canManage ? (
              <div className="grid gap-3 md:grid-cols-[12rem_minmax(0,1fr)_auto] md:items-end">
                <label className="grid gap-1.5 text-[0.75rem] font-medium">
                  Durée de conservation
                  <span className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={3650}
                      value={retentionDays}
                      onChange={(event) => setRetentionDays(event.target.value)}
                      className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring"
                    />
                    <span className="text-muted-foreground">jours</span>
                  </span>
                </label>
                <div className="space-y-2">
                  <label className="flex cursor-pointer items-center gap-2 text-[0.75rem] font-medium">
                    <input
                      type="checkbox"
                      checked={legalHoldEnabled}
                      onChange={(event) => setLegalHoldEnabled(event.target.checked)}
                      className="size-4 cursor-pointer accent-primary"
                    />
                    Suspendre toute purge (rétention légale)
                  </label>
                  {legalHoldEnabled ? (
                    <input
                      value={legalHoldReason}
                      onChange={(event) => setLegalHoldReason(event.target.value)}
                      placeholder="Motif obligatoire"
                      aria-label="Motif de la rétention légale"
                      className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring"
                    />
                  ) : null}
                </div>
                <Button
                  variant="secondary"
                  disabled={!policyValid || pending !== null}
                  onClick={() => void savePolicy()}
                >
                  {pending === "policy" ? "Enregistrement…" : "Enregistrer"}
                </Button>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2 border-t border-seam pt-4">
              {canPreview ? (
                <Button
                  variant="secondary"
                  disabled={!policy || policy.legalHoldEnabled || pending !== null}
                  onClick={() => void createPreview()}
                  leadingIcon={pending === "preview" ? LoaderCircleIcon : RouteIcon}
                >
                  {pending === "preview" ? "Calcul…" : "Créer un aperçu"}
                </Button>
              ) : null}
              <span className="text-[0.6875rem] text-muted-foreground">
                Aucun effacement n’a lieu pendant l’aperçu.
              </span>
            </div>

            {preview && summary ? (
              <div className="rounded-xl border border-input bg-background p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[0.8125rem] font-medium">Aperçu prêt</p>
                    <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">
                      Activité antérieure au {new Date(preview.cutoffAt).toLocaleString("fr-FR")}
                    </p>
                  </div>
                  <Badge tone={summary.threads > 0 ? "warning" : "success"}>
                    {summary.threads} conversation(s)
                  </Badge>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-4">
                  <Quota label="Missions" value={String(summary.runs)} />
                  <Quota label="Messages" value={String(summary.messages)} />
                  <Quota label="Fichiers" value={String(summary.artifacts)} />
                  <Quota label="Volume fichiers" value={formatBytes(summary.artifactBytes)} />
                </div>
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  {canExport ? (
                    <Button
                      variant="ghost"
                      disabled={pending !== null}
                      leadingIcon={DownloadIcon}
                      onClick={() => void exportPreview()}
                    >
                      {pending === "export" ? "Export…" : "Exporter le manifeste"}
                    </Button>
                  ) : null}
                  {canPurge && summary.threads > 0 ? (
                    <Button
                      variant="danger"
                      disabled={pending !== null}
                      leadingIcon={Trash2Icon}
                      onClick={() => setPurgeOpen(true)}
                    >
                      Supprimer définitivement
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {notice ? <p className="text-[0.75rem] text-pos-700">{notice}</p> : null}
            {error ? <p role="alert" className="text-[0.75rem] text-destructive">{error}</p> : null}
          </CardSurface>
        </Card>
      ) : null}

      <Card>
        <CardSurface className="space-y-4">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-ai-tertiary text-muted-foreground">
              <FileBoxIcon className="size-4" />
            </span>
            <div>
              <h3 className="text-[0.8125rem] font-medium">Fichiers et artefacts</h3>
              <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">
                Quotas d’envoi configurés côté serveur pour chaque mission.
              </p>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <Quota label="Taille max / fichier" value={formatBytes(limits.maxFile)} />
            <Quota label="Quota mission" value={formatBytes(limits.maxTotal)} />
            <Quota label="Fichiers / mission" value={String(limits.maxCount)} />
          </div>
        </CardSurface>
      </Card>

      <div className="rounded-xl bg-info-soft p-3 text-[0.75rem] text-info-700">
        La purge de rétention est manuelle, contrôlée par permissions et journalisée. Aucune purge
        planifiée ne s’exécute automatiquement.
      </div>

      <Dialog
        open={purgeOpen}
        onClose={() => {
          if (pending !== "purge") setPurgeOpen(false);
        }}
        title="Supprimer définitivement ces données ?"
        description="Cette action est irréversible."
        footer={
          <>
            <Button variant="ghost" disabled={pending === "purge"} onClick={() => setPurgeOpen(false)}>
              Annuler
            </Button>
            <Button
              variant="danger"
              disabled={pending === "purge"}
              leadingIcon={Trash2Icon}
              onClick={() => void purgePreview()}
            >
              {pending === "purge" ? "Suppression…" : "Confirmer la purge"}
            </Button>
          </>
        }
      >
        <div className="flex gap-3">
          <ShieldAlertIcon className="mt-0.5 size-5 shrink-0 text-destructive" />
          <p>
            {summary
              ? `${summary.threads} conversation(s), ${summary.runs} mission(s), ${summary.messages} message(s) et ${summary.artifacts} fichier(s) seront retirés de la Console et de leurs espaces de travail.`
              : "Les données de cet aperçu seront supprimées."}
          </p>
        </div>
        {error ? <p role="alert" className="mt-3 text-destructive">{error}</p> : null}
      </Dialog>
    </SettingsContent>
  );
}

function Quota({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-input bg-card p-3">
      <p className="text-[0.6875rem] text-muted-foreground">{label}</p>
      <p className="mt-1 text-[0.8125rem] font-semibold">{value}</p>
    </div>
  );
}

function messageOf(reason: unknown) {
  return reason instanceof Error ? reason.message : "L’opération a échoué.";
}
