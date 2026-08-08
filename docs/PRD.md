# PRD — Hermes Console

**Version :** 1.5
**Date :** 06-08-2026
**Statut :** vérité produit auditée — technical preview, non prête pour une offre B2B autonome
**Produit :** console guidée transformant une demande professionnelle en travail logiciel vérifié
**Périmètre actuel :** une installation, plusieurs sites isolés techniquement, plusieurs comptes Google allowlistés ; rôles et ownership sont implémentés localement mais restent non acceptés avant P-E2E/revue
**Runtime de référence :** canal officiel Hermes Agent `latest` / branche `main`, API server sur le
port 8642. Docker résout `:latest` en digest avant l’exécution ; system-wide suit `main` sans
`--commit`. Le digest, le commit et le hash d’installateur observés sont enregistrés après résolution
pour l’audit et le rollback, sans devenir des pins d’entrée. La revue indépendante et le parcours
P-E2E restent ouverts.

> Ce document décrit l’arbre de travail réel au 06-08-2026, y compris les changements non encore
> publiés. Les capacités sont classées en quatre états : **livré**, **validé statiquement**,
> **non validé E2E** et **cible**. Une présence dans le code ne vaut pas preuve de production.
>
> L’historique détaillé des amendements v0.1 à v1.1 a été supprimé. Git reste la source de cet
> historique ; le PRD ne conserve qu’une vérité courante et une direction produit.

---

## 1. Décision produit

Hermes Console n’est ni un WebUI alternatif pour Hermes, ni un cockpit DevOps destiné à exposer les
runtimes, agents et journaux. Hermes reste le moteur. La Console devient la couche produit entre une
intention professionnelle et une livraison logicielle vérifiée.

La direction retenue est :

> **Décrivez le résultat. Validez le plan. Vérifiez la modification.**

La vue normale ne montre pas Git, un shell, un modèle ou un worktree. Elle parle de demande,
compréhension, plan, réalisation, vérification et validation. Les mêmes faits techniques restent
accessibles derrière « Afficher les détails techniques ».

Le socle existant conserve sa valeur : identité, sites, rôles, missions, événements, approbations,
audit, artefacts et connexion Hermes. Il devient l’infrastructure interne d’un workflow plus précis.
La chaîne dépôt, sandbox, branche, tests, CI, preview, diff et proposition de modification est une
cible explicite et ne doit pas être annoncée comme livrée avant preuves.

---

## 2. Positionnement : actuel, cible et refus

| Dimension | Produit actuel | Cible B2B | Refus |
|---|---|---|---|
| Unité métier | Session, mission, résultat, artefact | Tâche guidée, tentatives, preuves et validations | Chat générique |
| Entrée | Instruction libre ou mention d’agent | Intention, résultat attendu, exclusions et exemple | Issue GitHub imposée au métier |
| Contrôle humain | Approbation d’outil dépendante de Hermes | Plan validé, puis validations fonctionnelle et technique distinctes | Validation implicite |
| Exécution | Un Hermes direct ou SSH | Sandbox par tâche, dépôt borné et étapes vérifiables | Shell visible dans la vue normale |
| Livraison | Texte et artefacts Hermes | Diff, tests, preview, proposition de modification et audit | PR présentée comme seul résultat |
| Utilisateurs | Rôles site et ownership locaux | Demandeur, développeur, approbateur et auditeur prouvés E2E | Multi-user sans autorisation |
| Distribution | Web self-hosted et coque Tauri partielle | Connexion projet et runtime assistée, sans `.env` manuel | Promesse « un binaire » non prouvée |

Formulation commerciale à tester :

> **Transformez une demande professionnelle en modification logicielle relisible, vérifiée et
> gouvernée, sans exposer Git, le shell ou le runtime.**

Formulations interdites tant que les preuves manquent :

- « développeur autonome sans supervision » ;
- « toute demande devient automatiquement du code correct » ;
- « GitHub, CI et preview intégrés » avant leur implémentation réelle ;
- « plateforme universelle d’agents » ;
- « observabilité LLM » ;
- « meilleur WebUI Hermes » ;
- « enterprise-ready » ;
- « approbations sécurisées » ;
- « AI Act compliant » ;
- « aucune donnée ne sort » lorsque le modèle appelé est externe.

---

## 3. ICP et job-to-be-done

### 3.1 Wedge prioritaire — binôme métier et développeur

Profil à tester :

- une PME ou agence avec un produit logiciel existant ;
- un demandeur métier capable de décrire le résultat attendu ;
- un développeur disponible pour les décisions techniques sensibles ;
- des changements bornés, vérifiables et réversibles ;
- un besoin de réduire la traduction manuelle entre demande métier et livraison technique.

Job-to-be-done :

> « Je décris ce que je veux obtenir, je valide ce qui sera fait, puis je peux vérifier le résultat
> sans devoir comprendre la mécanique de développement. »

Le premier pilote doit porter sur un seul dépôt non sensible, un changement à faible risque et deux
personnes distinctes pour la validation fonctionnelle et la revue technique. Le RBAC, l’ownership et
la séparation client/MSP existants restent utiles mais ne valent pas encore preuve du nouveau
workflow avant P-E2E.

### 3.2 Segment secondaire — agences et intégrateurs

Équipes opérant plusieurs projets clients et voulant faire participer le demandeur métier sans lui
ouvrir GitHub, le runtime ou le serveur.

### 3.3 Segments à ne pas viser maintenant

