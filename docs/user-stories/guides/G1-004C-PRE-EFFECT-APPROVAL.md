# Guide de recette — G1-004C-local, identité et CAS avant approbation Hermes

Ce slice local ajoute une identité stable aux événements `approval.request`, la persiste dans
PostgreSQL et consomme une demande par CAS avant le POST Hermes. Il ne constitue pas une preuve que
Hermes émet toujours `approval.request`, ni un confinement P-SEC/P-OPS.

## Contrat livré

- `approvalRequestId` est dérivé de la séquence monotone du normaliseur (`approval_<sequence>`).
- La table `approval_requests` lie `site_id`, `run_id`, `hermes_run_id` et l’identifiant public, avec
  nonce privé, TTL et états `pending → claimed → resolved` ou `expired`.
- Le POST Console exige `approvalRequestId`; le nonce ne quitte jamais le serveur.
- Le claim persistant et l’audit d’intention précèdent `POST /v1/runs/:id/approval`.
- Une réponse distante ambiguë conserve les claims. Une erreur HTTP définitive libère le claim sans
  déclarer une autorisation réussie. `session` et `always` restent refusés.

## Preuve locale

```sh
bun run proof:g1-004c
bun run --filter server typecheck
bun run --filter console typecheck
```

La suite PostgreSQL utilise l’image `postgres:17.6-alpine` épinglée par digest et vérifie le scope,
le replay, le CAS concurrent, l’expiration, la résolution et la libération après refus définitif.

## Limites non négociables

- `G1-004C-local` ne ferme pas US-G1-004.
- Le runtime Hermes réel peut exécuter une action sans événement d’approbation ; ce slice ne peut pas
  empêcher un tel contournement.
- P-SEC, P-E2E Hermes réel, P-OPS et revue indépendante restent obligatoires.
