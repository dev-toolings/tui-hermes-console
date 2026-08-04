# Preuve P-OPS — migration du stockage Docker Hermes — 2026-08-02

- **Date/heure UTC :** 02-08-2026, 20:17–20:33 UTC
- **Story :** `US-G1-SSH-010`
- **Commit/build :** worktree non commité ; migration `0031_runtime_storage_migrations`
- **Environnement :** Console locale Linux, PostgreSQL local, VPS Hermes existant
- **Opérateur :** opérateur du dépôt
- **Reviewer :** non réalisé
- **Cible :** alias expurgé du VPS Hermes existant
- **Versions :** Bun `1.3.13`, Hermes `0.19.1`, image OCI épinglée par digest
- **Verdict :** `VÉRIFIÉE` pour le cutover P-OPS et son rollback automatique ; acceptation de la
  story et de Gate 1 encore ouverte faute de reviewer et de dépendances acceptées

## Contrat vérifié

> Migrer intégralement le volume nommé monté sur `/opt/data` vers le bind mount déclaratif
> `/srv/hermes-console/data`, sans exposer de secret, sans perdre les métadonnées et en conservant
> un retour arrière exploitable.

~~~text
╔════════════ Console locale ════════════╗
║ ┌────────────────────────────────────┐ ║
║ │ UI guidée · Hono · journal PG      │ ║
║ └─────────────────┬──────────────────┘ ║
╚═══════════════════│════════════════════╝
                    │ SSH · SFTP · état de migration
                    ▼
╔════════════════════ VPS Hermes ════════════════════════════╗
║ ┌────────────────────────────┐  bind mount RW              ║
║ │ /srv/hermes-console/data   │──────────────────────┐      ║
║ └────────────────────────────┘                      ▼      ║
║ ┌────────────────────────────┐ garde       ┌─────────────┐ ║
║ │ volume + ancien conteneur  │◀────────────│ /opt/data   │ ║
║ └────────────────────────────┘  rollback   │ Hermes      │ ║
║ ┌────────────────────────────┐             └─────────────┘ ║
║ │ archive + SHA-256          │  preuve d'intégrité          ║
║ └────────────────────────────┘                               ║
╚══════════════════════════════════════════════════════════════╝
~~~

Légende : la Console orchestre à distance ; le bind mount devient le stockage actif ; volume,
conteneur et archive restent disponibles pour le rollback. Composants : UI Console, API Hono,
journal PostgreSQL, SSH/SFTP, Docker Compose, Hermes et stockage du VPS.

## Préflight positif

- conteneur reconnu : `hermes-console-runtime` ;
- source : volume nommé monté uniquement sur `/opt/data` ;
- cible : `/srv/hermes-console/data` ;
- inventaire du plan réussi : `30 259 242` octets et `583` fichiers ;
- image :
  `nousresearch/hermes-agent@sha256:8aab4fb9665995cafc118546d071caf7b12fc36ef038dbb81bd4ca1cdb2a1ccc` ;
- publication : `127.0.0.1:8642` ; restart : `unless-stopped` ;
- confirmation opérateur exacte : reçue par l'UI/API, non conservée comme secret.

## Scénario négatif réel et rollback

Le premier job `3c843645-c178-4cc4-8894-a1e908603435` a copié les données et démarré le nouveau
conteneur, mais la sonde initiale bornée à six secondes a expiré pendant le démarrage du gateway.
La Console n'a pas persisté de faux succès : elle a supprimé le nouveau déploiement, remis l'ancien
conteneur sur le volume nommé et retrouvé un runtime sain.

L'analyse temporelle a montré que le processus gateway devenait disponible juste à l'expiration de
la sonde. La fenêtre post-cutover a été portée à 60 secondes, toujours bornée, puis les tests ciblés
ont été rejoués. Le répertoire de ce premier essai conserve archive, données du déploiement échoué et
configuration de rollback.

## Scénario positif final

Le second job `5d41550a-df78-4dc1-aaf3-d6b6d687febd` a terminé avec :

```json
{
  "status": "succeeded",
  "phase": "complete",
  "progress": 100,
  "rollbackAvailable": true,
  "activeMigration": null
}
```

Les manifestes tar déterministes de la source et de la cible sont identiques :

```text
dac1a9dbce7596cd75cff0ca0792c0c0e64584ece3a4fa24a3e059cc5a0d2514
```

L'archive de sauvegarde du second essai est vérifiable depuis son propre répertoire :

```text
opt-data.tar.gz: OK
sha256=fc5d5f809517952a73cab480e099b48ec2394c56643c92444447d0de3c183977
size=10950246 bytes
checksum owner=root:root mode=0600
```

## État Docker et fichiers observé après cutover

- conteneur actif : `hermes-console-runtime`, état `running` ;
- montage actif : `bind|/srv/hermes-console/data|/opt/data` ;
- image identique et épinglée par digest ;
- labels gérés : `managed=true`, `layout=bind-v1` ;
- port publié uniquement sur `127.0.0.1:8642` ;
- utilisateur de bootstrap du conteneur : `root`, inchangé par cette migration ;
- `/srv/hermes-console/data` : propriétaire `10000:10000`, mode `0700` ;
- workspace : propriétaire `10000:10000`, mode `0755` ;
- `/opt/hermes-console-runtime/compose.yml` : `root:root`, mode `0600` ;
- `/opt/hermes-console-runtime/runtime.env` : `root:root`, mode `0600` ; seules les clés de
  variables ont été inspectées, jamais leurs valeurs ;
- ancien conteneur : `hermes-console-runtime-rollback-5d41550a`, état `exited`, toujours lié au
  volume nommé d'origine.

## Validation Console et Hermes

- `/health` et `/v1/capabilities` : Hermes `0.19.1`, plateforme `hermes-agent` ;
- round-trip SFTP et écriture depuis Hermes : réussis pendant la phase d'activation ;
- mapping persisté : `/srv/hermes-console/data/workspace` vers `/opt/data/workspace` ;
- `terminal.cwd` : `/opt/data/workspace` ;
- workspace : `ready` ; santé : `healthy` ; révision CAS : `4` ;
- aucune migration bloquante après succès ;
- l'ancienne clé API a été conservée conformément à la décision opérateur et n'apparaît dans aucun
  rapport ou log de preuve.

## Correctifs validés

- fenêtre de disponibilité post-cutover portée à 120 tentatives de 500 ms ;
- checksum d'archive produit avec un nom relatif portable, afin que `sha256sum -c` fonctionne dans
  le répertoire de sauvegarde ;
- typecheck serveur et cinq tests ciblés de migration : succès ;
- `/api/auth` local : `200` via Vite `:1420` et Hono `:3170`, puis `/setup` chargé en navigateur
  sans erreur console ou réseau après relance du backend local.

## Nettoyage et conservation

Aucun élément de rollback n'a été supprimé. Restent volontairement présents :

- le volume nommé original ;
- l'ancien conteneur arrêté ;
- les archives et manifestes des deux essais ;
- l'ancien digest, identique au digest actif.

La suppression est différée jusqu'à une mission réelle avec artefact relu par SFTP et une sauvegarde
externe validée. La rotation de clé API reste une opération séparée.

## Verdict

`VÉRIFIÉE` pour l'implémentation et le cutover P-OPS de `US-G1-SSH-010`, y compris un rollback
automatique réellement déclenché. La story normative n'est pas `ACCEPTÉE` : US-G1-SSH-005/006,
revue indépendante, mission avec artefact et sauvegarde externe restent ouvertes.

## Acceptation reviewer

- **Nom/identifiant :** à désigner
- **Date :** —
- **Décision :** non revue
