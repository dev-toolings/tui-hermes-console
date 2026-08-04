# Matrice de traçabilité

Cette matrice est l'index de décision. La colonne `Preuve` est renseignée par un lien vers un rapport
daté seulement après exécution ; `—` signifie « non prouvé », pas « non applicable ».

> **Audit de cohérence du 04-08-2026.** Les états ci-dessous ont été confrontés au code, à
> l'historique git et à l'exécution réelle des tests. Six écarts sont consignés dans le
> [registre des incohérences](INCOHERENCES.md), dont deux fonctionnalités livrées sans story
> (`updates`, `skills`) et une preuve de sécurité qui ne passe plus. Lire ce registre avant
> d'accorder du crédit à un état `IMPLÉMENTÉE` ou `VÉRIFIÉE` antérieur au 02-08-2026.

| Story | Exigence PRD | Dépendances | Preuve | État courant |
|---|---|---|---|---|
| US-G0-001 | §13 Gate 0 — trois partenaires | aucune | — | `PROPOSÉE` |
| US-G0-002 | §3.1, §13 — workflow étroit par partenaire | US-G0-001 | — | `PROPOSÉE` |
| US-G0-003 | §13, §15 — métriques et engagement payant | US-G0-002 | — | `PROPOSÉE` |
| US-G1-001 | §9.1, §13 — artefacts persistants | US-G0-003 | [durabilité Compose locale 2026-08-01](evidence/2026-08-01-gate-1-artifact-durability-local.md) | `IMPLÉMENTÉE` — preuve locale, P-OPS production ouverte |
| US-G1-002 | §9.5, §13 — Hermes pinné et confiné | US-G0-003 | [manifeste local G1-002A 2026-08-01](evidence/2026-08-01-gate-1-hermes-confinement-audit.md), [compatibilité image réelle G1-002B 2026-08-01](evidence/2026-08-01-gate-1-hermes-real-image-confinement.md), [matrice candidate G1-002C 2026-08-01](evidence/2026-08-01-gate-1-g1-002c-candidate-matrix.md), [analyse du pin registre 04-08-2026](evidence/2026-08-04-g1-002-registry-pin-analysis.md) | `BLOQUÉE` — matrice préparatoire non promue ; P-SEC/P-OPS/P-E2E ouvertes. Le pin G1-002C est orphelin de tag ; les tags amont sont CalVer et `0.19.0` correspond à `v2026.7.20`, donc la décision version/image est tranchable sans amender le PRD. Décision produit toujours requise |
| US-G1-003 | §9.5, §13 — avertissement IA | US-G0-003 | [P-INT notice IA 2026-08-01](evidence/2026-08-01-gate-1-ai-disclosure-local.md), [P-E2E navigateur 2026-08-01](evidence/2026-08-01-gate-1-ai-disclosure-e2e.md) | `IMPLÉMENTÉE` — revue lecteur d’écran ouverte |
| US-G1-004 | §9.2, §13 — policy fail-closed | US-G1-002 | [enveloppe/enforcer local G1-004A 2026-08-01](evidence/2026-08-01-gate-1-g1-004a-local.md), [claim/audit fidèle G1-004B 2026-08-01](evidence/2026-08-01-gate-1-g1-004b-approval-claim.md), [CAS pré-effet local G1-004C 2026-08-01](evidence/2026-08-01-gate-1-g1-004c-pre-effect-approval.md) | `BLOQUÉE` — G1-004C local livré ; policy OS/approbation Hermes réelle, P-SEC/P-E2E ouvertes |
| US-G1-005 | §8.2, §9.2, §13 — approbation et audit | US-G1-004 | [export audit expurgé 2026-08-01](evidence/2026-08-01-gate-1-audit-export.md), [G1-005B export HTTP/PG 2026-08-01](evidence/2026-08-01-gate-1-g1-005b-audit-export.md), [G1-005C immutabilité PostgreSQL 2026-08-01](evidence/2026-08-01-gate-1-g1-005c-audit-immutability.md), [registre des incohérences 04-08-2026](INCOHERENCES.md) | `BLOQUÉE` au 04-08-2026 — la preuve `proof:g1-005c` échoue : `hermes_releases` et `runtime_update_operations` (migrations 0034/0035) ne sont pas classées. Contrôle fail-closed déclenché et non traité. Dépendance G1-004, P-SEC/P-E2E et revue indépendante restent ouvertes |
| US-G1-006 | §9.1, §13 — rétention, export, backup, restauration | US-G1-001, US-G1-005 | [slice policy/preview 2026-08-01](evidence/2026-08-01-gate-1-lifecycle-preview.md), [export métier 2026-08-01](evidence/2026-08-01-gate-1-lifecycle-export.md), [vérificateur relationnel 2026-08-01](evidence/2026-08-01-gate-1-lifecycle-verifier.md), [business-export scratch 2026-08-01](evidence/2026-08-01-gate-1-lifecycle-business-export-scratch.md), [DR local G1-006D2 2026-08-01](evidence/2026-08-01-gate-1-lifecycle-dr-local.md), [purge conditionnée G1-006E 2026-08-01](evidence/2026-08-01-gate-1-lifecycle-purge.md) | `IMPLÉMENTÉE` (G1-006A/B/C + D-local + D2-local + E-local ; destination externe/DR/P-OPS/P-SEC ouverts) |
| US-G1-007 | §11, §13 — E2E critique | US-G1-001..006 | [slice local G1-007A post-setup 2026-08-01](evidence/2026-08-01-gate-1-g1-007a-post-setup-local.md), [slice G1-007B connectivité runtime 2026-08-02](evidence/2026-08-02-gate-1-hermes-runtime-connectivity.md) | `IMPLÉMENTÉE` localement pour G1-007A/B ; story complète bloquée par P-E2E vierge, navigateur/OIDC, P-SEC et acceptation Gate |
| US-G1-008 | §9.4, §10, §13 — SSH/SFTP réel | US-G1-002 | [connectivité Hermes VPS 02-08-2026](evidence/2026-08-02-gate-1-hermes-runtime-connectivity.md), [diagnostic read-only VPS 187.55.227.55 01-08-2026](evidence/2026-08-01-gate-1-ssh-vps-18755-diagnostic.md), [diagnostic VPS 31-07-2026](evidence/2026-07-31-gate-1-ssh-vps-diagnostic.md) | `BLOQUÉE` — tunnel Hermes prouvé sur cible existante ; compte non-root, SFTP borné, rotation/résilience et P-SEC ouverts. **Reste bloquée pendant toute la durée du gel de `US-G1-SSH-001..009`** |
| US-G1-SSH-001..009 | §9.4, §10 — recette SSH détaillée | US-G1-008 | [états détaillés](SSH-STORIES.md), [décision de gel 04-08-2026](evidence/2026-08-04-ssh-001-gel-decision.md), [garde SFTP locale 006A](evidence/2026-08-01-gate-1-ssh-sftp-006a-local.md), [preuve partielle SSH-001/002 (run auto)](evidence/2026-08-04-ssh-001-002-18755-diagnostic.md) | `BLOQUÉE` — **chaîne gelée le 04-08-2026** faute de VPS vierge ; `US-G1-SSH-001` est la racine, `002..009` en dépendent transitivement. Ne pas relancer de campagne de preuve sans hôte vierge. Critère de dégel dans la décision liée |
| US-G1-SSH-010 | §9.4, §10 — stockage Docker `/opt/data` | US-G1-SSH-005, US-G1-SSH-006 | [migration Docker P-OPS 2026-08-02](evidence/2026-08-02-gate-1-ssh-storage-migration.md) | `VÉRIFIÉE` — cutover P-OPS sur VPS réel avec rollback déclenché puis retry réussi ; hors périmètre du gel, mais acceptation reviewer et dépendances gelées restent ouvertes |
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

