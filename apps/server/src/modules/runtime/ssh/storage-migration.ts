import { createHash, randomUUID } from "node:crypto";
import { and, eq, inArray, lt } from "drizzle-orm";
import type {
  RuntimePublicDto,
  RuntimeSshStorageMigrationJobDto,
  RuntimeSshStorageMigrationPhase,
  RuntimeSshStorageMigrationPlanDto,
  RuntimeSshStorageMigrationStatus,
} from "@console/core/types/api";
import { getDatabase } from "@/db/client";
import { runtimeStorageMigrations } from "@/db/schema";
import {
  getRuntimePublic,
  getStoredSshRuntime,
  requireDurableRemoteWorkdir,
} from "../config";
import {
  HermesRuntimeError,
  testHermesRuntimeAgainst,
} from "../hermes-adapter";
import {
  withRuntimeMutationLease,
  type RuntimeMutationLease,
} from "@/modules/runs/active-runtime-guard";
import { activateSshWorkspace } from "./workspace";
import { withEphemeralSshChannel, type SshChannel, type SshTarget } from "./index";

const RUNTIME_ID = "default";
const CONTAINER_NAME = "hermes-console-runtime";
const DATA_TARGET = "/opt/data" as const;
const WORKSPACE_TARGET = "/opt/data/workspace" as const;
const DEFAULT_HOST_ROOT = "/srv/hermes-console/data";
const COMPOSE_DIRECTORY = "/opt/hermes-console-runtime";
const BACKUP_ROOT = "/srv/hermes-console/backups";
const PLAN_TTL_MS = 10 * 60 * 1_000;
const MIN_FREE_HEADROOM = 256 * 1024 * 1024;
const CUTOVER_PROBE_ATTEMPTS = 120;
type StorageInspection = {
  containerName: string | null;
  imageDigest: string | null;
  containerUser: string | null;
  mountType: string | null;
  volumeName: string | null;
  mountDriver: string | null;
  mountDestination: string | null;
  restartPolicy: string | null;
  networkMode: string | null;
  privileged: boolean;
  readOnlyRootfs: boolean;
  mountCount: number | null;
  publishedPort: string | null;
  composeAvailable: boolean;
  toolsAvailable: boolean;
  sourceBytes: number | null;
  fileCount: number | null;
  dataUid: number | null;
  dataGid: number | null;
  dataMode: string | null;
  freeBytes: number | null;
  targetState: "missing" | "empty" | "nonempty" | "symlink" | "unknown";
  composeState: "missing" | "empty" | "nonempty" | "symlink" | "unknown";
};

type SourceSnapshot = RuntimeSshStorageMigrationPlanDto["source"] & {
  dataUid: number;
  dataGid: number;
  dataMode: string;
  sshIdentity: string;
};

type TargetSnapshot = RuntimeSshStorageMigrationPlanDto["target"] & {
  rollbackContainerName: string;
};

const migrationSteps: RuntimeSshStorageMigrationPlanDto["steps"] = [
  { id: "preflight", label: "Revalider la cible", description: "Bloquer les missions et vérifier Docker, le volume, l’image, les chemins et l’espace disque.", destructive: false },
  { id: "backup", label: "Figer et sauvegarder", description: "Arrêter Hermes, créer l’archive locale et calculer le manifeste source.", destructive: true },
  { id: "copy", label: "Copier les données", description: "Copier /opt/data vers le bind mount en conservant métadonnées et contenu.", destructive: true },
  { id: "cutover", label: "Recréer avec Compose", description: "Conserver l’ancien conteneur pour rollback et démarrer le nouveau bind mount.", destructive: true },
  { id: "verify", label: "Prouver le runtime", description: "Vérifier montage, health, capabilities, SFTP et écriture Hermes.", destructive: false },
  { id: "activate", label: "Activer le workspace", description: "Aligner terminal.cwd et persister le mapping uniquement après toutes les preuves.", destructive: false },
];

const migrationWarnings = [
  "Hermes sera indisponible pendant la copie et le cutover.",
  "L’archive locale et le volume conservé facilitent le rollback mais ne sont pas une sauvegarde externe.",
];

export function parseStorageInspection(output: string): StorageInspection {
  const values = Object.fromEntries(
    output
      .split(/\r?\n/)
      .map((line) => line.split("=", 2))
      .filter((parts): parts is [string, string] => parts.length === 2),
  );
  const integer = (key: string) => {
    const value = Number(values[key]);
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  };
  const state = (key: string): StorageInspection["targetState"] => {
    const value = values[key];
    return value === "missing" ||
      value === "empty" ||
      value === "nonempty" ||
      value === "symlink"
      ? value
      : "unknown";
  };
  return {
    containerName: values.container_name || null,
    imageDigest: values.image || null,
    containerUser: values.container_user || null,
    mountType: values.mount_type || null,
    volumeName: values.volume_name || null,
    mountDriver: values.mount_driver || null,
    mountDestination: values.mount_destination || null,
    restartPolicy: values.restart_policy || null,
    networkMode: values.network_mode || null,
    privileged: values.privileged === "true",
    readOnlyRootfs: values.readonly_rootfs === "true",
    mountCount: integer("mount_count"),
    publishedPort: values.published_port || null,
    composeAvailable: values.compose_available === "yes",
    toolsAvailable: values.tools_available === "yes",
    sourceBytes: integer("source_bytes"),
    fileCount: integer("file_count"),
    dataUid: integer("data_uid"),
    dataGid: integer("data_gid"),
    dataMode: values.data_mode || null,
    freeBytes: integer("free_bytes"),
    targetState: state("target_state"),
    composeState: state("compose_state"),
  };
}

