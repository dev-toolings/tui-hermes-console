# Matrice de traçabilité

Cette matrice est l'index de décision. La colonne `Preuve` est renseignée par un lien vers un rapport
daté seulement après exécution ; `—` signifie « non prouvé », pas « non applicable ».

> **Audit de cohérence mis à jour le 06-08-2026.** Les états ci-dessous ont été confrontés au code, à
> l'historique git et à l'exécution réelle des tests. Six écarts historiques sont consignés dans le
> [registre des incohérences](INCOHERENCES.md), dont une fonctionnalité encore livrée sans story
> (`skills`) et une preuve de sécurité qui ne passe plus. `updates` est désormais rattachée à
> `US-G1-002D` avec sa preuve locale/Proxmox réelle. Lire ce registre avant
> d'accorder du crédit à un état `IMPLÉMENTÉE` ou `VÉRIFIÉE` antérieur au 02-08-2026. Les stories
> `TASK`, `DELIVERY`, `APPROVAL` et la tranche navigateur `MOBILE` disposent désormais d'une preuve
> locale datée. `CAPTURE` et `BUZZ` restent optionnelles et non implémentées.

> **Révision du 08-08-2026.** Trois changements de gouvernance. Les dépendances de contrat et les
> dépendances de Gate sont désormais séparées, ce qui rend le travail technique de Gate 1 vérifiable
> sans attendre une signature commerciale. Dix stories hors chemin critique passent `GELÉE` :
> `US-G0-CAPTURE-001`, `US-G0-BUZZ-001`, `US-G2-005`, `US-G2-006` et les six stories Gate 3. Quatre
> commits livrés sans story sont consignés en fin de document, dont l'application mobile, gelée.
> La dérogation `DER-001` de [CONVENTIONS.md](CONVENTIONS.md) autorise, jusqu'au 08-11-2026 et pour
> les seules stories Gate 0 sans frontière de sécurité, une acceptation par un implémenteur unique.
> Deux stories sont créées pour régulariser des capacités livrées hors méthode : `US-G1-009`
> (suppression gouvernée d'un artefact) et `US-G1-010` (exception CSRF du jeton porteur). Aucune des
> deux n'est éligible à `DER-001`. Le corpus passe de 44 à 46 stories.

## Deux natures de dépendance

Une **dépendance de contrat** est technique : la story B ne peut pas être implémentée ni vérifiée
tant que A n'existe pas. Elle figure dans le tableau ci-dessous.

Une **dépendance de Gate** est commerciale ou décisionnelle : la story peut être implémentée et
`VÉRIFIÉE` sans elle, mais la Gate ne peut pas être déclarée `GO` tant qu'elle n'est pas levée.
Elle figure dans la section « Dépendances de Gate », jamais dans la colonne `Dépendances de contrat`.

Cette séparation corrige un défaut d'indexation : `US-G1-001`, `US-G1-002` et `US-G1-003` portaient
`US-G0-003` (engagement payant) comme dépendance, ce qui rendait tout le travail technique de Gate 1
inacceptable en attendant une signature commerciale. La contrainte commerciale reste entière, elle
change seulement de place.

| Story | Exigence PRD | Dépendances de contrat | Preuve | État courant |
|---|---|---|---|---|
| US-G0-UX-001 | §4, §5, §6 — demande, compréhension et plan avant exécution | session utilisateur valide et capacité `thread.create` | [preuve guidée E2E 06-08-2026](evidence/2026-08-06-guided-software-delivery.md) | `VÉRIFIÉE LOCALEMENT, NON ACCEPTÉE` — parcours desktop/320 px et persistance prouvés ; reviewer métier ouvert |
| US-G0-UX-002 | §5, §6 — refus sans sandbox après Skip auth | US-G0-UX-001 | [preuve guidée E2E 06-08-2026](evidence/2026-08-06-guided-software-delivery.md) | `VÉRIFIÉE LOCALEMENT, NON ACCEPTÉE` — API historique fail-closed et sandbox positive/négative réelles |
| US-G0-UX-003 | §5, §6 — progression normale et détails techniques | US-G0-UX-002, US-G0-DELIVERY-001 | [preuve guidée E2E 06-08-2026](evidence/2026-08-06-guided-software-delivery.md) | `VÉRIFIÉE LOCALEMENT, NON ACCEPTÉE` — progression activée, vue normale sans shell, détails complets fermés par défaut |
| US-G0-TASK-001 | §5.1, §6.3 — tâche, projet, brouillon, révisions et tentatives | US-G0-UX-001 | [preuve guidée E2E 06-08-2026](evidence/2026-08-06-guided-software-delivery.md) | `VÉRIFIÉE LOCALEMENT, NON ACCEPTÉE` — PostgreSQL, immutabilité, reprise, correction, idempotence et scopes prouvés |
| US-G0-DELIVERY-001 | §2, §4, §6.3 — dépôt, sandbox, diff, tests et preview | US-G0-TASK-001, US-G0-UX-001..002 | [preuve guidée E2E 06-08-2026](evidence/2026-08-06-guided-software-delivery.md) | `VÉRIFIÉE LOCALEMENT, NON ACCEPTÉE` — Git/Bubblewrap/Hermes/diff/tests/artefacts/cleanup réels ; preview déployée absente |
| US-G0-APPROVAL-001 | §2, §4, §6.3 — validations fonctionnelle et technique | US-G0-TASK-001, US-G0-DELIVERY-001 ; fondations RBAC/policy du pilote | [preuve guidée E2E 06-08-2026](evidence/2026-08-06-guided-software-delivery.md) | `IMPLÉMENTÉE, VÉRIFIÉE LOCALEMENT, NON ACCEPTÉE` — quatre décisions distinctes et attribution prouvées ; deux comptes E2E ouverts |
| US-G0-MOBILE-001 | §5.2, §5.4, §6.3 — parcours cœur Web mobile | US-G0-UX-001..003, US-G0-DELIVERY-001, US-G0-APPROVAL-001 | [preuve guidée E2E 06-08-2026](evidence/2026-08-06-guided-software-delivery.md) | `IMPLÉMENTÉE, PARTIELLEMENT VÉRIFIÉE` — 320 px, touch et retry DB prouvés ; appareil réel et coupure radio ouverts |
| US-G0-CAPTURE-001 | §5.5, §6.3 — Telegram vers brouillon attribué | US-G0-TASK-001 | — | `GELÉE` depuis le 08-08-2026 : périmètre suspendu. Retour en `PRÊTE` seulement si le premier `ACCEPTÉE` est obtenu ET qu'un design partner qualifié au titre de `US-G0-001` le demande explicitement. Les deux conditions sont cumulatives ; aucun connecteur Telegram livré |
| US-G0-BUZZ-001 | §5.5, §6.3 — channel Buzz lié à la tâche, Console en autorité | US-G0-TASK-001, US-G0-APPROVAL-001 | — | `GELÉE` depuis le 08-08-2026 : périmètre suspendu. Retour en `PRÊTE` seulement si le premier `ACCEPTÉE` est obtenu ET qu'un design partner qualifié au titre de `US-G0-001` le demande explicitement. Les deux conditions sont cumulatives ; aucun adaptateur Buzz livré |
| US-G0-001 | §3.1, §13 — trois binômes métier/développeur partenaires | aucune | — | `PROPOSÉE` |
| US-G0-002 | §3.1, §13 — modification logicielle étroite par partenaire | US-G0-001, US-G0-TASK-001, US-G0-DELIVERY-001, US-G0-APPROVAL-001, US-G0-MOBILE-001 | — | `PROPOSÉE` |
| US-G0-003 | §13, §15 — métriques de livraison et engagement payant | US-G0-002 | — | `PROPOSÉE` |
| US-G1-001 | §9.1, §13 — artefacts persistants | aucune | [durabilité Compose locale 2026-08-01](evidence/2026-08-01-gate-1-artifact-durability-local.md) | `IMPLÉMENTÉE` — preuve locale, P-OPS production ouverte |
| US-G1-002 | §9.5, §13 — Hermes suivi et confiné | aucune | [manifeste local G1-002A 2026-08-01](evidence/2026-08-01-gate-1-hermes-confinement-audit.md), [compatibilité image réelle G1-002B 2026-08-01](evidence/2026-08-01-gate-1-hermes-real-image-confinement.md), [revalidation `latest`/`main` 04-08-2026](evidence/2026-08-04-g1-002-latest-docker-native.md), [preuve pinnée historique](evidence/2026-08-04-g1-002-docker-native-pops.md) | `IMPLÉMENTÉE` avec preuve technique verte — `READY/0`, Docker et system-wide idempotents sans pin d’entrée, révision observée pour preuve/rollback, admin/service séparés. Revue indépendante et P-E2E ouverts avant `VÉRIFIÉE` |
| US-G1-002D | §9.5, §10, §13 — mise à jour locale, system-wide et Docker depuis `/updates` | US-G1-002 | [rejeu réel local + Proxmox 210 04-08-2026](evidence/2026-08-04-g1-002-latest-docker-native.md) | `IMPLÉMENTÉE` — local `~/.hermes`, update UI system-wide et Docker, santé 200, rollback/privileges bornés et idempotence prouvés techniquement. Revue indépendante et P-E2E opérateur 2 ouverts |
| US-G1-003 | §9.5, §13 — avertissement IA | aucune | [P-INT notice IA 2026-08-01](evidence/2026-08-01-gate-1-ai-disclosure-local.md), [P-E2E navigateur 2026-08-01](evidence/2026-08-01-gate-1-ai-disclosure-e2e.md) | `IMPLÉMENTÉE` — revue lecteur d’écran ouverte |
| US-G1-004 | §9.2, §13 — policy fail-closed | US-G1-002 | [G1-004A local](evidence/2026-08-01-gate-1-g1-004a-local.md), [G1-004B claim/audit](evidence/2026-08-01-gate-1-g1-004b-approval-claim.md), [G1-004C CAS](evidence/2026-08-01-gate-1-g1-004c-pre-effect-approval.md), [G1-004D relais Hermes](guides/G1-004D-HERMES-PRE-EFFECT.md), [P-E2E Hermes local](evidence/2026-08-04-g1-004-hermes-local-p-e2e.md), [route Console réelle](evidence/2026-08-04-g1-004-real-console-local.md), [préflight Hermes PVE 210](evidence/2026-08-04-g1-004-hermes-runtime-preflight.md), [rejeu P-E2E réel VM 210 avec provider 04-08-2026](evidence/2026-08-04-g1-004-pve210.md) | `IMPLÉMENTÉE` techniquement. Route Console/PostgreSQL/policy/adaptateur et reprise locale prouvés. **Correction du 08-08-2026 :** le P-E2E VM 210 n'est plus bloqué par le provider. Le rejeu du 04-08-2026 documente `openai-api`/`gpt-5.4-nano` authentifié sur la VM 210, avec positif, négatif et recovery au vert. Cette preuve était orpheline et l'état affichait à tort un blocage levé. P-SEC, revue indépendante et rejeu opérateur 2 restent ouverts, et `DER-001` ne couvre pas cette story |
| US-G1-005 | §8.2, §9.2, §13 — approbation et audit | US-G1-004 | [export audit expurgé 2026-08-01](evidence/2026-08-01-gate-1-audit-export.md), [G1-005B export HTTP/PG 2026-08-01](evidence/2026-08-01-gate-1-g1-005b-audit-export.md), [G1-005C immutabilité PostgreSQL 2026-08-01](evidence/2026-08-01-gate-1-g1-005c-audit-immutability.md), [rejeu G1-005C 04-08-2026](evidence/2026-08-04-g1-005c-replay.md) | `IMPLÉMENTÉE` — classification corrigée et 3/3 tests G1-005C passés. Dépendance G1-004, P-SEC/P-E2E, revue indépendante et acceptation Gate 1 restent ouvertes |
| US-G1-006 | §9.1, §13 — rétention, export, backup, restauration | US-G1-001, US-G1-005 | [slice policy/preview 2026-08-01](evidence/2026-08-01-gate-1-lifecycle-preview.md), [export métier 2026-08-01](evidence/2026-08-01-gate-1-lifecycle-export.md), [vérificateur relationnel 2026-08-01](evidence/2026-08-01-gate-1-lifecycle-verifier.md), [business-export scratch 2026-08-01](evidence/2026-08-01-gate-1-lifecycle-business-export-scratch.md), [DR local G1-006D2 2026-08-01](evidence/2026-08-01-gate-1-lifecycle-dr-local.md), [purge conditionnée G1-006E 2026-08-01](evidence/2026-08-01-gate-1-lifecycle-purge.md) | `IMPLÉMENTÉE` (G1-006A/B/C + D-local + D2-local + E-local ; destination externe/DR/P-OPS/P-SEC ouverts) |
| US-G1-007 | §11, §13 — E2E critique | US-G1-001..006 | [slice local G1-007A post-setup 2026-08-01](evidence/2026-08-01-gate-1-g1-007a-post-setup-local.md), [slice G1-007B connectivité runtime 2026-08-02](evidence/2026-08-02-gate-1-hermes-runtime-connectivity.md) | `IMPLÉMENTÉE` localement pour G1-007A/B ; story complète bloquée par P-E2E vierge, navigateur/OIDC, P-SEC et acceptation Gate |
| US-G1-008 | §9.4, §10, §13 — SSH réel, SFTP gelé | US-G1-002 | [connectivité Hermes VPS 02-08-2026](evidence/2026-08-02-gate-1-hermes-runtime-connectivity.md), [VM vierge 04-08-2026](evidence/2026-08-04-ssh-003-005-hermes-ephemeral-01.md) | `BLOQUÉE` sur le sous-périmètre SSH — tunnel, séparation des comptes, empreintes et rotation restent à accepter. SFTP est explicitement `GELÉE` et non bloquante |
| US-G1-009 | §9.1, §13 — suppression gouvernée d'un artefact | US-G1-006 | [test d'intégration legal hold 08-08-2026](../../apps/server/drizzle/artifact-deletion-legal-hold.integration.test.ts) | `IMPLÉMENTÉE`, preuves incomplètes. Livrée hors méthode par `34f6fa3`, régularisée le 08-08-2026. Garde de rétention légale ajoutée et prouvée par mutation, refus désormais audité. `P-SEC` rôle refusé au niveau HTTP, restauration après erreur forcée et refus run actif contre base réelle restent ouverts. Non éligible à `DER-001` |
| US-G1-010 | §9.4, §13 — borner l'exception CSRF du jeton porteur | aucune | — | `IMPLÉMENTÉE`, non vérifiée. Livrée hors méthode par `3392d9f`. Aucun test ne couvre la garde d'`index.ts:124`, seul le parseur est testé. `P-SEC` obligatoire avant toute vérification. Non éligible à `DER-001` |
| US-G1-SSH-001..005,008 | §9.4, §10 — bootstrap, confiance, tunnel et identité SSH | US-G1-008 | [états détaillés](SSH-STORIES.md), [VM vierge Terraform/Ansible 04-08-2026](evidence/2026-08-04-ssh-003-005-hermes-ephemeral-01.md), [preuve latest/main et SSH-005](evidence/2026-08-04-g1-002-latest-docker-native.md), [preuve SSH-001/002](evidence/2026-08-04-ssh-001-002-hermes-ephemeral-01.md), [preuve SSH-008](evidence/2026-08-04-ssh-008-hermes-ephemeral-01.md) | `TECHNIQUEMENT VÉRIFIÉE` — SSH-008 rotation/révocation prouvée ; revue indépendante et opérateur 2 restent ouverts |
| US-G1-SSH-006/007/009 | §9.4, §10 — transferts SFTP et E2E fichiers | US-G1-008 | [garde SFTP locale 006A historique](evidence/2026-08-01-gate-1-ssh-sftp-006a-local.md) | `GELÉE` — SFTP explicitement hors périmètre produit ; aucune implémentation, preuve P-E2E ou recette n'est demandée dans cette phase |
| US-G1-SSH-010 | §9.4, §10 — stockage Docker `/opt/data` sans transfert SFTP | US-G1-SSH-005 | [migration Docker P-OPS 2026-08-02](evidence/2026-08-02-gate-1-ssh-storage-migration.md) | `VÉRIFIÉE` techniquement pour le cutover P-OPS ; preuve SFTP retirée du contrat courant, acceptation reviewer restante |
| US-G2-001 | §6.3, §8, §13 — site/projet | aucune ; « Gate 1 acceptée » est une dépendance de Gate | [preuve site context 2026-08-01](evidence/2026-08-01-gate-2-site-context.md) | `VÉRIFIÉE` |
| US-G2-002 | §4, §13 — cinq rôles | US-G2-001 | [preuve RBAC 2026-08-01](evidence/2026-08-01-gate-2-rbac.md) | `IMPLÉMENTÉE` |
| US-G2-003 | §8, §13 — propriété des tâches, révisions, missions, preuves, validations et connecteurs | US-G2-001, US-G2-002 | [preuve ownership 2026-08-01](evidence/2026-08-01-gate-2-ownership.md), [preuve guidée 06-08-2026](evidence/2026-08-06-guided-software-delivery.md) | `IMPLÉMENTÉE` — ownership guidé et scopes site/projet ajoutés ; revue multi-compte ouverte |
| US-G2-004 | §13 — séparation MSP/client sur une même tâche et ses tentatives | US-G2-002, US-G2-003 | [preuve MSP/client 2026-08-01](evidence/2026-08-01-gate-2-msp-client.md), [refus guidé cross-site 06-08-2026](evidence/2026-08-06-guided-software-delivery.md) | `IMPLÉMENTÉE` techniquement ; E2E MSP/client sur le nouveau parcours encore ouvert |
| US-G2-005 | §6.3, §13 — policies par ressource et type de changement | US-G2-002, US-G2-003 | — | `GELÉE` depuis le 08-08-2026 : périmètre suspendu. Retour en `PRÊTE` seulement si le premier `ACCEPTÉE` est obtenu ET qu'un design partner qualifié au titre de `US-G0-001` le demande explicitement. Les deux conditions sont cumulatives |
| US-G2-006 | §6.3, §13 — identité entreprise qualifiée | US-G2-002 | — | `GELÉE` depuis le 08-08-2026 : périmètre suspendu. Retour en `PRÊTE` seulement si le premier `ACCEPTÉE` est obtenu ET qu'un design partner qualifié au titre de `US-G0-001` le demande explicitement. Les deux conditions sont cumulatives |
| US-G3-001 | §5.4, §13 — enrôlement court | aucune ; « Gate 2 acceptée » est une dépendance de Gate | — | `GELÉE` depuis le 08-08-2026 : périmètre suspendu. Retour en `PRÊTE` seulement si Gate 2 est déclarée `GO`, ce qui est la seule condition atteignable pour ce périmètre ; un design partner pilote un dépôt et ne demandera pas de fleet management |
| US-G3-002 | §13 — identité, rotation, révocation | US-G3-001 | — | `GELÉE` depuis le 08-08-2026 : périmètre suspendu. Retour en `PRÊTE` seulement si Gate 2 est déclarée `GO`, ce qui est la seule condition atteignable pour ce périmètre ; un design partner pilote un dépôt et ne demandera pas de fleet management |
| US-G3-003 | §13 — connexion sortante NAT | US-G3-002 | — | `GELÉE` depuis le 08-08-2026 : périmètre suspendu. Retour en `PRÊTE` seulement si Gate 2 est déclarée `GO`, ce qui est la seule condition atteignable pour ce périmètre ; un design partner pilote un dépôt et ne demandera pas de fleet management |
| US-G3-004 | §13 — inventaire et multi-runtime | US-G3-002, US-G3-003 | — | `GELÉE` depuis le 08-08-2026 : périmètre suspendu. Retour en `PRÊTE` seulement si Gate 2 est déclarée `GO`, ce qui est la seule condition atteignable pour ce périmètre ; un design partner pilote un dépôt et ne demandera pas de fleet management |
| US-G3-005 | §13 — niveaux de gestion | US-G3-004 | — | `GELÉE` depuis le 08-08-2026 : périmètre suspendu. Retour en `PRÊTE` seulement si Gate 2 est déclarée `GO`, ce qui est la seule condition atteignable pour ce périmètre ; un design partner pilote un dépôt et ne demandera pas de fleet management |
| US-G3-006 | §9.5, §13 — lifecycle sans socket Docker | US-G3-005 | — | `GELÉE` depuis le 08-08-2026 : périmètre suspendu. Retour en `PRÊTE` seulement si Gate 2 est déclarée `GO`, ce qui est la seule condition atteignable pour ce périmètre ; un design partner pilote un dépôt et ne demandera pas de fleet management |