## Fonctionnalités livrées hors méthode (constat du 04-08-2026)

Ces capacités sont présentes et fonctionnelles dans l'application, mais aucune story ne les couvre.
Elles n'ont donc ni scénario positif, ni scénario négatif, ni preuve, ni reviewer. Elles ne peuvent
être invoquées dans aucune revue de gate tant qu'une story ne leur est pas rattachée.

| Capacité | Artefacts principaux | Story | Statut |
|---|---|---|---|
| Mises à jour du runtime Hermes | `apps/server/src/modules/updates/`, `/api/runtime/update*`, `/api/updates/hermes`, migrations `0034`/`0035`, nav `/updates` | **aucune** | hors périmètre d'acceptation |
| Administration des skills Hermes | `apps/server/src/api/skills/`, `apps/server/src/modules/runtime/hermes-skills-admin.ts`, `apps/web/src/screens/skills.tsx`, nav `/skills` | **aucune** | hors périmètre d'acceptation |

La fonctionnalité de mises à jour est la cause directe de la régression consignée en INC-01 : ses
migrations ont introduit deux tables non classées qui font tomber la frontière owner/runtime prouvée
par `US-G1-005`. Voir le [registre des incohérences](INCOHERENCES.md).

Aucun identifiant de story n'est attribué ici : décider du périmètre et du contrat de ces capacités
relève du propriétaire produit, pas de la mise à jour documentaire.