export function storageMigrationBlockers(
  inspection: StorageInspection,
  sshUser: string,
) {
  const blockers: string[] = [];
  if (sshUser !== "root") blockers.push("La migration automatique initiale exige la cible SSH root ; utilisez le guide manuel pour un compte sudo personnalisé.");
  if (inspection.containerName !== CONTAINER_NAME) blockers.push(`Le conteneur ${CONTAINER_NAME} est introuvable ou ambigu.`);
  if (!inspection.imageDigest?.match(/^nousresearch\/hermes-agent@sha256:[a-f0-9]{64}$/)) blockers.push("L’image Hermes doit être épinglée par digest avant la migration.");
  if (inspection.containerUser !== "root") blockers.push("Cette première migration ne modifie pas l’utilisateur du conteneur ; une topologie différente exige le guide manuel.");
  if (inspection.mountType !== "volume" || !inspection.volumeName) blockers.push("Le montage /opt/data n’est pas un volume Docker nommé identifiable.");
  if (inspection.mountDriver !== "local") blockers.push("Seuls les volumes Docker utilisant le driver local sont migrés automatiquement.");
  if (inspection.mountDestination !== DATA_TARGET) blockers.push("Le volume Hermes doit être monté exactement sur /opt/data.");
  if (inspection.restartPolicy !== "unless-stopped") blockers.push("La politique de redémarrage existante n’est pas `unless-stopped`.");
  if (inspection.networkMode !== "bridge" || inspection.publishedPort !== "127.0.0.1:8642") blockers.push("Hermes doit publier uniquement 127.0.0.1:8642 en réseau bridge.");
  if (inspection.privileged || inspection.readOnlyRootfs || inspection.mountCount !== 1) blockers.push("Le conteneur possède une topologie de sécurité ou de montages personnalisée.");
  if (!inspection.composeAvailable) blockers.push("Docker Compose n’est pas disponible sur le VPS.");
  if (!inspection.toolsAvailable) blockers.push("L’image Hermes ne fournit pas tous les outils de copie et de vérification requis.");
  if (inspection.targetState !== "missing" && inspection.targetState !== "empty") blockers.push(`${DEFAULT_HOST_ROOT} doit être absent ou vide et ne doit pas être un lien symbolique.`);
  if (inspection.composeState !== "missing" && inspection.composeState !== "empty") blockers.push(`${COMPOSE_DIRECTORY} contient déjà un déploiement non géré par ce plan.`);
  if (
    inspection.sourceBytes === null ||
    inspection.fileCount === null ||
    inspection.dataUid === null ||
    inspection.dataGid === null ||
    !inspection.dataMode
  ) {
    blockers.push("La taille, le contenu ou les permissions du volume source n’ont pas pu être inventoriés.");
  }
  if (
    inspection.sourceBytes !== null &&
    (inspection.freeBytes === null || inspection.freeBytes < inspection.sourceBytes * 3 + MIN_FREE_HEADROOM)
  ) {
    blockers.push("L’espace libre ne couvre pas la copie, l’archive de rollback et la marge de sécurité.");
  }
  return blockers;
}

export function renderManagedCompose(imageDigest: string) {
  if (!/^nousresearch\/hermes-agent@sha256:[a-f0-9]{64}$/.test(imageDigest)) {
    throw new Error("digest Hermes invalide");
  }
  return [
    "name: hermes-console-runtime",
    "services:",
    "  hermes:",
    `    image: ${imageDigest}`,
    `    container_name: ${CONTAINER_NAME}`,
    '    user: "root"',
    "    restart: unless-stopped",
    "    env_file:",
    "      - ./runtime.env",
    "    command: [\"gateway\", \"run\"]",
    "    ports:",
    '      - "127.0.0.1:8642:8642"',
    "    volumes:",
    "      - type: bind",
    `        source: ${DEFAULT_HOST_ROOT}`,
    `        target: ${DATA_TARGET}`,
    "    labels:",
    '      com.hermes-console.managed: "true"',
    '      com.hermes-console.storage-layout: "bind-v1"',
    "",
  ].join("\n");
}