- développeurs solos cherchant uniquement un agent de code ou un terminal augmenté ;
- grands comptes exigeant SAML, SCIM, SLA, certifications et séparation multi-environnements ;
- entreprises déjà standardisées sur Microsoft, AWS, Google ou Salesforce ;
- équipes ML cherchant d’abord tracing, datasets et évaluations ;
- automatisations destructrices autonomes ;
- RH, crédit, santé, justice ou autres usages à fort impact.

---

## 4. Problème utilisateur

Hermes est un agent personnel puissant, mais sa propre politique de sécurité le décrit comme
single-tenant : les appelants autorisés d’une même surface ont le même niveau de confiance. Ses
surfaces natives résolvent désormais l’onboarding, le chat, les fichiers et l’administration.

Le problème restant n’est plus « utiliser Hermes sans CLI ». Il est de transformer une demande
souvent ambiguë en contrat de résultat, puis en travail observable sans forcer le métier à devenir
chef de projet Git.

Il faut :

1. guider la formulation par intention et poser les questions adaptées ;
2. figer une compréhension, des exclusions et un plan avant toute exécution ;
3. séparer validation fonctionnelle, validation technique et approbation d’outil ;
4. exécuter dans un périmètre isolé et attribué ;
5. rendre le résultat vérifiable par preuves métier et techniques ;
6. conserver une trace complète sans exposer cette complexité par défaut.

Le premier slice livre les points 1 et 2 et réutilise une partie du point 6. Il ne lance pas encore
Hermes : un test réel a confirmé que le workdir de run borne les artefacts mais pas le `terminal.cwd`
ni les outils de code. L’exécution guidée reste donc fail-closed jusqu’à la sandbox de dépôt. Les
points 3 à 5 restent partiels ou absents.

---

## 5. Principes produit

### 5.1 Tâche avant conversation

La tâche contient la demande, la compréhension, le plan, les tentatives, les preuves et les
validations. Une mission est une tentative d’exécution de cette tâche. La conversation reste un
moyen d’interaction, jamais l’unité métier principale.

### 5.2 Deux profondeurs, une seule vérité

La vue normale ne montre jamais un shell et décrit seulement le résultat, les étapes et la décision
attendue. La vue détaillée ne cache jamais ce qui a réellement été exécuté : modèle, outils,
commandes, fichiers, événements, consommation et limites.

### 5.3 Hermes exécute, la Console gouverne

La Console ne réimplémente ni la boucle agentique, ni les skills, ni la mémoire, ni les modèles de
Hermes. Elle possède la tâche, la spécification, l’autorisation, le ledger et la custody des preuves.

### 5.4 Vérité explicite et installation assistée

Une donnée mesurée est affichée comme telle. Une limite reste visible dans les détails. Une UI
d’approbation qui n’intercepte pas l’action n’est jamais décrite comme une protection. Un Hermes
existant doit pouvoir être connecté avant toute migration, mais l’objectif d’installation reste un
assistant sans édition manuelle de `.env` pour l’utilisateur final.

La Console, Postgres et les artefacts peuvent vivre dans l’infrastructure client, mais les prompts
et résultats sortent de ce périmètre si le modèle est externe. Traces et évaluations seront
exportées vers OpenTelemetry/OpenInference : la Console ne reconstruira pas un outil spécialisé.

### 5.5 Workspace, mobile et adaptateurs de canal

Le workspace durable est une projection de la tâche et du projet : demande, révisions validées,
humains, agents, tentatives, activité lisible, preuves et décisions. La Console reste l'autorité de
ces objets ; elle ne reconstruit pas channels, sous-channels, DMs, voice ou présence.

Le Web mobile fait partie du parcours cœur et doit permettre création, consultation du résultat et
décision à 320 px et sur appareil tactile. Une application native Console n'est pas promise dans le
périmètre actuel.

Telegram et Buzz sont des adaptateurs optionnels de Gate 0 :

- Telegram peut transformer texte, pièce jointe ou vocal en brouillon attribué ; il ne lance jamais
  automatiquement une mission ;
- Buzz peut lier un channel à une tâche, projeter ses événements et faciliter la reprise humaine ;
- aucune réaction, aucun message et aucun agent externe ne peut valider un plan, une action sensible
  ou une livraison sans identité, policy et audit côté Console.

Le parcours cœur reste donc utilisable et testable sans dépendre de la disponibilité ou de la
maturité mobile d'un canal tiers.

---

## 6. État réel du produit

### 6.1 Capacités livrées et validées statiquement

| Surface | État réel |
|---|---|
| Tâche guidée | PostgreSQL, six intentions, projet/dépôt, révisions immuables, plan, risques, tentatives, preuves et décisions attribuées |
| Agents | CRUD PostgreSQL, provider, modèle, reasoning effort, archive/restauration et suppression |
| Sessions | Threads persistés, historique, suppression, source chat ou mission |
| Missions | Un run par message, états, streaming, annulation, retry, inactivité, résultat et usage |
| Événements | Normalisation Hermes, persistance PostgreSQL, curseur, SSE produit, replay |
| Approbations | Détection et réponse quand Hermes émet une demande |
| Artefacts | Entrées/sorties, SHA-256, quotas, chemins durcis, copie privée et miroir SFTP |
| Runtime | Configuration chiffrée, test santé/capabilities, modèles, credentials provider, restart local |
| Distant | Transport direct ou tunnel SSH, clé/agent ou mot de passe, SFTP/scp |
| Connecteurs | Secrets IMAP typés et chiffrés, test de connexion |
| Auth | Google OIDC allowlisté, PKCE, state, nonce, JWKS, sessions opaques et CSRF |
| Setup | Login, connexion/test runtime, création ou saut du premier agent ; le cadrage guidé fonctionne sans agent configuré |
| Clients | SPA Vite/React/TanStack dans le navigateur ; coque Tauri avec sidecar local ; parcours 320 px complet non prouvé |
| Production | Image Bun non-root, migration one-shot, PostgreSQL, Console et Caddy |