## Dépendances de Gate

Ces conditions n'empêchent aucune implémentation ni aucune vérification. Elles conditionnent
uniquement le verdict `GO` d'une Gate.

| Gate | Condition de `GO` | État de la condition |
|---|---|---|
| Gate 0 | `US-G0-001` produit trois binômes partenaires qualifiés, `US-G0-002` un workflow étroit par partenaire, `US-G0-003` des métriques et un engagement payant | `PROPOSÉE`, aucune action commerciale engagée au 08-08-2026 |
| Gate 1 | Gate 0 déclarée `GO`, plus revue indépendante des stories portant une frontière de sécurité (`US-G1-002`, `US-G1-004`, `US-G1-005`, `US-G1-SSH-*`) | non levée ; `DER-001` ne couvre pas ces stories |
| Gate 2 | Gate 1 déclarée `GO` | non levée |
| Gate 3 | Gate 2 déclarée `GO` | non levée ; toutes les stories Gate 3 sont `GELÉE` |

`US-G0-001` est la seule condition qui ne dépend techniquement de rien et qui peut démarrer
immédiatement. Elle est aussi la seule qui porte une information sur la survie du produit.

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

## Fonctionnalités livrées hors méthode restant à rattacher

`updates` est maintenant rattachée à `US-G1-002D` et peut être examinée dans Gate 1 sur la base de
sa preuve datée. `skills` reste la seule capacité identifiée ici sans story, scénario, preuve ni
reviewer.

