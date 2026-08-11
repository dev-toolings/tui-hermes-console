# Annexe Inbox paginée et migration `guided.task.create`

- Date : 09-08-2026
- Portée : correction de durcissement `US-G0-INBOX-001` et preuve de la dépendance de capacité
  `guided.task.create`.
- Statut : preuve technique locale ; cette annexe ne modifie ni ne resigne l'acceptation historique
  `US-G0-UX-001` sous DER-001.

## Contrat migré

`GET /api/guided/tasks` est désormais la seule liste Inbox : un résumé paginé, ordonné par
`updatedAt DESC, id DESC`, avec limite bornée, curseur opaque, `hasMore` et `nextCursor`.
La réponse exclut contenu de révision, preuves, sorties Hermes, chemins de dépôt, branches, sandbox,
session, acteurs et clés d'idempotence. Le détail reste sur `GET /api/guided/tasks/:taskId`.

## Rejeux positifs et négatifs

Les commandes suivantes ont été rejouées localement sous Bun :

```text
bun test apps/server/src/modules/auth/site-authorization.test.ts apps/web/src/components/shell/nav-config.test.ts
bun test apps/server/src/api/guided/tasks/route.test.ts apps/server/drizzle/guided-delivery.integration.test.ts
```

- Positif : `requester` possède `guided.task.create` et la navigation expose `/tasks/new` avec cette
  capacité.
- Négatif : `approver` ne possède pas `guided.task.create`; `thread.create` seul n'expose pas
  `/tasks/new`.
- Le test route refuse un curseur Inbox invalide en `400`; le test d'intégration vérifie scope
  site/mandat/requester, tie-break d'horodatage, page suivante et exclusion de la tentative/décision R1.

## Limite

Cette preuve ne constitue ni une acceptation commerciale, ni un P-E2E multi-persona, ni une preuve
de realtime ou d'affectation personnelle.