### 6.2 Parcours réel

~~~text
┌──────────────────┐
│ Compte allowlisté│
└────────┬─────────┘
         │ Google OIDC · cookie session · CSRF
         ▼
┌──────────────────┐
│ Setup installation│
└────────┬─────────┘
         │ config runtime · test capabilities
         ▼
┌──────────────────┐
│ Tâche guidée     │
└────────┬─────────┘
         │ demande · exclusions · plan validé
         ▼
┌──────────────────┐
│ Mise en attente  │
│ sandbox requise  │
└──────────────────┘
~~~

Légende : chaque flèche porte le protocole ou le type de donnée réellement échangé.
Composants : compte, setup global, tâche guidée et garde fail-closed.

Routes utilisateur principales :

| Route | Fonction |
| /setup | Authentification et mise en service globale |
| / | Redirection vers la création guidée |
| /tasks/new | Intention, demande, résultat attendu, plan et validation avant exécution |
| /tasks/:taskId | Tâche durable, révisions, tentative, preuves et décisions attribuées |
| /overview | Aperçu réel des missions et de l’activité |
| /agents, /agents/new, /agents/:id | Cycle de vie des agents locaux |
| /runs, /runs/new, /runs/:id | Liste, création et suivi des missions |
| /chat, /chat/new, /chat/:id | Surface de sessions persistantes |
| /artifacts | Inventaire des artefacts en base |
| /settings/runtime | Runtime direct ou SSH |
| /settings/models | Provider, modèle et reasoning |
| /settings/connectors | Connecteurs IMAP |
| /settings/security | État de sécurité informatif |
| /settings/retention | Statistiques de stockage, pas une policy de purge complète |

Précisions :

- La mention @agent existe sur /chat/new et crée une mission dédiée.
- Une tâche guidée persiste ses propres tentatives : l’API refuse le lancement avant plan courant,
  approbation d’outil et éventuelle validation technique. Elle gèle dépôt, commit et révision avant
  de créer un worktree Bubblewrap.
- Le brouillon, chaque correction et chaque décision ont une clé d'idempotence et restent repris par
  l'identifiant durable de tâche après fermeture ou rechargement.
- Aucun adaptateur Telegram ou Buzz n'est livré. Le navigateur 320 px est prouvé localement ;
  l'appareil physique et la coupure radio restent ouverts.
- Un thread existant conserve son snapshot d’agent ; il n’a pas de changement d’agent en cours de vie.
- Les commandes de session passent par POST /api/threads/:id/commands.
- /runs/new n’accepte pas encore les pièces jointes. Le composer d’un thread réel accepte du
  multipart après création.
- Les routes run_* de démonstration rejouent encore des fixtures en lecture seule ; elles ne prouvent
  pas le parcours réel thr_*.

### 6.3 Capacités absentes ou non acceptées

- connexion GitHub distante, création de PR, statut CI et déploiement de preview ; le dépôt local,
  la branche/worktree, le diff et la preview textuelle sont livrés ;
- capture ou démonstration visuelle automatisée du logiciel modifié ; les preuves diff/fichiers/tests
  et les captures de la Console existent ;
- matrice de politique sensible configurable par projet ; la matrice produit fixe couvre déjà auth,
  suppression, dépendances, migration, paiements et infrastructure ;
- séparation organisationnelle MSP/client, mandats site/projet et affectations individuelles :
  implémentés côté backend/DB/UI et vérifiés localement, avec snapshot et annulation des runs actifs
  lors d’une révocation ; non acceptés avant P-E2E multi-compte, P-SEC partenaire et revue ; la
  sélection interactive entre plusieurs mandats est implémentée côté backend/DB/UI, mais reste
  non acceptée avant P-E2E multi-compte, P-SEC partenaire et revue ;
- site/projet comme frontière technique : implémenté et vérifié localement, mais non accepté avant Gate 1 ;
- preuve navigateur multi-compte et décision de Gate sur le propriétaire agent/session/mission,
  connecteur ou artefact ;
- rôles admin, operator, requester, approver, auditor : matrice serveur, garde d'installation et
  owner-scoping implémentés et vérifiés localement, mais non acceptés avant P-E2E/revue ;
- OIDC générique, SAML ou SCIM ;
- revue Gate et E2E navigateur du contexte site ;
- policy engine fail-closed sur outils, chemins, connecteurs, modèles ou budget ;
- runtimes multiples, fleet, enrôlement, révocation et rotation ;
- lifecycle distant : provisioning, upgrade, rollback et backup ;
- budgets, quotas de coût, refacturation et alertes ;
- planification/jobs Hermes dans la Console ;
- webhook ou API de service pour déclencher une mission ;
- capture Telegram texte/fichier/vocal vers un brouillon attribué et idempotent ;
- adaptateur Buzz liant workspace/channel, projet et tâche sans déplacer l'autorité de décision ;
- parcours Web mobile complet sur appareil réel avec coupure/reprise réseau ;
- OpenTelemetry/OpenInference, datasets et évaluations ;
- politique de rétention appliquée et restauration testée ;
- E2E navigateur et tests d’intégration runtime/SSH/SFTP ;
- distribution desktop signée et pipeline de mise à jour.

---

## 7. Architecture actuelle

~~~text
╔════════════════════════════╗
║ Clients                    ║
║ Navigateur · Tauri         ║
╚═════════════╤══════════════╝
              │ HTTPS JSON · SSE · cookies
              ▼
