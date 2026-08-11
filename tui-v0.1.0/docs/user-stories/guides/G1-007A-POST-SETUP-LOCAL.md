# Guide de recette — G1-007A post-setup local

Ce slice exécute le parcours critique sur une installation déjà configurée. Le serveur Hono et
PostgreSQL tournent dans des processus/conteneurs réels ; seul Hermes est remplacé par un faux
serveur HTTP qui expose les endpoints observés (`/health`, `/v1/capabilities`, `/v1/runs`, SSE
`/events`, `/approval` et `/api/sessions`). Le faux runtime compte les POST d'approbation et
l'effet synthétique.

```text
╔══════════════════╗   HTTP + cookie/CSRF   ╔══════════════════╗
║ Harness client   ║ ─────────────────────▶ ║ Console Hono    ║
╚══════════════════╝                         ╚══════╤═══════════╝
                                                     │ SQL + fichiers
                                                     ▼
                                              ╔══════════════════╗
                                              ║ PostgreSQL +      ║
                                              ║ racines scratch   ║
                                              ╚══════╤═══════════╝
                                                     │ HTTP/SSE runtime
                                                     ▼
                                              ╔══════════════════╗
                                              ║ Hermes synthétique║
                                              ║ compteur + états  ║
                                              ╚══════════════════╝
```

Composants : harness, serveur Hono, PostgreSQL/racines éphémères et faux Hermes. Les flèches
indiquent respectivement le parcours authentifié, la persistance et le protocole runtime.

## Exécution

```sh
bun run proof:g1-007a
bun run --filter server typecheck
```

Le harness tire l'image PostgreSQL `17.6-alpine` épinglée par digest, applique le journal Drizzle,
prépare un compte requester et un compte approver, puis injecte une configuration runtime et un
consentement IA déjà validés. Le serveur Console est démarré puis remplacé avec la même URL DB et
les mêmes racines `HERMES_SHARED_WORKDIR`/`HERMES_CONSOLE_ARTIFACTS_DIR`.

## Parcours positif

1. Vérifier `/api/setup` (`completed`, consentement courant) et l'agent seedé.
2. Créer un thread/run par HTTP authentifié ; attendre `approval.request` sur le flux SSE.
3. Extraire `approvalRequestId`, envoyer `once` avec le compte approver et vérifier le compteur
   Hermes (un seul POST), l'effet synthétique unique, l'audit `RUN_APPROVAL_INTENT` puis
   `RUN_APPROVAL_ALLOWED`, et leur corrélation.
4. Arrêter le processus Console pendant `awaiting_approval`, le redémarrer avec la même DB et les
   mêmes racines, puis vérifier que la réconciliation conserve la demande sans la rejouer.
5. Décider `once`, attendre `completed`, lire les octets de l'artefact et recalculer son SHA-256.
6. Redémarrer encore le processus Console après completion ; relire le run terminé et le même
   artefact depuis les racines persistantes du harness.

## Variantes négatives

- Runtime arrêté : le run est `failed` avec une erreur explicite, sans succès fabriqué.
- Session expirée : `/api/setup` répond `401 AUTH_REQUIRED`.
- CSRF incorrect : la mutation répond `403` et le nombre de runs ne change pas.
- `deny` : Hermes reçoit bien une décision humaine de refus, mais `dangerousEffectCount` ne
  progresse pas et aucun artefact output n'est créé.
- Octets d'artefact absents puis corrompus : la lecture répond respectivement `410` puis `409`.

## Limites

Le scénario est `US-G1-007A-post-setup-local`, pas l'acceptation complète de US-G1-007 : il ne
prouve ni Google OIDC réel, ni une installation vierge (les routes runtime/setup sont encore
protégées par l'absence d'autorité `installation_admin`), ni Hermes upstream, ni P-SEC/P-OPS. Il
ne modifie pas le cœur runtime.
