# PRD — Hermes Console

**Version :** 1.3
**Date :** 01-08-2026
**Statut :** vérité produit auditée — technical preview, non prête pour une offre B2B autonome
**Produit :** application self-hosted d’exploitation de missions exécutées par Hermes Agent
**Périmètre actuel :** une installation, plusieurs sites isolés techniquement, plusieurs comptes Google allowlistés ; rôles et ownership sont implémentés localement mais restent non acceptés avant P-E2E/revue
**Runtime de référence :** Hermes Agent v0.19.0, API server sur le port 8642. Toute image upstream
réellement tirée doit être vérifiée par digest et par version avant promotion ; la preuve locale
G1-002B du 01-08-2026 observe `v0.19.1` et reste bloquée tant qu’une décision produit n’a pas
révisé cette référence.

> Ce document décrit l’arbre de travail réel au 31-07-2026, y compris les changements non encore
> publiés. Les capacités sont classées en quatre états : **livré**, **validé statiquement**,
> **non validé E2E** et **cible**. Une présence dans le code ne vaut pas preuve de production.
>
> L’historique détaillé des amendements v0.1 à v1.1 a été supprimé. Git reste la source de cet
> historique ; le PRD ne conserve qu’une vérité courante et une direction produit.

---

## 1. Décision produit

Hermes Console n’est plus positionnée comme « le WebUI professionnel de Hermes » ni comme un
control plane générique d’agents.

Hermes fournit désormais ses propres surfaces Web et desktop, la connexion à des backends distants,
les projets, les profils, les sessions, les fichiers, les modèles, les credentials et le monitoring.
En parallèle, Microsoft Foundry, AWS AgentCore, Google Agent Platform, LangSmith et CrewAI occupent
déjà le terrain des plateformes génériques de runtime, déploiement, identité, observabilité et
gouvernance.

La direction retenue est plus étroite :

> **Hermes Console est la couche d’exploitation et de gouvernance self-hosted pour les équipes qui
> opèrent Hermes sur l’infrastructure d’un client.**

Le wedge initial est une **installation par client ou site**, opérée par une agence d’automatisation,
un intégrateur ou un MSP. La Console transforme des conversations techniques en travail
opérationnel relisible : demande, mission, activité, décision humaine, résultat et artefacts.

Cette promesse est une **cible**. Le produit actuel en prouve une partie technique, mais il lui manque
encore les frontières d’autorisation, l’audit attribué, la durabilité complète et les tests de parcours
nécessaires pour la vendre comme produit B2B.

---

## 2. Positionnement : actuel, cible et refus

| Dimension | Produit actuel | Cible B2B | Refus |
|---|---|---|---|
| Unité métier | Session, mission, résultat, artefact | Mission gouvernée et attribuée | Chat générique |
| Runtime | Un Hermes direct ou SSH | Plusieurs installations clientes enrôlées | Runtime universel day-1 |
| Utilisateurs | Emails Google allowlistés, périmètres client/MSP implémentés localement mais non acceptés | Rôles et périmètres par site/projet prouvés E2E | « Multi-user » sans autorisation |
| Contrôle humain | UI d’approbation dépendante de Hermes | Policy fail-closed avant action sensible | Présenter l’UI actuelle comme barrière |
| Trace | Événements techniques de run | Audit immuable acteur/action/décision | Refaire Langfuse |
| Données | Postgres + fichiers locaux/SFTP | Custody, rétention, export et restauration | Promesse de souveraineté absolue |
| Déploiement | Console Compose, Hermes externe | Appliance par site puis fleet | Hyperscaler agent platform |
| Canaux | Web en autorité, IMAP typé | Transports vers le même modèle de mission | Rebuild Slack, Teams ou email |

Formulation commerciale à tester :

> **Transformez un Hermes installé chez votre client en service opérationnel gouverné : missions,
> artefacts, contrôle humain, audit et supervision, sans exposer le serveur ni le CLI.**

Formulations interdites tant que les preuves manquent :

- « plateforme universelle d’agents » ;
- « observabilité LLM » ;
- « meilleur WebUI Hermes » ;
- « enterprise-ready » ;
- « approbations sécurisées » ;
- « AI Act compliant » ;
- « aucune donnée ne sort » lorsque le modèle appelé est externe.

---

## 3. ICP et job-to-be-done

### 3.1 Wedge prioritaire — agences, intégrateurs et MSP

Profil à tester :

- 3 à 30 opérateurs techniques ;
- 5 à 50 clients PME ;
- un Hermes déployé sur VPS ou infrastructure client ;
- workflows supervisés produisant rapports, analyses ou fichiers ;
- besoin de donner au client une surface contrôlée sans SSH, terminal ni secrets runtime.