╔══════════════════════════════════════════════╗
║ apps/server · Hono sur Bun                   ║
║ Auth · Tasks guidées · Threads · Runs        ║
║ Décisions · Preuves · Runtime · SPA          ║
╚═══════╤══════════════╤═══════════════╤═══════╝
        │ SQL produit  │ HTTP/SSE      │ SSH tunnel · SFTP
        ▼              ▼               ▼
┌──────────────┐  ┌──────────────┐  ┌─────────────────┐
│ PostgreSQL   │  │ Hermes direct│  │ Hermes distant  │
│ source vérité│  │ externe      │  │ externe         │
└──────────────┘  └──────╤───────┘  └────────╤────────┘
                          │ workdir partagé    │ fichiers distants
                          ▼                    ▼
                   ┌──────────────┐     ┌──────────────┐
                   │ Workdir local│     │ Workdir VPS  │
                   └──────────────┘     └──────────────┘

┌──────────────────┐  commit gelé + branche  ┌────────────────────┐  prompt borné  ┌────────────┐
│ Dépôt Git vérifié│ ───────────────────────▶ │ Worktree Bubblewrap│ ──────────────▶ │ Hermes CLI │
└──────────────────┘                          └─────────┬──────────┘                └────────────┘
                                                      │ argv bun/bunx · réseau coupé
                                                      ▼
                                            ┌──────────────────────┐
                                            │ Diff · tests · cleanup│
                                            └──────────┬───────────┘
                                                       │ JSON · SHA-256
                                                       ▼
                                                 ┌──────────────┐
                                                 │ PostgreSQL   │
                                                 └──────────────┘

╔════════════════════════════╗
║ Compose livré              ║
║ Postgres · migrate         ║
║ Console · Caddy            ║
╚═════════════╤══════════════╝
              │ volume files-data + HERMES_CONSOLE_ARTIFACTS_DIR
              ▼
┌──────────────────────────────────────────────┐
│ Artefacts privés : /data/files              │
│ volume persistant · intégrité vérifiée       │
└──────────────────────────────────────────────┘
~~~

Légende : les boîtes doubles regroupent les clients, le control plane et le déploiement Compose ;
les boîtes simples sont des services ou stockages. Chaque flèche est libellée par son flux.
Composants : SPA/Tauri, serveur Hono/Bun, Postgres, runtime direct ou SSH, dépôt Git, sandbox
Bubblewrap, Hermes CLI, preuves et Compose.

### 7.1 Stack

- apps/web : Vite, React 19, TanStack Router, assistant-ui, BoardUI ;
- apps/server : Hono, Bun, Drizzle ORM, PostgreSQL, Zod, ssh2 ;
- packages/console-core : DTO et logique pure partagés ;
- packages/ui : design system ;
- apps/web/src-tauri : shell desktop et sidecar ;
- production : Docker Compose et Caddy.

Le serveur Hono est long-lived. Le runner, la réconciliation et les tunnels ne sont pas compatibles
avec une cible serverless.

### 7.2 Source de vérité

PostgreSQL conserve agents, configuration runtime, comptes/sessions, setup, connecteurs, tâches,
révisions, tentatives, décisions, preuves, threads, runs, messages, événements et métadonnées
d’artefacts. Hermes exécute et ne devient pas la source de
vérité produit.

### 7.3 Protocoles Hermes

Deux modes existent :

- agent, par défaut : /v1/runs, statut, événements SSE, stop, approval et reprise ;
- responses : /v1/responses, streaming mais reprise après redémarrage limitée.

La Console découvre les capacités via /v1/capabilities et ne gate pas sur un numéro de version seul.
L’adapter reste le seul point de couplage au protocole.

---

## 8. Données et autorisation

### 8.1 Modèle actuel

- console_users : identité Google ; les memberships portent les rôles de site et l’organisation
  active, appliqués par la matrice RBAC serveur versionnée ;
- organizations, organization_memberships : affiliations locales client/MSP, distinctes des claims
  Google et sans prétendre qualifier juridiquement une entreprise ;
- msp_mandates, msp_mandate_assignments : délégation coarse au niveau site ou projet, avec fenêtre
  temporelle, révocation et affectation individuelle obligatoire ; aucun outil, chemin, connecteur,
  modèle ou budget n’est évalué ici (G2-005) ;
- console_sessions : token opaque hashé, CSRF, expiration, site actif sélectionné et mandat MSP
  explicitement sélectionné lorsque plusieurs périmètres sont disponibles ;
- sites, projects, site_memberships : frontière technique site/projet ;
- console_setup : état global de l’installation ;
- runtime_config et runtime_model_settings : une configuration globale ;
- agents : identité opérationnelle locale, propriétaire et auteur ;
- threads : session, snapshot d’agent, propriétaire et auteur ;
- runs : mission, owner hérité du thread, auteur de l'action et snapshot du mandat/organisations
  d'autorisation pour les runs MSP ;
- messages et run_events : transcript et trace technique ;
- artifacts : métadonnées de fichiers, owner hérité du run et auteur ;
- connectors : secrets typés, owner/auteur et scope site ;
- audit_ledger_entries : ledger append-only séparé des événements runtime, avec acteur et décision.

### 8.2 Conséquence B2B