export async function createStorageMigrationPlan(
  expectedRevision: number,
  targetHostRoot = DEFAULT_HOST_ROOT,
): Promise<RuntimeSshStorageMigrationPlanDto> {
  if (requireDurableRemoteWorkdir(targetHostRoot) !== DEFAULT_HOST_ROOT) {
    throw new HermesRuntimeError(
      `La migration automatisée utilise exclusivement ${DEFAULT_HOST_ROOT}.`,
      400,
      "SSH_STORAGE_MIGRATION_TARGET_UNSUPPORTED",
    );
  }
  const stored = await getStoredSshRuntime(expectedRevision);
  const inspection = await withEphemeralSshChannel(stored.target, async (channel) => {
    const result = await channel.exec(storageInspectionCommand());
    if (result.code !== 0) throw remoteFailure(result, "SSH_STORAGE_MIGRATION_INSPECTION_FAILED");
    const parsed = parseStorageInspection(result.stdout);
    if (storageMigrationBlockers(parsed, stored.target.user).length === 0) {
      await probeStoredRuntime(channel, stored.remoteBaseUrl, stored.token);
    }
    return parsed;
  });
  const blockers = storageMigrationBlockers(inspection, stored.target.user);
  const id = randomUUID();
  const rollbackContainerName = `${CONTAINER_NAME}-rollback-${id.slice(0, 8)}`;
  const backupDirectory = `${BACKUP_ROOT}/${id}`;
  const publicSource: RuntimeSshStorageMigrationPlanDto["source"] = {
    containerName: CONTAINER_NAME,
    volumeName: inspection.volumeName ?? "",
    bytes: inspection.sourceBytes ?? 0,
    fileCount: inspection.fileCount ?? 0,
    imageDigest: inspection.imageDigest ?? "",
  };
  const source: SourceSnapshot = {
    ...publicSource,
    dataUid: inspection.dataUid ?? 0,
    dataGid: inspection.dataGid ?? 0,
    dataMode: inspection.dataMode ?? "",
    sshIdentity: sshTargetIdentity(stored.target),
  };
  const publicTarget: RuntimeSshStorageMigrationPlanDto["target"] = {
    hostDataRoot: DEFAULT_HOST_ROOT,
    hermesDataRoot: DATA_TARGET,
    hostWorkspace: `${DEFAULT_HOST_ROOT}/workspace`,
    hermesWorkspace: WORKSPACE_TARGET,
    composeDirectory: COMPOSE_DIRECTORY,
    backupDirectory,
  };
  const target: TargetSnapshot = {
    ...publicTarget,
    rollbackContainerName,
  };
  const confirmation = `MIGRER ${CONTAINER_NAME} VERS ${DEFAULT_HOST_ROOT}`;
  const expiresAt = new Date(Date.now() + PLAN_TTL_MS);
  const plan: RuntimeSshStorageMigrationPlanDto = {
    id,
    expectedRevision,
    source: publicSource,
    target: publicTarget,
    steps: migrationSteps,
    blockers,
    warnings: migrationWarnings,
    confirmation,
    expiresAt: expiresAt.toISOString(),
  };
  if (blockers.length > 0) return plan;

  const db = getDatabase();
  await expireOldPlans(db);
  try {
    await db.insert(runtimeStorageMigrations).values({
      id,
      runtimeId: RUNTIME_ID,
      expectedRevision,
      status: "planned",
      phase: "preflight",
      progress: 0,
      message: "Plan de migration prêt à confirmer.",
      sourceSnapshot: source,
      targetSnapshot: target,
      confirmationHash: hashConfirmation(confirmation),
      expiresAt,
    });
  } catch {
    throw new HermesRuntimeError(
      "Une migration de stockage est déjà planifiée ou en cours.",
      409,
      "SSH_STORAGE_MIGRATION_BUSY",
    );
  }
  return plan;
}

export async function startStorageMigration(input: {
  planId: string;
  expectedRevision: number;
  confirmation: string;
}) {
  const db = getDatabase();
  await expireOldPlans(db);
  const row = await migrationRow(input.planId);
  if (!row || row.status !== "planned") {
    throw new HermesRuntimeError("Ce plan est introuvable, expiré ou déjà utilisé.", 409, "SSH_STORAGE_MIGRATION_PLAN_INVALID");
  }
  if (row.expectedRevision !== input.expectedRevision) {
    throw new HermesRuntimeError("La configuration runtime a changé depuis le plan.", 409, "RUNTIME_CONFIGURATION_CHANGED");
  }
  if (row.expiresAt.getTime() <= Date.now()) {
    throw new HermesRuntimeError("Le plan de migration a expiré.", 409, "SSH_STORAGE_MIGRATION_PLAN_EXPIRED");
  }
  if (hashConfirmation(input.confirmation) !== row.confirmationHash) {
    throw new HermesRuntimeError("La phrase de confirmation ne correspond pas au plan.", 409, "SSH_STORAGE_MIGRATION_CONFIRMATION_REQUIRED");
  }
  await getStoredSshRuntime(input.expectedRevision);
  const [queued] = await db
    .update(runtimeStorageMigrations)
    .set({ status: "queued", message: "Migration en attente.", startedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(runtimeStorageMigrations.id, row.id), eq(runtimeStorageMigrations.status, "planned")))
    .returning();
  if (!queued) throw new HermesRuntimeError("Le plan a déjà été utilisé.", 409, "SSH_STORAGE_MIGRATION_PLAN_REPLAYED");
  void executeStorageMigration(row.id);
  return migrationJobDto(queued);
}

export async function getStorageMigrationJob(id: string) {
  const row = await migrationRow(id);
  return row ? migrationJobDto(row) : null;
}

/** État actif récupérable après un reload navigateur ou un redémarrage UI. */
export async function getActiveStorageMigrationState() {
  await expireOldPlans();
  const [row] = await getDatabase()
    .select()
    .from(runtimeStorageMigrations)
    .where(inArray(runtimeStorageMigrations.status, ["planned", "queued", "running", "recovery_required"]))
    .limit(1);
  if (!row) return null;
  return {
    job: migrationJobDto(row),
    plan: row.status === "planned" ? migrationPlanDto(row) : null,
  };
}

export async function hasBlockingStorageMigration() {
  const [row] = await getDatabase()
    .select({ id: runtimeStorageMigrations.id })
    .from(runtimeStorageMigrations)
    .where(inArray(runtimeStorageMigrations.status, ["queued", "running", "recovery_required"]))
    .limit(1);
  return Boolean(row);
}

export async function assertNoBlockingStorageMigration() {
  if (!(await hasBlockingStorageMigration())) return;
  throw new HermesRuntimeError(
    "Le stockage du runtime Hermes est en cours de migration ou exige une récupération.",
    409,
    "RUNTIME_MUTATION_IN_PROGRESS",
  );
}

