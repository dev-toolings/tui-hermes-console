# Recette G1-004D — frontière pré-effet Hermes réelle

Le relais d'approbation Console vers `POST /v1/runs/:id/approval` est maintenant enveloppé par
`modules/policy/hermes-approval.ts`, lui-même basé sur `reference-enforcer.ts`.

## Contrat

- la clé Ed25519 privée reste dans l'environnement du serveur Console ; elle ne passe ni dans le
  navigateur, ni dans Hermes, ni dans le transcript ;
- l'enveloppe lie `siteId`, `runId`, `hermesRunId`, `approvalRequestId`, corrélation, approbateur,
  portée, TTL et nonce dérivé du claim PostgreSQL ;
- le hash signé couvre exactement l'URL et le JSON envoyés au POST Hermes ;
- l'enforcer consomme le nonce avant l'effet ; policy absente, identité incohérente ou décision
  invalide libèrent le claim et n'appellent jamais Hermes ;
- la preuve de décision signée est conservée dans l'entrée d'audit de l'approbation réussie.

## Configuration

Générer une paire hors du dépôt :

```sh
bun run policy:keygen
```

Renseigner les deux valeurs dans l'environnement du serveur :

```dotenv
HERMES_POLICY_PRIVATE_KEY_B64URL=...
HERMES_POLICY_PUBLIC_KEY_B64URL=...
```

Une clé privée absente est un refus `503 HERMES_POLICY_UNAVAILABLE`, jamais un fallback permissif.

## Preuve locale

```sh
bun test apps/server/src/modules/policy apps/server/src/modules/runs/respond-approval.test.ts --max-concurrency=1
bun run --filter server typecheck
```

La preuve locale couvre l'effet signé exact, policy absente, refus avant Hermes, replay, TTL,
payload/scope altérés et conservation de l'erreur distante. Le rejeu [P-E2E Hermes local du
04-08-2026](../evidence/2026-08-04-g1-004-hermes-local-p-e2e.md) couvre aussi un run réel suspendu,
un refus et l'absence d'effet via l'adaptateur policy. Le harness [route Console réelle du
04-08-2026](../evidence/2026-08-04-g1-004-real-console-local.md) couvre en plus le claim PostgreSQL,
le 503 fail-closed et la reprise après redémarrage. Le préflight réel du runtime PVE 210
est consigné dans [la preuve Hermes déployé du 04-08-2026](../evidence/2026-08-04-g1-004-hermes-runtime-preflight.md) :
le transport et les capacités répondent, mais le run est bloqué avant `waiting_for_approval` faute
de provider d'inférence configuré. Cette preuve ne remplace donc pas encore P-E2E/P-SEC ni la revue
indépendante.
