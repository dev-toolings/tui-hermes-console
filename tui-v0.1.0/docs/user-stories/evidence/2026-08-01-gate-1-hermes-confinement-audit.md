# Preuve locale — US-G1-002A — manifeste Hermes confiné

- Date/heure UTC : 2026-08-01
- Story : US-G1-002A, préparation de US-G1-002
- Commit/build : slice local story-tagged (voir historique Git)
- Environnement : Docker local, fixture synthétique
- Opérateur : Codex
- Reviewer : responsable sécurité/exploitation distinct requis
- Cible : aucune cible distante ; aucun VPS modifié

## Périmètre

Le fichier `compose.prod.hermes-managed.yml` est un overlay opt-in. Il ne change pas
`compose.prod.yml` et ne force aucune migration d'un Hermes direct ou SSH existant. Le manifeste
exige :

- une image `HERMES_IMAGE` avec digest `@sha256:<64 hex>` ;
- `user: 65532:65532`, `read_only: true`, `no-new-privileges:true` et `cap_drop: ALL` ;
- `/work` comme seul volume persistant writable ; `/tmp` et `/run` sont des tmpfs éphémères ;
- limites CPU `2`, mémoire `1G` et PID `256` (Compose les normalise en `2` et `1073741824`) ;
- réseau `hermes-private` `internal: true`, sans `ports` ;
- secret runtime monté depuis un fichier opérateur hors dépôt.

## Validation du manifeste

Commande exécutée avec une image fixture locale digestée et un secret synthétique :

```text
docker compose --env-file deploy/production.env.example \
  -f compose.prod.yml -f compose.prod.hermes-managed.yml config --format json
status=0
```

Le test `apps/server/src/db/hermes-confinement-compose.test.ts` vérifie le digest, l'identité,
les protections, le réseau, les limites et l'absence de port publié. Il vérifie aussi que le harness
refuse une image `:latest` avant toute sonde.

## Sondes de refus sur fixture

```text
bun apps/server/scripts/prove-hermes-confinement.ts
status=PASS
rootfs-write-refused
docker-socket-refused
host-path-refused
cross-workflow-secret-refused
```

La fixture utilisée était une image Console locale digestée, pas un binaire Hermes. Le workdir de la
sonde était un tmpfs synthétique ; aucun secret client, token réel, VPS ou runtime distant n'a été
touché.

## Preuves restantes et limites

Cette préparation fournit `P-CODE` et une vérification locale du manifeste. Elle ne fournit pas :

- `P-SEC` indépendant sur l'image Hermes réellement choisie et ses capabilities effectives ;
- `P-OPS` sur le déploiement cible, l'identité process, les mounts et les limites réellement actives ;
- `P-E2E` avec Hermes réel, refus d'accès au socket Docker, chemin hôte non monté et secret d'un autre
  workflow, puis reprise après redémarrage.

Le statut de la story complète reste donc `BLOQUÉE`. La sortie locale `PASS` est une préparation
reproductible, jamais une acceptation Gate 1.

## Validation locale

```text
bun test apps/server/src/db/hermes-confinement-compose.test.ts
2 pass, 0 fail, 15 expect calls
bun run --filter server typecheck
PASS
git diff --check
PASS
```

## Acceptation reviewer

- Nom/identifiant : à renseigner
- Date : à renseigner
- Décision : ACCEPTÉE | REFUSÉE