async function executeStorageMigration(id: string) {
  const row = await migrationRow(id);
  if (!row) return;
  const source = row.sourceSnapshot as SourceSnapshot;
  const target = row.targetSnapshot as TargetSnapshot;
  let remoteMutationStarted = false;
  let deploymentPreparationStarted = false;
  let activated = false;
  try {
    await withRuntimeMutationLease(async (lease) => {
      const stored = await getStoredSshRuntime(row.expectedRevision);
      assertSameSshTarget(source, stored.target);
      await updateMigration(id, { status: "running", phase: "preflight", progress: 5, message: "Revalidation du VPS et verrouillage du runtime…" });
      await withEphemeralSshChannel(stored.target, async (channel) => {
        const fresh = await inspectStorage(channel);
        const blockers = storageMigrationBlockers(fresh, stored.target.user);
        if (blockers.length > 0 || !sameSourceIdentity(source, fresh)) {
          throw new HermesRuntimeError(blockers.join(" ") || "La source Docker a changé depuis le plan.", 409, "SSH_STORAGE_MIGRATION_SOURCE_CHANGED");
        }
        deploymentPreparationStarted = true;
        await prepareManagedDeployment(channel, source, target);
        await updateMigration(id, { phase: "backup", progress: 20, message: "Arrêt de Hermes et création de l’archive de rollback…" });
        // À partir d'ici, une erreur peut survenir après `docker stop`. Le
        // rollback doit donc être tenté même si la copie échoue avant cutover.
        remoteMutationStarted = true;
        const manifests = await backupAndCopy(channel, source, target);
        await updateMigration(id, {
          phase: "copy",
          progress: 52,
          message: "Copie vérifiée bit à bit.",
          sourceManifestSha256: manifests.source,
          targetManifestSha256: manifests.target,
          rollbackAvailable: true,
        });
        await updateMigration(id, { phase: "cutover", progress: 65, message: "Recréation du conteneur avec le bind mount…" });
        await cutover(channel, target);
        await updateMigration(id, { phase: "verify", progress: 78, message: "Vérification du montage et de l’API Hermes…" });
        await verifyCutover(channel, target);
        // container_boot et s6 peuvent prendre plusieurs secondes avant même
        // de lancer le gateway. La disponibilité reste bornée à 60 secondes.
        await probeStoredRuntime(
          channel,
          stored.remoteBaseUrl,
          stored.token,
          CUTOVER_PROBE_ATTEMPTS,
        );
      });
      await updateMigration(id, { phase: "activate", progress: 90, message: "Activation et preuve du workspace…" });
      await activateSshWorkspace({
        remoteWorkdir: target.hostWorkspace,
        remoteHermesWorkdir: target.hermesWorkspace,
        create: true,
        alignHermesCwd: true,
        expectedRevision: row.expectedRevision,
      }, lease);
      activated = true;
    });
    await updateMigration(id, {
      status: "succeeded",
      phase: "complete",
      progress: 100,
      message: "Stockage migré et workspace vérifié. Le rollback est conservé.",
      rollbackAvailable: true,
      completedAt: new Date(),
    });
  } catch (error) {
    const failure = sanitizeFailure(error);
    if (activated) {
      await updateMigration(id, {
        status: "recovery_required",
        phase: "complete",
        progress: 99,
        message: "Le runtime est activé mais le journal final doit être réconcilié.",
        errorCode: failure.code,
        errorMessage: failure.message,
      }).catch(() => undefined);
      return;
    }
    if (!remoteMutationStarted && deploymentPreparationStarted) {
      try {
        const stored = await getStoredSshRuntime();
        assertSameSshTarget(source, stored.target);
        await withEphemeralSshChannel(stored.target, (channel) => cleanupPreparedDeployment(channel, target));
      } catch {
        // L'erreur initiale reste prioritaire. Un nettoyage non prouvé est
        // signalé par l'état failed et les chemins seront refusés au préflight suivant.
      }
    }
    if (remoteMutationStarted) {
      try {
        const stored = await getStoredSshRuntime();
        assertSameSshTarget(source, stored.target);
        await updateMigration(id, { phase: "rollback", progress: 95, message: "Échec détecté, restauration de l’ancien conteneur…" });
        await withEphemeralSshChannel(stored.target, (channel) => rollback(channel, target));
        await updateMigration(id, {
          status: "rolled_back",
          phase: "complete",
          progress: 100,
          message: "Migration annulée ; l’ancien runtime a été redémarré.",
          errorCode: failure.code,
          errorMessage: failure.message,
          rollbackAvailable: true,
          completedAt: new Date(),
        });
        return;
      } catch (rollbackError) {
        const rollbackFailure = sanitizeFailure(rollbackError);
        await updateMigration(id, {
          status: "recovery_required",
          phase: "rollback",
          progress: 99,
          message: "Le rollback automatique n’a pas pu être prouvé. Intervention opérateur requise.",
          errorCode: "SSH_STORAGE_MIGRATION_ROLLBACK_FAILED",
          errorMessage: `${failure.message} ${rollbackFailure.message}`.slice(0, 1_000),
          rollbackAvailable: true,
        }).catch(() => undefined);
        return;
      }
    }
    await updateMigration(id, {
      status: "failed",
      phase: "complete",
      progress: 100,
      message: "Migration refusée avant le cutover.",
      errorCode: failure.code,
      errorMessage: failure.message,
      completedAt: new Date(),
    }).catch(() => undefined);
  }
}

/**
 * Réconcilie les migrations interrompues avant d'accepter de nouvelles
 * missions. Une migration encore en file est reprise ; une migration ayant
 * déjà touché Docker est prouvée dans son état final ou ramenée sur le volume
 * nommé. Les états ambigus restent bloquants et visibles par l'opérateur.
 */