Les ressources métier portent désormais un site, éventuellement un projet, un owner et un auteur.
Un requester client ne lit et ne modifie que ses ressources ; un operator MSP doit cumuler RBAC,
affiliation MSP, mandat actif et affectation individuelle ; un approver reste client-scoped.
Le transfert thread est atomique avec runs et artefacts, l'audit append-only snapshotte les deux
organisations et le mandat, et les caches UI changent de namespace par utilisateur/site/contexte.
La P-E2E navigateur et la revue Gate restent à livrer. L'autorité d'installation est désormais
séparée des rôles de site par `INSTALLATION_ADMIN_EMAILS`, avec un fallback strictement mono-admin
quand `GOOGLE_ALLOWED_EMAILS` ne contient qu'une identité. Une
sélection interactive de mandat est maintenant disponible dans la session et le namespace de cache
est borné par utilisateur/site/mandat ; elle reste à prouver en P-E2E et à faire accepter par la
revue. Une révocation snapshotée ferme les nouvelles requêtes et
annule les runs actifs côté Console, y compris au reconciler après redémarrage ; l'arrêt effectif
sur Hermes distant reste à prouver sur une cible réelle. Le filtrage initial des capacités UI est
livré mais non encore prouvé en navigateur, et le provisioning initial MSP reste bootstrap-only.

Le `run_events` actuel reste un ledger technique, distinct du ledger d'audit :

- l'audit append-only existe séparément, avec enveloppes historiques v1 et nouvelles enveloppes v2
  snapshotant organisation cliente, organisation opératrice et mandat ; les policies détaillées
  restent G2-005 ;
- la preuve locale G1-005C applique les migrations de production avec identités owner/runtime
  distinctes, réserve l’append à la fonction contrôlée et refuse au rôle runtime les mutations du
  ledger, de sa tête, de ses triggers et l’accès/usage direct de sa séquence ; le propriétaire DB et
  P-SEC restent ouverts ;
- un export d’audit expurgé est désormais implémenté (`POST /api/audit/exports`) avec vérification
  de chaîne, pseudonymisation et audit de l’export ; il reste non accepté avant P-SEC/P-E2E ;
- une policy de rétention site-wide versionnée, un legal hold, un aperçu de purge dry-run et un
  export métier JSON avec octets d'artefacts vérifiés sont désormais implémentés (G1-006A/B), sans
  suppression ni mutation Hermes ; le vérificateur relationnel local G1-006C valide désormais le
  manifeste site-scoped et les relations sans orphelin, et G1-006E ajoute une purge conditionnée
  locale avec preview single-use, legal hold, audit et quarantaine filesystem ; le backup/
  restauration externe, P-OPS/P-SEC et le rollback opérateur restent à livrer et à prouver ;

Ajouter davantage d’utilisateurs sans modèle d’autorisation élargirait le risque. Le RBAC et
l’attribution précèdent toute croissance multi-user.

---

## 9. Sécurité et blocages

### 9.1 P0 — durabilité des artefacts en production, correctif implémenté

compose.prod.yml et l’image runtime définissent désormais
HERMES_CONSOLE_ARTIFACTS_DIR=/data/files, chemin porté par le volume files-data. Les lectures
vérifient taille et SHA-256 avant réponse, et une absence ou corruption des octets produit une
erreur explicite au lieu d’un succès partiel.

Le défaut de chemin /tmp est donc supprimé. Le harness G1-001 a maintenant exécuté un remplacement
réel du conteneur Console dans un projet Compose isolé : le volume `files-data`, les métadonnées et
les octets vérifiés survivent, tandis que corruption et absence répondent explicitement. Cette preuve
couvre le même hôte et le même volume ; elle ne remplace ni une sauvegarde/restauration, ni une perte
d’hôte, ni l’acceptation P-OPS. La Gate 1 reste donc ouverte.

### 9.2 P0 — approbation non fail-closed

Le parcours d’approbation fonctionne lorsque Hermes émet approval.requested. Les mesures du spike
ont montré qu’une commande classée dangereuse pouvait cependant s’exécuter sans événement.

Donc :

- awaiting_approval est un état UX, pas une frontière de sécurité ;
- l’approbation actuelle ne doit pas être vendue comme contrôle ;
- le runtime doit être confiné au niveau OS ;
- la cible B2B exige une policy appliquée avant l’action sensible à une frontière hors du process
  agent, avec décision signée et auditée.

La politique de sécurité officielle Hermes confirme que l’isolation OS est la frontière réelle et
que les heuristiques in-process, dont l’approbation, ne constituent pas un confinement. Le slice
G1-004C-local persiste désormais l’identité de `approval.request`, consomme un CAS et audite
l’intention avant le relais ; il ne prouve pas que le runtime émet toujours cet événement et ne
remplace donc pas P-SEC/P-E2E.

### 9.3 Authentification livrée, autorisation locale implémentée

Livré :

- Google OIDC Authorization Code avec PKCE S256 ;
- state, nonce, signature RS256/JWKS, issuer, audience, expiration et email vérifié ;
- allowlist d’emails ;
- session opaque de 14 jours, hash en base ;
- cookies HttpOnly/Secure sous HTTPS et CSRF sur les mutations ;
- rate limit mémoire sur les tentatives.

Limites d’authentification et de gouvernance :

- Google uniquement ;
- allowlist configurée en environnement ;
- aucun OIDC générique, SAML ou SCIM : G2-006 reste proposé ;
- P-E2E navigateur, P-SEC partenaire et revue Gate non exécutées ;
- rate limit local au process ;
- pas de MFA policy ni de conditional access géré par la Console ;
- aucun E2E OIDC réel. Un test de tamper a flaké une fois puis les reruns isolé et global ont passé.

### 9.4 SSH

