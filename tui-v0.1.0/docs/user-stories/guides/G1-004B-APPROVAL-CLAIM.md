# Recette locale — US-G1-004B — claim d’approbation et audit fidèle

Ce slice durcit la frontière applicative de l’approbation humaine sans prétendre remplacer la
policy hors-process exigée par US-G1-004. Une mission `awaiting_approval` est réclamée par un
compare-and-set PostgreSQL avant tout appel Hermes ; une seconde requête ne peut donc pas relayer
une deuxième décision.

## Contrat exécuté

- `claimRunApproval` déplace atomiquement le run de `awaiting_approval` à `running` avec un
  `UPDATE ... WHERE status = 'awaiting_approval' RETURNING` borné au site, au projet mandaté et au
  propriétaire requester éventuel. Un `approval_claim_id` durable identifie le propriétaire.
- L’appel Hermes n’est effectué qu’après un claim non nul.
- Une erreur de résolution runtime ou une réponse Hermes HTTP 4xx libère le claim et écrit une entrée
  `denied` `RUN_APPROVAL_REMOTE_FAILED`; aucune entrée `allowed` n’est créée.
- Une coupure réseau ou une réponse 5xx reste ambiguë : le claim est conservé pour réconciliation et
  l’audit porte `RUN_APPROVAL_REMOTE_UNKNOWN`; aucune seconde décision n’est autorisée.
- `choice: deny` écrit `denied`/`RUN_APPROVAL_DENIED` après le retour Hermes, avec l’état réel
  `running` pendant la réconciliation du run.
- Le service réapplique `assertSiteAction(context, 'run.approve')` même lorsqu’il est appelé sans la
  table de routes HTTP.

## Validation

```sh
bun run proof:g1-004b
bun test apps/server/drizzle/site-role-authorization.integration.test.ts --max-concurrency=1
bun run --filter server typecheck
```

Le test PostgreSQL lance deux approbations concurrentes sur le même run : une seule réponse Hermes
réussit et l’autre reçoit `RUN_NOT_AWAITING_APPROVAL`.

## Limites

Ce slice ne branche pas encore `ReferenceEnforcer` sur le runner/Hermes, ne fournit pas de policy
store ou de clé de confiance persistante, et ne prouve ni P-SEC indépendante ni P-E2E/P-OPS sur une
image Hermes réelle. US-G1-004 et Gate 1 restent donc ouvertes.