export async function reconcilePendingStorageMigrations() {
  await expireOldPlans();
  const rows = await getDatabase()
    .select()
    .from(runtimeStorageMigrations)
    .where(inArray(runtimeStorageMigrations.status, ["queued", "running", "recovery_required"]));
  const result = { examined: rows.length, resumed: 0, succeeded: 0, rolledBack: 0, recoveryRequired: 0 };

  for (const row of rows) {
    if (row.status === "queued") {
      result.resumed += 1;
      await executeStorageMigration(row.id);
      const after = await migrationRow(row.id);
      if (after?.status === "succeeded") result.succeeded += 1;
      else if (after?.status === "rolled_back") result.rolledBack += 1;
      else result.recoveryRequired += 1;
      continue;
    }

    const source = row.sourceSnapshot as SourceSnapshot;
    const target = row.targetSnapshot as TargetSnapshot;
    try {
      await withRuntimeMutationLease(async (lease) => {
        const stored = await getStoredSshRuntime();
        assertSameSshTarget(source, stored.target);
        await withEphemeralSshChannel(stored.target, async (channel) => {
          const state = await inspectRecoveryState(channel, target);
          if (
            state.currentMountType === "bind" &&
            state.currentMountSource === target.hostDataRoot &&
            state.currentRunning
          ) {
            await verifyCutover(channel, target);
            await probeStoredRuntime(channel, stored.remoteBaseUrl, stored.token, 3);
            if (stored.configRevision === row.expectedRevision) {
              await activateSshWorkspace({
                remoteWorkdir: target.hostWorkspace,
                remoteHermesWorkdir: target.hermesWorkspace,
                create: true,
                alignHermesCwd: true,
                expectedRevision: row.expectedRevision,
              }, lease);
            } else if (
              stored.configRevision !== row.expectedRevision + 1 ||
              stored.workspaceStatus !== "ready" ||
              stored.remoteWorkdir !== target.hostWorkspace ||
              stored.remoteHermesWorkdir !== target.hermesWorkspace
            ) {
              throw new HermesRuntimeError(
                "Le bind mount fonctionne, mais la révision du workspace ne correspond pas au journal.",
                409,
                "SSH_STORAGE_MIGRATION_REVISION_AMBIGUOUS",
              );
            }
            await updateMigration(row.id, {
              status: "succeeded",
              phase: "complete",
              progress: 100,
              message: "Migration réconciliée au redémarrage ; bind mount et workspace vérifiés.",
              rollbackAvailable: state.rollbackExists,
              completedAt: new Date(),
              errorCode: null,
              errorMessage: null,
            });
            result.succeeded += 1;
            return;
          }

          if (
            state.rollbackExists ||
            (state.currentMountType === "volume" && state.currentVolumeName === source.volumeName)
          ) {
            await rollback(channel, target);
            await updateMigration(row.id, {
              status: "rolled_back",
              phase: "complete",
              progress: 100,
              message: "Migration interrompue réconciliée ; l’ancien runtime est actif.",
              rollbackAvailable: true,
              completedAt: new Date(),
              errorCode: "SSH_STORAGE_MIGRATION_INTERRUPTED",
              errorMessage: "La Console a restauré le runtime précédent après un redémarrage.",
            });
            result.rolledBack += 1;
            return;
          }

          throw new HermesRuntimeError(
            "L’état Docker ne correspond ni au runtime d’origine ni au bind mount attendu.",
            409,
            "SSH_STORAGE_MIGRATION_STATE_AMBIGUOUS",
          );
        });
      });
    } catch (error) {
      const failure = sanitizeFailure(error);
      await updateMigration(row.id, {
        status: "recovery_required",
        phase: "rollback",
        progress: 99,
        message: "État distant ambigu : les missions restent bloquées jusqu’à intervention.",
        errorCode: failure.code,
        errorMessage: failure.message,
      }).catch(() => undefined);
      result.recoveryRequired += 1;
    }
  }
  return result;
}

async function inspectRecoveryState(channel: SshChannel, target: TargetSnapshot) {
  const command = [
    "set -eu",
    `current=${shellQuote(CONTAINER_NAME)}`,
    `rollback=${shellQuote(target.rollbackContainerName)}`,
    'if docker inspect "$current" >/dev/null 2>&1; then',
    '  printf "current_exists=yes\\n"',
    '  docker inspect -f \'{{printf "current_running=%v\\n" .State.Running}}{{range .Mounts}}{{if eq .Destination "/opt/data"}}{{printf "current_mount_type=%s\\ncurrent_mount_source=%s\\ncurrent_volume_name=%s\\n" .Type .Source .Name}}{{end}}{{end}}\' "$current"',
    "else printf \"current_exists=no\\n\"; fi",
    'if docker inspect "$rollback" >/dev/null 2>&1; then printf "rollback_exists=yes\\n"; else printf "rollback_exists=no\\n"; fi',
  ].join("\n");
  const remote = await channel.exec(command);
  if (remote.code !== 0) throw remoteFailure(remote, "SSH_STORAGE_MIGRATION_RECOVERY_INSPECTION_FAILED");
  const values = parseMarkers(remote.stdout);
  return {
    currentRunning: values.current_running === "true",
    currentMountType: values.current_mount_type ?? null,
    currentMountSource: values.current_mount_source ?? null,
    currentVolumeName: values.current_volume_name ?? null,
    rollbackExists: values.rollback_exists === "yes",
  };
}

async function inspectStorage(channel: SshChannel) {
  const result = await channel.exec(storageInspectionCommand());
  if (result.code !== 0) throw remoteFailure(result, "SSH_STORAGE_MIGRATION_INSPECTION_FAILED");
  return parseStorageInspection(result.stdout);
}