Job-to-be-done :

> « Je déploie un agent chez mon client, je contrôle ce qu’il peut faire, et je peux prouver qui a
> demandé quoi, ce qui a été exécuté et ce qui a été livré. »

Une installation par client permet un pilote avant le multi-tenant. Le RBAC, l’ownership et la
séparation client/MSP existent maintenant localement ; ils ne valent pas encore acceptation B2B tant
que la P-E2E multi-compte, la P-SEC partenaire et la Gate 1 ne sont pas clôturées.

### 3.2 Segment secondaire — IT/Ops de PME

PME de 50 à 500 personnes, une à cinq automatisations répétables, données ou fichiers devant rester
sur un VPS/VPC contrôlé, résultats relus par un humain, sans usage à fort impact.

### 3.3 Segments à ne pas viser maintenant

- particuliers et développeurs solos, mieux servis gratuitement par Hermes Desktop/dashboard ;
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

Le problème restant n’est donc plus « utiliser Hermes sans CLI ». Pour une équipe qui opère Hermes
chez un client, il faut :

1. séparer l’opérateur technique, le demandeur, l’approbateur et l’auditeur ;
2. transformer chaque demande en unité de travail avec état et résultat ;
3. appliquer une politique avant l’exécution d’actions sensibles ;
4. conserver une preuve attribuée, exportable et rétentionnée ;
5. superviser plusieurs installations sans ouvrir leurs réseaux ni déplacer leurs fichiers ;
6. attribuer coût, qualité et incidents à une version d’agent et de politique.

Le produit actuel traite correctement le point 2 et une partie du transport/stockage. Les autres
points constituent la roadmap B2B, pas une capacité acquise.

---

## 5. Principes produit

### 5.1 Mission avant conversation

La session facilite l’échange. La mission reste l’unité traçable : instruction, agent figé, modèle,
statut, activité, résultat, consommation et artefacts.

### 5.2 Hermes exécute, la Console gouverne

La Console ne réimplémente ni la boucle agentique, ni les skills, ni la mémoire, ni les modèles de
Hermes. Elle possède l’identité produit, l’autorisation, le ledger de mission et la custody des
artefacts.

### 5.3 Vérité explicite

Une donnée mesurée est affichée comme telle. Une limite du protocole reste visible. Une UI
d’approbation qui n’intercepte pas l’action n’est jamais décrite comme une protection.

### 5.4 Installation existante d’abord

Un Hermes existant doit pouvoir être connecté avant toute migration. Le transport direct couvre les
réseaux joignables ; SSH couvre le pilote distant. Un futur Edge/Relay ne sera introduit qu’après
validation de la demande fleet et avec un contrat d’enrôlement explicite.

La Console, Postgres et les artefacts peuvent vivre dans l’infrastructure client, mais les prompts
et résultats sortent de ce périmètre si le modèle est externe. Traces et évaluations seront
exportées vers OpenTelemetry/OpenInference : la Console ne reconstruira pas un outil spécialisé.

---

## 6. État réel du produit

### 6.1 Capacités livrées et validées statiquement

| Surface | État réel |
|---|---|
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
| Setup | Login, connexion/test runtime, création ou saut du premier agent |
| Clients | SPA Vite/React/TanStack dans le navigateur ; coque Tauri avec sidecar local |
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
│ Agent local      │
└────────┬─────────┘
         │ snapshot agent · modèle · instructions
         ▼
┌──────────────────┐
│ Thread · Mission │
└────────┬─────────┘
         │ HTTP/SSE · instruction · fichiers
         ▼
┌──────────────────┐
│ Hermes externe   │
└────────┬─────────┘
         │ événements · résultat · usage
         ▼
┌──────────────────┐
│ Ledger Console   │
└──────────────────┘
~~~

Légende : chaque flèche porte le protocole ou le type de donnée réellement échangé.
Composants : compte, setup global, agent local, thread/run, runtime Hermes, ledger Postgres.

Routes utilisateur principales :

| Route | Fonction |
|---|---|
| /setup | Authentification et mise en service globale |
| / | Aperçu réel des missions et de l’activité |
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
- Un thread existant conserve son snapshot d’agent ; il n’a pas de changement d’agent en cours de vie.
- Les commandes de session passent par POST /api/threads/:id/commands.
- /runs/new n’accepte pas encore les pièces jointes. Le composer d’un thread réel accepte du
  multipart après création.
- Les routes run_* de démonstration rejouent encore des fixtures en lecture seule ; elles ne prouvent
  pas le parcours réel thr_*.

