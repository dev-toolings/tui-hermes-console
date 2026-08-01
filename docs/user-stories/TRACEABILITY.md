# Matrice de traçabilité

Cette matrice est l'index de décision. La colonne `Preuve` est renseignée par un lien vers un rapport
daté seulement après exécution ; `—` signifie « non prouvé », pas « non applicable ».

| Story | Exigence PRD | Dépendances | Preuve | État courant |
|---|---|---|---|---|
| US-G0-001 | §13 Gate 0 — trois partenaires | aucune | — | `PROPOSÉE` |
| US-G0-002 | §3.1, §13 — workflow étroit par partenaire | US-G0-001 | — | `PROPOSÉE` |
| US-G0-003 | §13, §15 — métriques et engagement payant | US-G0-002 | — | `PROPOSÉE` |
| US-G1-001 | §9.1, §13 — artefacts persistants | US-G0-003 | — | `PROPOSÉE` |
| US-G1-002 | §9.5, §13 — Hermes pinné et confiné | US-G0-003 | — | `PROPOSÉE` |
| US-G1-003 | §9.5, §13 — avertissement IA | US-G0-003 | — | `PROPOSÉE` |
| US-G1-004 | §9.2, §13 — policy fail-closed | US-G1-002 | — | `PROPOSÉE` |
| US-G1-005 | §8.2, §9.2, §13 — approbation et audit | US-G1-004 | — | `PROPOSÉE` |
| US-G1-006 | §9.1, §13 — rétention, export, backup, restauration | US-G1-001, US-G1-005 | — | `PROPOSÉE` |
| US-G1-007 | §11, §13 — E2E critique | US-G1-001..006 | — | `PROPOSÉE` |
| US-G1-008 | §9.4, §10, §13 — SSH/SFTP réel | US-G1-002 | [diagnostic VPS 31-07-2026](evidence/2026-07-31-gate-1-ssh-vps-diagnostic.md) | `BLOQUÉE` |
| US-G1-SSH-001..009 | §9.4, §10 — recette SSH détaillée | US-G1-008 | [états détaillés](SSH-STORIES.md) | voir chaque story |
| US-G2-001 | §6.3, §8, §13 — site/projet | Gate 1 acceptée | — | `PROPOSÉE` |
| US-G2-002 | §4, §13 — cinq rôles | US-G2-001 | — | `PROPOSÉE` |
| US-G2-003 | §8, §13 — propriété des ressources | US-G2-001, US-G2-002 | — | `PROPOSÉE` |
| US-G2-004 | §13 — séparation MSP/client | US-G2-002, US-G2-003 | — | `PROPOSÉE` |
| US-G2-005 | §13 — policies par ressource | US-G2-002, US-G2-003 | — | `PROPOSÉE` |
| US-G2-006 | §6.3, §13 — identité entreprise qualifiée | US-G2-002 | — | `PROPOSÉE` |
| US-G3-001 | §5.4, §13 — enrôlement court | Gate 2 acceptée | — | `PROPOSÉE` |
| US-G3-002 | §13 — identité, rotation, révocation | US-G3-001 | — | `PROPOSÉE` |
| US-G3-003 | §13 — connexion sortante NAT | US-G3-002 | — | `PROPOSÉE` |
| US-G3-004 | §13 — inventaire et multi-runtime | US-G3-002, US-G3-003 | — | `PROPOSÉE` |
| US-G3-005 | §13 — niveaux de gestion | US-G3-004 | — | `PROPOSÉE` |
| US-G3-006 | §9.5, §13 — lifecycle sans socket Docker | US-G3-005 | — | `PROPOSÉE` |

## Décision d'une Gate

~~~text
┌──────────────────┐
│ Stories vérifiées│
└────────┬─────────┘
         │ rapports datés · tests négatifs
         ▼
┌──────────────────┐
│ Revue de Gate    │
└──────┬───────────┘
       │ verdict signé
       ▼
┌────────────┬────────────┬────────────┐
│ ACCEPTÉE   │ BLOQUÉE   │ REJETÉE   │
└────────────┴────────────┴────────────┘
~~~

Légende : la revue consomme les preuves et émet un seul verdict. Composants : stories, revue,
verdict de Gate.

Le rapport DOIT lister chaque story, son état, son lien de preuve, les dérogations ouvertes et la
décision explicite `GO`, `NO-GO` ou `PIVOT`.