async function prepareManagedDeployment(
  channel: SshChannel,
  source: SourceSnapshot,
  target: TargetSnapshot,
) {
  const compose = renderManagedCompose(source.imageDigest);
  const command = [
    "set -eu",
    `install -d -m 0700 -- ${shellQuote("/srv/hermes-console")} ${shellQuote(BACKUP_ROOT)} ${shellQuote(target.backupDirectory)} ${shellQuote(target.composeDirectory)}`,
    `install -d -o ${source.dataUid} -g ${source.dataGid} -m ${shellQuote(source.dataMode)} -- ${shellQuote(target.hostDataRoot)}`,
    `container_env=$(mktemp); image_env=$(mktemp); trap 'rm -f "$container_env" "$image_env"' EXIT`,
    `docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' ${shellQuote(source.containerName)} > "$container_env"`,
    `docker image inspect -f '{{range .Config.Env}}{{println .}}{{end}}' ${shellQuote(source.imageDigest)} > "$image_env"`,
    `awk -F= 'NR==FNR { base[$1]=$0; next } !($1 in base) || base[$1] != $0 { print }' "$image_env" "$container_env" > ${shellQuote(`${target.composeDirectory}/runtime.env`)}`,
    `grep -q '^API_SERVER_KEY=' ${shellQuote(`${target.composeDirectory}/runtime.env`)}`,
    `chmod 0600 ${shellQuote(`${target.composeDirectory}/runtime.env`)}`,
    `printf '%s' ${shellQuote(compose)} > ${shellQuote(`${target.composeDirectory}/compose.yml`)}`,
    `chmod 0600 ${shellQuote(`${target.composeDirectory}/compose.yml`)}`,
  ].join("\n");
  const result = await channel.exec(command);
  if (result.code !== 0) throw remoteFailure(result, "SSH_STORAGE_MIGRATION_PREPARE_FAILED");
}

async function backupAndCopy(
  channel: SshChannel,
  source: SourceSnapshot,
  target: TargetSnapshot,
) {
  const command = renderBackupAndCopyCommand(source, target);
  const result = await channel.exec(command);
  if (result.code !== 0) throw remoteFailure(result, "SSH_STORAGE_MIGRATION_COPY_FAILED");
  const values = parseMarkers(result.stdout);
  if (!values.source_manifest || values.source_manifest !== values.target_manifest) {
    throw new HermesRuntimeError("Les manifestes source et cible divergent.", 502, "SSH_STORAGE_MIGRATION_COPY_MISMATCH");
  }
  return { source: values.source_manifest, target: values.target_manifest };
}

export function renderBackupAndCopyCommand(
  source: Pick<SourceSnapshot, "containerName" | "volumeName" | "imageDigest">,
  target: Pick<TargetSnapshot, "hostDataRoot" | "backupDirectory">,
) {
  const helper = [
    "set -eu",
    "test -z \"$(find /to -mindepth 1 -print -quit)\"",
    "tar -C /from -czpf /backup/opt-data.tar.gz .",
    "cd /backup && sha256sum opt-data.tar.gz > opt-data.tar.gz.sha256",
    "source_manifest=$(tar -C /from --sort=name --numeric-owner -cpf - . | sha256sum | awk '{print $1}')",
    "cp -a /from/. /to/",
    "target_manifest=$(tar -C /to --sort=name --numeric-owner -cpf - . | sha256sum | awk '{print $1}')",
    'printf "source_manifest=%s\\ntarget_manifest=%s\\n" "$source_manifest" "$target_manifest"',
    'test "$source_manifest" = "$target_manifest"',
  ].join("\n");
  const command = [
    "set -eu",
    `docker stop --time 30 ${shellQuote(source.containerName)} >/dev/null`,
    [
      "docker run --rm --entrypoint sh",
      `  --mount type=volume,src=${shellQuote(source.volumeName)},dst=/from,readonly`,
      `  --mount type=bind,src=${shellQuote(target.hostDataRoot)},dst=/to`,
      `  --mount type=bind,src=${shellQuote(target.backupDirectory)},dst=/backup`,
      `  ${shellQuote(source.imageDigest)} -c ${shellQuote(helper)}`,
    ].join(" \\\n"),
  ].join("\n");
  return command;
}

async function cutover(channel: SshChannel, target: TargetSnapshot) {
  const command = [
    "set -eu",
    `docker rename ${shellQuote(CONTAINER_NAME)} ${shellQuote(target.rollbackContainerName)}`,
    `cd ${shellQuote(target.composeDirectory)}`,
    "docker compose -f compose.yml up -d --no-build",
  ].join("\n");
  const result = await channel.exec(command);
  if (result.code !== 0) throw remoteFailure(result, "SSH_STORAGE_MIGRATION_CUTOVER_FAILED");
}

async function verifyCutover(channel: SshChannel, target: TargetSnapshot) {
  const command = [
    "set -eu",
    `test "$(docker inspect -f '{{range .Mounts}}{{if eq .Destination \"/opt/data\"}}{{.Type}}{{end}}{{end}}' ${shellQuote(CONTAINER_NAME)})" = bind`,
    `test "$(docker inspect -f '{{range .Mounts}}{{if eq .Destination \"/opt/data\"}}{{.Source}}{{end}}{{end}}' ${shellQuote(CONTAINER_NAME)})" = ${shellQuote(target.hostDataRoot)}`,
    `test "$(docker inspect -f '{{.State.Running}}' ${shellQuote(CONTAINER_NAME)})" = true`,
  ].join("\n");
  const result = await channel.exec(command);
  if (result.code !== 0) throw remoteFailure(result, "SSH_STORAGE_MIGRATION_VERIFY_FAILED");
}