| Capacité | Artefacts principaux | Story | Statut |
|---|---|---|---|
| Administration des skills Hermes | `apps/server/src/api/skills/`, `apps/server/src/modules/runtime/hermes-skills-admin.ts`, `apps/web/src/screens/skills.tsx`, nav `/skills` | **aucune** | hors périmètre d'acceptation |
| Application mobile native Expo | `apps/mobile/`, migration `0038_mobile_pairing.sql`, `apps/web/src/components/settings/mobile-device-pairing.tsx` | **aucune** | `GELÉE` le 08-08-2026. `docs/PRD.md` §5.5 ne promet aucune application native ; ce périmètre n'a été ni demandé ni engagé. Le code reste dans l'arbre, il compile et son `node_modules` reste monté dans le sandbox guidé. Retour en `PRÊTE` seulement si le premier `ACCEPTÉE` est obtenu ET qu'un design partner qualifié au titre de `US-G0-001` le demande. **Le gel ne couvre pas la surface serveur de la ligne suivante** |
| Session par jeton porteur et contournement de garde CSRF | `apps/server/src/modules/auth/service.ts:857`, `apps/server/src/index.ts:124`, `apps/server/src/api/auth/mobile/route.ts` | `US-G1-010` | **Non gelable.** Livrée dans le même commit que l'app mobile, mais applicable à 100 % des mutations `/api/*` : présenter un en-tête `Authorization` désactive `assertSameOriginMutation` et `assertCsrf`. Le seul test livré couvre le parseur, pas la garde. Geler `apps/mobile` ne suspend pas cette surface, qui reste active. Exige un `P-SEC` et un reviewer sécurité, et n'est pas éligible à `DER-001` |