Les deux chemins, binaire SSH et ssh2 par mot de passe, vérifient désormais la clé d’hôte contre les
known_hosts. Le chemin binaire impose aussi `BatchMode`, `IdentitiesOnly` et une identité SSH
déterministe ; le déploiement doit donc fournir le `IdentityFile`/config correspondant en lecture
seule. Les noms distants sont normalisés et les liens/fichiers spéciaux sont refusés.
La synchronisation SFTP applique aussi une garde lexicale au workdir configuré (`852cad0`) avant
`mkdirp`, listing, stat, upload ou download ; cette garde réduit les traversées côté Console mais
ne constitue pas une frontière OS distante.

Pour un Hermes Docker existant, la Console distingue les bind mounts des volumes nommés. Elle ne
réutilise jamais `/var/lib/docker/volumes/.../_data` comme chemin produit. Une migration guidée et
journalisée est disponible uniquement pour le conteneur reconnu `hermes-console-runtime` dans une
topologie bornée : copie intégrale de `/opt/data` vers `/srv/hermes-console/data`, manifestes,
Compose épinglé par digest, preuves runtime/SFTP/Hermes, persistance finale par CAS et rollback
automatique. Les installations personnalisées restent connectables mais suivent le guide manuel.
Une migration active ou ambiguë bloque le démarrage de nouvelles missions et est réconciliée au
redémarrage de la Console.

Restent non prouvés :

- cycle de vie complet forward/close/reconnect ;
- concurrence sous missions longues ;
- interruption lors d’un changement de cible ;
- SFTP et remote-sync contre une machine réelle ;
- restauration après coupure réseau ;
- quotas et capacité disque distants.
- mission réelle et artefact relu après la migration de stockage, sauvegarde externe et revue
  indépendante du rapport P-OPS.

Le mot de passe SSH reste un chemin de compatibilité, pas le chemin recommandé B2B. La cible est une
identité enrôlée, rotative et révocable, sans secret utilisateur longue durée.

### 9.5 Confinement

Avant tout pilote :

- Hermes tourne dans un conteneur ou sandbox au périmètre explicite ;
- aucun socket Docker n’est exposé à l’agent ;
- mounts minimaux et lecture seule par défaut ;
- secrets runtime hors navigateur et transcript ;
- egress et credentials scindés selon le workflow ;
- avertissement explicite que l’utilisateur interagit avec une IA et que des commandes peuvent être
  exécutées. La notice versionnée `2026-08-01.v2` est maintenant reliée sémantiquement à son contrôle
  de consentement ; le manifeste de routes porte explicitement les trois méthodes de démarrage/retry,
  qui refusent l’absence de consentement (`428`).

Cette preuve reste locale : un parcours navigateur/clavier scratch est maintenant exécuté, mais aucun
test lecteur d’écran, consentement Google réel ou verdict indépendant n’est encore accepté.

La Console fournit des éléments de preuve utiles à la conformité ; elle n’est pas « AI Act
compliant » par elle-même.

---

## 10. Déploiement réel

compose.prod.yml livre seulement :

1. PostgreSQL ;
2. une migration one-shot ;
3. la Console SPA + API ;
4. Caddy.

Il ne livre pas Hermes et ne partage aucun volume avec lui. Le runtime est externe :

- direct : URL privée joignable et contrat de workdir partagé à organiser hors du Compose ;
- SSH : tunnel vers une machine distante et miroir SFTP. Le fichier optionnel
  `compose.prod.ssh.yml` monte un dossier SSH dédié en lecture seule à `/home/bun/.ssh` ; il ne
  doit jamais recevoir le `~/.ssh` complet d’un opérateur ni une clé privée suivie par Git.

L’image Console est non-root, read-only, avec tmpfs et no-new-privileges. Caddy termine TLS,
supprime le header Server et flush le SSE.

Le client Tauri existe en développement. La distribution signée, les manifestes de mise à jour et
le pipeline de publication ne sont pas livrés.

---

## 11. Validation et qualité

État mesuré le 31-07-2026 avec Bun :

| Commande | Résultat |
|---|---|
| bun run test | 326 tests verts |
| @console/core | 63 tests, 9 fichiers |
| server | 173 tests, 42 fichiers |
| console | 90 tests, 17 fichiers |
| bun run typecheck | vert |
| bun run lint | vert avec 2 warnings |
| bun run build | vert |

Preuve locale complémentaire : `bun run proof:g1-007a` passe le parcours HTTP post-setup
inter-process, le redémarrage pendant `awaiting_approval`, la reprise après completion et cinq
variantes négatives contre PostgreSQL scratch et Hermes synthétique. Cette preuve ne ferme pas la
P-E2E installation vierge ni Gate 1.

Preuve locale complémentaire G1-005B : `bun run proof:g1-005b` passe l’export d’audit Hono sur
PostgreSQL réel pour deux sites, vérifie hash/trailer et événement d’append, puis refuse rôle,
CSRF, scope injecté, chaîne HMAC altérée et append indisponible sans corps NDJSON. Cette preuve
reste P-INT locale et ne ferme ni la dépendance G1-004, ni P-SEC/P-E2E, ni Gate 1.

Preuve locale complémentaire G1-005C : `bun run proof:g1-005c` passe 3 tests sur PostgreSQL scratch,
sépare owner/runtime, refuse les altérations directes et chemins de contournement avec SQLSTATE
`42501`, puis neutralise un rôle hostile lors d'une mise à niveau sans perdre le ledger historique.
Cette preuve reste P-INT locale ; propriétaire DB, revue indépendante, G1-004, P-SEC/P-E2E et Gate 1
restent ouverts.