async function rollback(channel: SshChannel, target: TargetSnapshot) {
  const command = [
    "set -eu",
    `if docker inspect ${shellQuote(target.rollbackContainerName)} >/dev/null 2>&1; then`,
    `  docker rm -f ${shellQuote(CONTAINER_NAME)} >/dev/null 2>&1 || true`,
    `  docker rename ${shellQuote(target.rollbackContainerName)} ${shellQuote(CONTAINER_NAME)}`,
    `  docker start ${shellQuote(CONTAINER_NAME)} >/dev/null`,
    "else",
    `  docker start ${shellQuote(CONTAINER_NAME)} >/dev/null`,
    "fi",
    `test "$(docker inspect -f '{{.State.Running}}' ${shellQuote(CONTAINER_NAME)})" = true`,
    `test ! -L ${shellQuote(target.hostDataRoot)} && test ! -L ${shellQuote(target.composeDirectory)}`,
    `if [ -e ${shellQuote(target.hostDataRoot)} ]; then test ! -e ${shellQuote(`${target.backupDirectory}/failed-data`)}; mv ${shellQuote(target.hostDataRoot)} ${shellQuote(`${target.backupDirectory}/failed-data`)}; fi`,
    `if [ -e ${shellQuote(target.composeDirectory)} ]; then test ! -e ${shellQuote(`${target.backupDirectory}/failed-deployment`)}; mv ${shellQuote(target.composeDirectory)} ${shellQuote(`${target.backupDirectory}/failed-deployment`)}; fi`,
  ].join("\n");
  const result = await channel.exec(command);
  if (result.code !== 0) throw remoteFailure(result, "SSH_STORAGE_MIGRATION_ROLLBACK_FAILED");
}

async function cleanupPreparedDeployment(channel: SshChannel, target: TargetSnapshot) {
  const command = [
    "set -eu",
    `test ! -L ${shellQuote(target.hostDataRoot)} && test ! -L ${shellQuote(target.composeDirectory)}`,
    `rm -f -- ${shellQuote(`${target.composeDirectory}/runtime.env`)} ${shellQuote(`${target.composeDirectory}/compose.yml`)}`,
    `rmdir -- ${shellQuote(target.composeDirectory)} ${shellQuote(target.hostDataRoot)} ${shellQuote(target.backupDirectory)} 2>/dev/null || true`,
  ].join("\n");
  const result = await channel.exec(command);
  if (result.code !== 0) throw remoteFailure(result, "SSH_STORAGE_MIGRATION_PREPARE_CLEANUP_FAILED");
}

async function probeStoredRuntime(
  channel: SshChannel,
  remoteBaseUrl: string,
  token: string,
  attempts = 1,
) {
  const endpoint = new URL(remoteBaseUrl);
  const localBaseUrl = await channel.forward(endpoint.hostname, Number(endpoint.port || 80));
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await testHermesRuntimeAgainst({ baseUrl: localBaseUrl, token });
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attempts) await Bun.sleep(500);
    }
  }
  throw lastError;
}

function storageInspectionCommand() {
  const targetParent = "/srv";
  return [
    "set -eu",
    `container=${shellQuote(CONTAINER_NAME)}`,
    `target=${shellQuote(DEFAULT_HOST_ROOT)}`,
    `compose_dir=${shellQuote(COMPOSE_DIRECTORY)}`,
    'test "$(docker ps -a --filter name=^/${container}$ --format "{{.Names}}" | wc -l | tr -d " ")" = 1',
    'printf "container_name=%s\\n" "$container"',
    `docker inspect -f '{{printf "image=%s\\ncontainer_user=%s\\nrestart_policy=%s\\nnetwork_mode=%s\\nprivileged=%v\\nreadonly_rootfs=%v\\nmount_count=%d\\n" .Config.Image .Config.User .HostConfig.RestartPolicy.Name .HostConfig.NetworkMode .HostConfig.Privileged .HostConfig.ReadonlyRootfs (len .Mounts)}}{{range .Mounts}}{{if eq .Destination "/opt/data"}}{{printf "mount_type=%s\\nvolume_name=%s\\nmount_driver=%s\\nmount_destination=%s\\n" .Type .Name .Driver .Destination}}{{end}}{{end}}' "$container"`,
    'published_port="$(docker port "$container" 8642/tcp 2>/dev/null | head -n 1)"; printf "published_port=%s\\n" "$published_port"',
    'if docker compose version >/dev/null 2>&1; then printf "compose_available=yes\\n"; else printf "compose_available=no\\n"; fi',
    'volume="$(docker inspect -f "{{range .Mounts}}{{if eq .Destination \\"/opt/data\\"}}{{.Name}}{{end}}{{end}}" "$container")"',
    'if docker exec "$container" sh -c "command -v tar >/dev/null && command -v cp >/dev/null && command -v sha256sum >/dev/null && command -v find >/dev/null && command -v sort >/dev/null && command -v du >/dev/null && tar --sort=name --numeric-owner -cf /dev/null -T /dev/null && find / -mindepth 0 -maxdepth 0 >/dev/null"; then printf "tools_available=yes\\n"; else printf "tools_available=no\\n"; fi',
    'if [ -n "$volume" ]; then docker exec "$container" sh -c \'printf "source_bytes=%s\\nfile_count=%s\\n" "$(du -sb /opt/data | cut -f1)" "$(find /opt/data -type f | wc -l | tr -d " ")"\'; fi',
    'docker exec "$container" sh -c \'printf "data_uid=%s\\ndata_gid=%s\\ndata_mode=%s\\n" "$(stat -c %u /opt/data)" "$(stat -c %g /opt/data)" "$(stat -c %a /opt/data)"\'',
    `free_bytes="$(df -PB1 ${shellQuote(targetParent)} | awk 'NR==2 {print $4}')"; printf "free_bytes=%s\\n" "$free_bytes"`,
    'path_state() { if [ -L "$1" ]; then printf symlink; elif [ ! -e "$1" ]; then printf missing; elif [ ! -d "$1" ]; then printf nonempty; elif [ -n "$(find "$1" -mindepth 1 -print -quit)" ]; then printf nonempty; else printf empty; fi; }',
    'printf "target_state=%s\\n" "$(path_state "$target")"',
    'printf "compose_state=%s\\n" "$(path_state "$compose_dir")"',
  ].join("\n");
}

