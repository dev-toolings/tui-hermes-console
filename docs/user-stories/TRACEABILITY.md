# Matrice de traçabilité

Cette matrice est l'index de décision. La colonne `Preuve` est renseignée par un lien vers un rapport
daté seulement après exécution ; `—` signifie « non prouvé », pas « non applicable ».

| Story | Exigence PRD | Dépendances | Preuve | État courant |
|---|---|---|---|---|
| US-G0-001 | §13 Gate 0 — trois partenaires | aucune | — | `PROPOSÉE` |
| US-G0-002 | §3.1, §13 — workflow étroit par partenaire | US-G0-001 | — | `PROPOSÉE` |
| US-G0-003 | §13, §15 — métriques et engagement payant | US-G0-002 | — | `PROPOSÉE` |
| US-G1-001 | §9.1, §13 — artefacts persistants | US-G0-003 | [durabilité Compose locale 2026-08-01](evidence/2026-08-01-gate-1-artifact-durability-local.md) | `IMPLÉMENTÉE` — preuve locale, P-OPS production ouverte |
| US-G1-002 | §9.5, §13 — Hermes pinné et confiné | US-G0-003 | [manifeste local G1-002A 2026-08-01](evidence/2026-08-01-gate-1-hermes-confinement-audit.md), [compatibilité image réelle G1-002B 2026-08-01](evidence/2026-08-01-gate-1-hermes-real-image-confinement.md), [matrice candidate G1-002C 2026-08-01](evidence/2026-08-01-gate-1-g1-002c-candidate-matrix.md) | `BLOQUÉE` — matrice préparatoire non promue ; décision d’image/version/identité/workdir et P-SEC/P-OPS/P-E2E ouvertes |
| US-G1-003 | §9.5, §13 — avertissement IA | US-G0-003 | [P-INT notice IA 2026-08-01](evidence/2026-08-01-gate-1-ai-disclosure-local.md), [P-E2E navigateur 2026-08-01](evidence/2026-08-01-gate-1-ai-disclosure-e2e.md) | `IMPLÉMENTÉE` — revue lecteur d’écran ouverte |
| US-G1-004 | §9.2, §13 — policy fail-closed | US-G1-002 | [enveloppe/enforcer local G1-004A 2026-08-01](evidence/2026-08-01-gate-1-g1-004a-local.md), [claim/audit fidèle G1-004B 2026-08-01](evidence/2026-08-01-gate-1-g1-004b-approval-claim.md), [CAS pré-effet local G1-004C 2026-08-01](evidence/2026-08-01-gate-1-g1-004c-pre-effect-approval.md) | `BLOQUÉE` — G1-004C local livré ; policy OS/approbation Hermes réelle, P-SEC/P-E2E ouvertes |
| US-G1-005 | §8.2, §9.2, §13 — approbation et audit | US-G1-004 | [export audit expurgé 2026-08-01](evidence/2026-08-01-gate-1-audit-export.md), [G1-005B export HTTP/PG 2026-08-01](evidence/2026-08-01-gate-1-g1-005b-audit-export.md), [G1-005C immutabilité PostgreSQL 2026-08-01](evidence/2026-08-01-gate-1-g1-005c-audit-immutability.md) | `IMPLÉMENTÉE` localement — G1-005B/C P-INT livrés ; dépendance G1-004, propriétaire DB, P-SEC/P-E2E et revue indépendante ouverts |
| US-G1-006 | §9.1, §13 — rétention, export, backup, restauration | US-G1-001, US-G1-005 | [slice policy/preview 2026-08-01](evidence/2026-08-01-gate-1-lifecycle-preview.md), [export métier 2026-08-01](evidence/2026-08-01-gate-1-lifecycle-export.md), [vérificateur relationnel 2026-08-01](evidence/2026-08-01-gate-1-lifecycle-verifier.md), [business-export scratch 2026-08-01](evidence/2026-08-01-gate-1-lifecycle-business-export-scratch.md), [DR local G1-006D2 2026-08-01](evidence/2026-08-01-gate-1-lifecycle-dr-local.md), [purge conditionnée G1-006E 2026-08-01](evidence/2026-08-01-gate-1-lifecycle-purge.md) | `IMPLÉMENTÉE` (G1-006A/B/C + D-local + D2-local + E-local ; destination externe/DR/P-OPS/P-SEC ouverts) |
| US-G1-007 | §11, §13 — E2E critique | US-G1-001..006 | [slice local G1-007A post-setup 2026-08-01](evidence/2026-08-01-gate-1-g1-007a-post-setup-local.md), [slice G1-007B connectivité runtime 2026-08-02](evidence/2026-08-02-gate-1-hermes-runtime-connectivity.md) | `IMPLÉMENTÉE` localement pour G1-007A/B ; story complète bloquée par P-E2E vierge, navigateur/OIDC, P-SEC et acceptation Gate |
| US-G1-008 | §9.4, §10, §13 — SSH/SFTP réel | US-G1-002 | [connectivité Hermes VPS 02-08-2026](evidence/2026-08-02-gate-1-hermes-runtime-connectivity.md), [diagnostic read-only VPS 187.55.227.55 01-08-2026](evidence/2026-08-01-gate-1-ssh-vps-18755-diagnostic.md), [diagnostic VPS 31-07-2026](evidence/2026-07-31-gate-1-ssh-vps-diagnostic.md) | `BLOQUÉE` — tunnel Hermes prouvé sur cible existante ; compte non-root, SFTP borné, rotation/résilience et P-SEC ouverts |
| US-G1-SSH-001..009 | §9.4, §10 — recette SSH détaillée | US-G1-008 | [états détaillés](SSH-STORIES.md), [garde SFTP locale 006A](evidence/2026-08-01-gate-1-ssh-sftp-006a-local.md) | voir chaque story |
| US-G2-001 | §6.3, §8, §13 — site/projet | Gate 1 acceptée | [preuve site context 2026-08-01](evidence/2026-08-01-gate-2-site-context.md) | `VÉRIFIÉE` |
| US-G2-002 | §4, §13 — cinq rôles | US-G2-001 | [preuve RBAC 2026-08-01](evidence/2026-08-01-gate-2-rbac.md) | `IMPLÉMENTÉE` |
| US-G2-003 | §8, §13 — propriété des ressources | US-G2-001, US-G2-002 | [preuve ownership 2026-08-01](evidence/2026-08-01-gate-2-ownership.md) | `IMPLÉMENTÉE` |
| US-G2-004 | §13 — séparation MSP/client | US-G2-002, US-G2-003 | [preuve MSP/client 2026-08-01](evidence/2026-08-01-gate-2-msp-client.md) | `IMPLÉMENTÉE` |
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