Preuve G1-002C/P-OPS : `bun run proof:g1-002c` classe les profils target-contract,
production-reference et root-bootstrap depuis les statuts et UID/GID/workdir effectifs ; la config OCI
reste diagnostique. L’automate distingue `BLOCKED`, décision absente, assertion divergente, sélection
non déployable et `READY`. La campagne épinglée du 04-08-2026 reste historique. Le contrat courant
résout `latest`/`main` à chaque déploiement et doit enregistrer la révision effectivement exécutée.
US-G1-002 est implémentée ; sa revalidation P-OPS, sa revue indépendante et Gate 1 restent ouvertes.

Warnings connus :

- TanStack Table incompatible avec une optimisation du compilateur React ;
- runId non utilisé ;
- dépendance useEffect signalée.

Dette de bundle mesurée :

- chunk principal : 808,30 kB, 248,19 kB gzip ;
- chunk run-screen : 450,56 kB ;
- image de setup : 2,316 MB.

Ce qui n’est pas prouvé :

- aucun E2E navigateur automatisé ;
- aucun parcours Google OIDC contre Google réel ;
- un harness post-setup local G1-007A existe contre un faux Hermes HTTP/SSE, avec PostgreSQL réel,
  cookies/CSRF, CAS/audit, artefact et cinq variantes négatives ; aucun test contre Hermes upstream
  ni aucune P-E2E d’installation vierge ;
- le harness arrête réellement la Console pendant `awaiting_approval`, redémarre sur la même DB et
  les mêmes racines, puis vérifie la conservation de la demande avant le second redémarrage après
  completion ; cela reste une preuve synthétique locale, pas une reprise Hermes upstream ;
- aucun test réel SSH/SFTP/tunnel ;
- aucun build et démarrage de compose.prod.yml rapporté dans cette passe ;
- aucun pilote avec un utilisateur tiers.

Les tests unitaires valident des contrats et décisions, pas l’exploitabilité B2B.

---

## 12. Marché et menace amont

### 12.1 Hermes lui-même

Hermes propose officiellement :

- un dashboard Web pour configuration, API keys, chat et monitoring de sessions ;
- une application desktop macOS, Windows et Linux ;
- onboarding, providers, modèles, outils et credentials ;
- fichiers, projets, remote backends, profils et sessions ;
- une API OpenAI-compatible, Runs API, approvals, jobs et découverte de capacités.

Conséquence : « Hermes sans CLI avec une belle UI » n’est plus une différenciation. La Console doit
se placer au-dessus du runtime individuel : équipes, politique, audit, fleet et preuve de livraison.

Hermes est MIT, ce qui permet intégration et commercialisation, mais augmente le risque
d’absorption fonctionnelle. Un partenariat upstream ou une frontière de contribution claire doit
être exploré.

### 12.2 Plateformes génériques

| Catégorie | État du marché | Décision |
|---|---|---|
| Hyperscalers | Microsoft Foundry, AWS AgentCore et Google couvrent runtime, identité, réseau, monitoring et gouvernance | Ne pas devenir multi-harness générique |
| Agent management | CrewAI AMP couvre déploiement, collaboration, monitoring et scaling | Ne pas vendre « agent management platform » seul |
| Observabilité | LangSmith et Langfuse couvrent traces, evals, RBAC, rétention et audit | Exporter, ne pas reconstruire |
| Builders OSS | Dify et Open WebUI offrent self-hosting, chat et permissions | Ne pas dériver vers un builder/no-code |
| Hermes natif | Desktop/dashboard couvrent la surface individuelle | Viser l’exploitation client et la séparation des rôles |

### 12.3 Signal européen

Les règles de transparence de l’AI Act deviennent applicables à partir du 2 août 2026 et les usages
à haut risque exigent notamment documentation, logs, supervision humaine et robustesse selon leur
calendrier applicable.

C’est un signal de demande pour une preuve opérable. Ce n’est pas une autorisation à revendiquer la
conformité : la classification du cas d’usage, les obligations du fournisseur/déployeur et les
contrôles organisationnels dépassent la Console.

---

## 13. Roadmap B2B à gates

~~~text
╔══════════════════════╗
║ Gate 0 · Parcours    ║
║ demande · résultat ║
╚══════════╤═══════════╝
           │ preuve P-E2E · métier comprend et vérifie
           ▼
╔══════════════════════╗
║ Gate 1 · Livraison   ║
║ sandbox · preuves  ║
╚══════════╤═══════════╝
           │ diff · tests · reprise · contrôle fail-closed
           ▼
╔══════════════════════╗
║ Gate 2 · Validation  ║
║ métier · technique ║
╚══════════╤═══════════╝
           │ décisions sensibles attribuées et auditées
           ▼
╔══════════════════════╗
║ Gate 3 · Qualité     ║
║ coûts · evals       ║
╚══════════════════════╝
~~~

Légende : P-E2E = preuve de bout en bout ; chaque flèche indique le critère de sortie obligatoire.
Composants : parcours guidé, livraison isolée, validations humaines, Edge/Relay, qualité.

### Gate 0 — validation du parcours guidé

- recruter trois PME, agences ou intégrateurs réunissant demandeur métier et développeur ;
- faire formuler une tâche réelle par un demandeur métier sans Git, shell ni agent à configurer ;
- prouver la reformulation, les exclusions, le plan et la validation avant exécution ;
- persister la tâche, son projet, ses révisions et ses tentatives ;
- fournir un résultat que le demandeur peut vérifier sans lire une pull request ;
- prouver création, résultat et décision depuis le Web mobile ;
- déployer ce workflow étroit chez un client par partenaire ;
- rester sur des tâches supervisées et peu risquées ;
- mesurer cadrage, temps jusqu'au résultat vérifiable, taux terminal, corrections, reprises manuelles,
  coût et valeur livrée ;