function sameSourceIdentity(source: SourceSnapshot, inspection: StorageInspection) {
  return source.containerName === inspection.containerName &&
    source.volumeName === inspection.volumeName &&
    source.imageDigest === inspection.imageDigest &&
    source.dataUid === inspection.dataUid &&
    source.dataGid === inspection.dataGid &&
    source.dataMode === inspection.dataMode;
}

function sshTargetIdentity(target: SshTarget) {
  return [target.host, target.port, target.user, target.auth].join("|");
}

function assertSameSshTarget(source: SourceSnapshot, target: SshTarget) {
  if (source.sshIdentity === sshTargetIdentity(target)) return;
  throw new HermesRuntimeError(
    "La cible SSH a changé depuis la création du plan ; aucune récupération distante n’est tentée.",
    409,
    "SSH_STORAGE_MIGRATION_TARGET_CHANGED",
  );
}

function migrationJobDto(
  row: typeof runtimeStorageMigrations.$inferSelect,
): RuntimeSshStorageMigrationJobDto {
  const dto: RuntimeSshStorageMigrationJobDto = {
    id: row.id,
    status: row.status as RuntimeSshStorageMigrationStatus,
    phase: row.phase as RuntimeSshStorageMigrationPhase,
    progress: row.progress,
    message: row.message,
    rollbackAvailable: row.rollbackAvailable,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
  if (row.errorCode && row.errorMessage) dto.error = { code: row.errorCode, message: row.errorMessage };
  return dto;
}

function migrationPlanDto(
  row: typeof runtimeStorageMigrations.$inferSelect,
): RuntimeSshStorageMigrationPlanDto {
  const source = row.sourceSnapshot as SourceSnapshot;
  const target = row.targetSnapshot as TargetSnapshot;
  return {
    id: row.id,
    expectedRevision: row.expectedRevision,
    source: {
      containerName: source.containerName,
      volumeName: source.volumeName,
      bytes: source.bytes,
      fileCount: source.fileCount,
      imageDigest: source.imageDigest,
    },
    target: {
      hostDataRoot: target.hostDataRoot,
      hermesDataRoot: target.hermesDataRoot,
      hostWorkspace: target.hostWorkspace,
      hermesWorkspace: target.hermesWorkspace,
      composeDirectory: target.composeDirectory,
      backupDirectory: target.backupDirectory,
    },
    steps: migrationSteps,
    blockers: [],
    warnings: migrationWarnings,
    confirmation: `MIGRER ${CONTAINER_NAME} VERS ${DEFAULT_HOST_ROOT}`,
    expiresAt: row.expiresAt.toISOString(),
  };
}

async function migrationRow(id: string) {
  return getDatabase().query.runtimeStorageMigrations.findFirst({
    where: eq(runtimeStorageMigrations.id, id),
  });
}

async function updateMigration(
  id: string,
  values: Partial<typeof runtimeStorageMigrations.$inferInsert> & {
    status?: RuntimeSshStorageMigrationStatus;
    phase?: RuntimeSshStorageMigrationPhase;
  },
) {
  const [row] = await getDatabase()
    .update(runtimeStorageMigrations)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(runtimeStorageMigrations.id, id))
    .returning();
  if (!row) throw new Error("journal de migration introuvable");
  return row;
}

async function expireOldPlans(db = getDatabase()) {
  await db
    .update(runtimeStorageMigrations)
    .set({ status: "failed", phase: "complete", progress: 100, message: "Plan expiré sans exécution.", errorCode: "SSH_STORAGE_MIGRATION_PLAN_EXPIRED", errorMessage: "Le plan n’a pas été confirmé dans les dix minutes.", completedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(runtimeStorageMigrations.status, "planned"), lt(runtimeStorageMigrations.expiresAt, new Date())));
}

function hashConfirmation(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function parseMarkers(output: string) {
  return Object.fromEntries(
    output
      .split(/\r?\n/)
      .map((line) => line.split("=", 2))
      .filter((parts): parts is [string, string] => parts.length === 2),
  );
}

function sanitizeFailure(error: unknown) {
  const code = error instanceof Error && "code" in error
    ? String((error as { code?: unknown }).code)
    : "SSH_STORAGE_MIGRATION_FAILED";
  const message = (error instanceof Error ? error.message : "Migration distante impossible.")
    .replace(/API_SERVER_KEY\s*=\s*[^\s]+/gi, "API_SERVER_KEY=[redacted]")
    .replace(/[A-Fa-f0-9]{48,}/g, "[redacted]")
    .slice(0, 1_000);
  return { code, message };
}

function remoteFailure(
  result: { stdout: string; stderr: string; code: number },
  code: string,
) {
  const detail = sanitizeFailure(new Error(result.stderr || result.stdout || `commande distante échouée (${result.code})`));
  return new HermesRuntimeError(detail.message, 502, code);
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

export async function storageMigrationRuntimeDto(id: string): Promise<RuntimePublicDto | null> {
  const row = await migrationRow(id);
  if (!row || row.status !== "succeeded") return null;
  return getRuntimePublic();
}
