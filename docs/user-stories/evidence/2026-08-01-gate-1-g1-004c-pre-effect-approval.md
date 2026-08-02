# Preuve — G1-004C-local, identité d’approbation et CAS pré-effet

- **Date :** 01-08-2026
- **Story :** US-G1-004C-local, sous-slice de US-G1-004
- **Environnement :** local, Bun, PostgreSQL éphémère pinned `postgres:17.6-alpine`
- **Cible :** faux relais Hermes injecté par dépendances de test
- **Verdict :** `VÉRIFIÉE` pour le slice local ; US-G1-004 et Gate 1 restent `BLOQUÉES`

## Scénarios exécutés

| Scénario | Résultat |
|---|---|
| identité `approval.request` monotone après flush | pass |
| payload UI sans `approvalRequestId` | refusé par schéma strict |
| scope site/run/Hermes/request mismatch | aucun POST distant |
| deux claims PostgreSQL concurrents | un seul claim |
| résolution/rejeu | résolution unique, replay refusé |
| audit intent → POST distant → résolution | ordre vérifié |
| refus HTTP définitif | claim libéré, aucun succès autorisé |
| coupure ambiguë | claim conservé pour réconciliation |

## Commandes et résultats

```text
bun run proof:g1-004c
30 pass, 0 fail, 101 expect() calls

bun run --filter server typecheck
exit 0

bun run --filter web typecheck
exit 0
```

La preuve PostgreSQL dédiée couvre deux tests d’intégration et applique les migrations jusqu’à
`0028_approval_requests`. Aucun secret, token ou contenu client n’est enregistré.

## Écart restant

Le runtime Hermes observé peut ne pas émettre `approval.request`. Cette voie d’exécution reste hors
de la garantie de ce slice ; l’image Hermes compatible, la policy OS, P-SEC/P-OPS et P-E2E réelle
restent à fournir avant l’acceptation de US-G1-004 ou de Gate 1.