- obtenir un engagement payant avant la fleet.

La capture Telegram et la projection Buzz sont des expériences optionnelles : leur absence ne bloque
pas la décision Gate 0 tant que le parcours cœur Web est accepté.

### Gate 1 — livraison logicielle sûre

- figer la révision de spécification et le commit de base ;
- isoler chaque tentative dans une sandbox et une branche attribuées ;
- produire diff, tests, fichiers modifiés et preuve métier vérifiable ;
- préparer une proposition de modification sans présenter la PR comme seul résultat ;
- corriger et tester la persistance des artefacts Compose ;
- pinner et confiner Hermes ;
- ajouter un avertissement d’interaction IA et d’exécution de commandes ;
- introduire une policy fail-closed hors process agent ;
- signer et attribuer chaque approbation ;
- journal d’audit append-only séparé des événements runtime ;
- rétention, suppression, export, backup et restauration testés ;
- E2E du parcours critique ;
- tests réels du tunnel et de la synchronisation distante.

### Gate 2 — validations métier et technique

- site/projet comme frontière minimale ;
- rôles admin, operator, requester, approver, auditor ;
- propriété et autorisation sur agents, missions, artefacts et connecteurs (implémentées localement,
  acceptation P-E2E encore requise) ;
- OIDC générique, puis SAML/SCIM seulement sur demande qualifiée ;
- séparation opérateur MSP et client final ;
- validation fonctionnelle du résultat par le demandeur ;
- validation technique séparée pour dépendance, migration, authentification, paiement, infrastructure
  ou suppression de données ;
- mise en attente compréhensible lorsque l’approbateur technique manque ;
- politiques par outil, chemin, connecteur, modèle et budget.

### Edge/Relay et fleet, retiré du périmètre le 08-08-2026

Ce palier promettait enrôlement court, identité mTLS, connexion sortante derrière NAT, inventaire
multi-runtime et niveaux external/connected/managed. Aucune ligne de code n'a été écrite et il
dépendait d'une Gate 2 elle-même non acceptée. Ses six stories sont supprimées, voir la section
« Périmètre supprimé » de [`docs/user-stories/TRACEABILITY.md`](user-stories/TRACEABILITY.md).
L'historique Git conserve leur rédaction si le besoin réapparaît.

Le langage et le packaging de l’Edge ne sont pas décidés dans ce PRD. La preuve du besoin et le
contrat de sécurité précèdent ce choix.

### Gate 3 — qualité et coûts

- export OpenTelemetry/OpenInference ;
- intégration Langfuse, Phoenix, LangSmith ou backend client ;
- version d’agent, instructions, skills, runtime et policy sur chaque mission ;
- jeux de cas de référence et replay ;
- seuils coût, latence, erreur, intervention humaine et réussite métier ;
- promotion de versions avec rollback.

---

## 14. Modèle économique à tester

Le stade actuel appelle une offre accompagnée, pas un self-service :

- design partner : 1 000 à 3 000 EUR/mois, déploiement et support inclus ;
- site managé après Gate 2 : hypothèse 299 à 599 EUR/site/mois, BYO LLM ;
- enterprise : devis annuel seulement après RBAC, audit, SSO, sauvegardes et SLA.

La valeur est l’exploitation sécurisée du site/runtime et le support, pas la revente de tokens.
Ces montants sont des hypothèses de découverte, pas une grille tarifaire approuvée.

---

## 15. Critères d’abandon ou de pivot

Pivoter vers une distribution/intégration upstream Hermes, ou arrêter le produit autonome, si :

1. trois design partners ne paient pas pour la couche d’exploitation après des pilotes réels ;
2. Hermes Desktop/dashboard absorbe la mission, l’audit et les rôles avant que le wedge soit validé ;
3. le contrôle fail-closed exige un fork durable de Hermes impossible à maintenir ;
4. moins de 95 % des missions pilotées atteignent un état terminal cohérent ;
5. la charge support par site rend le prix cible non viable ;
6. les clients demandent principalement tracing/evals ou builder no-code, mieux couverts ailleurs.

La revue se fait après Gate 0. Sans engagement payant, la fleet ne démarre pas.

---

## 16. Sources primaires marché et runtime

Sources consultées le 31-07-2026 :

- [Hermes CLI, dashboard et serve](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/reference/cli-commands.md)
- [Hermes API Server](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/api-server.md)
- [Hermes Desktop](https://github.com/NousResearch/hermes-agent/blob/main/apps/desktop/README.md)
- [Hermes Security Policy](https://github.com/NousResearch/hermes-agent/security)
- [Hermes Agent — licence MIT](https://github.com/NousResearch/hermes-agent)
- [Microsoft Foundry](https://learn.microsoft.com/en-us/azure/foundry/what-is-foundry)
- [AWS Bedrock AgentCore Runtime](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-vs-runtime.html)
- [Google Vertex AI Agent Builder](https://cloud.google.com/agent-builder/agent-engine/manage/monitoring)
- [CrewAI AMP](https://docs.crewai.com/enterprise/introduction)
- [LangSmith Enterprise](https://docs.langchain.com/langsmith/enterprise)
- [Langfuse self-hosted](https://langfuse.com/pricing-self-host)
- [OpenTelemetry GenAI semantic conventions](https://github.com/open-telemetry/semantic-conventions/tree/main/docs/gen-ai)
- [Commission européenne — cadre réglementaire IA](https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai)
- [Règlement européen 2024/1689](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=celex:32024R1689)

Les comparaisons de marché justifient le positionnement ; elles ne prouvent pas à elles seules une
demande. Gate 0 transforme ces inférences en décision commerciale.