### Commits sans entrée de traçabilité

Quatre commits fonctionnels ont été livrés sans story, sans preuve et sans reviewer. Ils sont
consignés ici pour que l'écart soit auditable, pas pour être régularisés rétroactivement à bon
compte. Le rattachement définitif est une décision de périmètre du propriétaire produit.

| Commit | Objet réel, lu dans le diff | Rattachement | Décision |
|---|---|---|---|
| `3392d9f` (a) | Spike application mobile Expo | aucun, périmètre non demandé | `GELÉE` |
| `3392d9f` (b) | Session par jeton porteur et bascule de la garde CSRF/same-origin sur toutes les routes | `US-G1-010` | story de sécurité obligatoire, `P-SEC` exigé. Le rattachement initial « aucun, périmètre non demandé » était **faux** : vrai de `apps/mobile/`, faux du commit |
| `c69194b` | Ancrage des tours de conversation : `use-live-thread.ts`, `xulux-chat/thread.tsx`, `thread-messages.ts` | `US-G0-UX-003` | confirmé par le diff. **Conséquence :** ce commit est du 07-08 et la preuve visée du 06-08, donc la preuve est antérieure au code courant |
| `abd52ce` | Aperçu de fichier (`file-preview-dialog.tsx`, 232 lignes neuves), pièces jointes, `runtime/config.ts`, `setup/api-access.ts`, `artifacts/remote-sync`, typage `upload(..., mode?)` dans 5 fichiers SSH. L'intitulé « update chat » ne décrit pas le contenu | **aucun rattachement retenu** | Le rattachement à `US-G1-002D` proposé le 08-08 était infondé : aucun fichier `modules/runtime/update*` n'apparaît dans le diff, la proposition venait du message de commit et non du contenu. À découper. **Point dur :** le volet SSH modifie du code déclaré `GELÉE` (`US-G1-SSH-006/007/009`) ; un gel qui n'empêche pas de modifier le code gelé n'est pas un gel |
| `34f6fa3` | Suppression gouvernée d'un artefact : soft delete, quarantaine restaurable, purge SFTP distante, audit `artifact.delete`, bump de `SITE_ROLE_MATRIX_VERSION` | `US-G1-009`, rattachée au périmètre de `US-G1-006` | Mutation destructive, donc intégralement sous le § « Pour toute mutation sensible ». **Régression corrigée le 08-08-2026 :** la suppression ne consultait pas la rétention légale, alors que `GATE-1-CONTRAT-EXPLOITATION.md:210` l'exige et que la purge l'applique déjà (`retention/service.ts:225`). Garde ajoutée, preuve d'intégration en cours |

Les preuves de Gate 0 datent du 06-08-2026 et trois de ces commits sont postérieurs. La mesure 2 de
`DER-001`, qui impose de rejouer la preuve à la date de l'acceptation, n'est donc pas une formalité
administrative : sans elle, l'acceptation porterait sur un état du code qui n'existe plus.

Ces quatre commits constituent le contre-exemple le plus sérieux à la méthode : elle a été
contournée quatre fois de suite par son propre auteur. Si le fait se reproduit après la première
acceptation, la conclusion à tirer n'est pas un manque de discipline mais une exigence inapplicable,
à automatiser par un hook de commit ou à supprimer.

La fonctionnalité de mises à jour a été la cause directe de la régression INC-01 ; ses deux tables
sont maintenant classées dans la frontière owner/runtime et sa story est tracée. Voir le [registre des
incohérences](INCOHERENCES.md) pour l'historique.

Le propriétaire produit doit encore décider du périmètre de `skills` ; cette décision est indépendante
de l'acceptation de `US-G1-002D`.