### 6.3 Capacités absentes

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
║ Auth · Setup · Agents · Threads · Runs       ║
║ Artefacts · Connecteurs · Runtime · SPA      ║
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
Composants : SPA/Tauri, serveur Hono/Bun, Postgres, runtime direct ou SSH, workdirs, Compose.

### 7.1 Stack

- apps/console : Vite, React 19, TanStack Router, assistant-ui, BoardUI ;
- apps/server : Hono, Bun, Drizzle ORM, PostgreSQL, Zod, ssh2 ;
- packages/console-core : DTO et logique pure partagés ;
- packages/ui : design system ;
- apps/console/src-tauri : shell desktop et sidecar ;
- production : Docker Compose et Caddy.

Le serveur Hono est long-lived. Le runner, la réconciliation et les tunnels ne sont pas compatibles
avec une cible serverless.

### 7.2 Source de vérité

PostgreSQL conserve agents, configuration runtime, comptes/sessions, setup, connecteurs, threads,
runs, messages, événements et métadonnées d’artefacts. Hermes exécute et ne devient pas la source de
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
La P-E2E navigateur, la revue Gate et l'autorité `installation_admin` restent à livrer. Une
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

Restent non prouvés :

- cycle de vie complet forward/close/reconnect ;
- concurrence sous missions longues ;
- interruption lors d’un changement de cible ;
- SFTP et remote-sync contre une machine réelle ;
- restauration après coupure réseau ;
- quotas et capacité disque distants.

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
- aucun test d’intégration contre un mock Hermes complet ;
- aucun test de redémarrage prouvant réconciliation et durabilité ;
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
║ Gate 0 · Design      ║
║ partners payants    ║
╚══════════╤═══════════╝
           │ preuve de workflow et volonté de payer
           ▼
╔══════════════════════╗
║ Gate 1 · Sécurité    ║
║ durabilité · policy ║
╚══════════╤═══════════╝
           │ reprise testée et contrôle fail-closed
           ▼
╔══════════════════════╗
║ Gate 2 · Équipe      ║
║ rôles · audit       ║
╚══════════╤═══════════╝
           │ séparation opérateur · client prouvée
           ▼
╔══════════════════════╗
║ Gate 3 · Fleet       ║
║ Edge · Relay        ║
╚══════════╤═══════════╝
           │ enrôlement révocable et multi-runtime
           ▼
╔══════════════════════╗
║ Gate 4 · Qualité     ║
║ coûts · evals       ║
╚══════════════════════╝
~~~

Légende : chaque flèche est un critère de sortie obligatoire ; une gate non franchie bloque la
suivante.
Composants : validation commerciale, sécurité, collaboration, fleet, qualité.

### Gate 0 — validation commerciale

- recruter trois agences ou intégrateurs ;
- déployer un workflow étroit chez un client par partenaire ;
- rester sur des tâches supervisées et peu risquées ;
- mesurer installation, taux terminal, reprises manuelles, coût et valeur livrée ;
- obtenir un engagement payant avant la fleet.

### Gate 1 — contrat d’exploitation

- corriger et tester la persistance des artefacts Compose ;
- pinner et confiner Hermes ;
- ajouter un avertissement d’interaction IA et d’exécution de commandes ;
- introduire une policy fail-closed hors process agent ;
- signer et attribuer chaque approbation ;
- journal d’audit append-only séparé des événements runtime ;
- rétention, suppression, export, backup et restauration testés ;
- E2E du parcours critique ;
- tests réels du tunnel et de la synchronisation distante.

### Gate 2 — équipe et client

- site/projet comme frontière minimale ;
- rôles admin, operator, requester, approver, auditor ;
- propriété et autorisation sur agents, missions, artefacts et connecteurs (implémentées localement,
  acceptation P-E2E encore requise) ;
- OIDC générique, puis SAML/SCIM seulement sur demande qualifiée ;
- séparation opérateur MSP et client final ;
- politiques par outil, chemin, connecteur, modèle et budget.

### Gate 3 — Edge/Relay et fleet

- enrôlement court ;
- identité mTLS, rotation et révocation ;
- connexion sortante pour les sites derrière NAT ;
- heartbeat, capabilities, version et capacité ;
- plusieurs runtimes par organisation ;
- niveaux external, connected et managed explicites ;
- restart, upgrade, rollback et backup uniquement sur runtimes managed ;
- aucun accès direct au socket Docker.

Le langage et le packaging de l’Edge ne sont pas décidés dans ce PRD. La preuve du besoin et le
contrat de sécurité précèdent ce choix.

### Gate 4 — qualité et coûts

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
- fleet MSP après Gate 3 : abonnement control plane + prix par runtime ;
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
