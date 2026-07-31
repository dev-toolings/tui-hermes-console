# PRD — Hermes Console Core

**Version :** 0.9
**Statut :** Référence — Runtime distant (tunnel SSH) + mentions d'agent — 30-07-2026
**Type de produit :** Application web self-hosted — couche d’exploitation agentique
**Cible initiale :** Mono-utilisateur, mono-runtime Hermes (socle) ; surfaces et runtimes extensibles
**Runtime validé :** Hermes Agent v0.19.0, API server `:8642`

> **Amendement v0.9 — Runtime distant (tunnel SSH) + mentions d'agent.** Le runtime n'est plus
> nécessairement joignable en direct : un second transport ouvre un tunnel SSH vers un Hermes
> distant et miroite les artefacts par SFTP. Côté chat, l'agent s'invoque par mention et les
> commandes de session passent par une route serveur dédiée.
>
> | # | Livré | Surface |
> |---|---|---|
> | 1 | Transport runtime `direct` \| `ssh` persisté (`transport`, `ssh_*`, `remote_workdir`) | migrations `0008` / `0009` |
> | 2 | Tunnel `-L` par clé/agent via le binaire `ssh` (ControlMaster + ControlPersist) | `/settings/runtime` |
> | 3 | Tunnel par mot de passe via `ssh2` (repli tout-JS — le binaire `ssh` ne prend pas de mot de passe sans TTY) | idem |
> | 4 | Second secret chiffré AES-256-GCM : `encrypted_ssh_password`, jamais renvoyé (`sshPasswordConfigured`) | DTO runtime public |
> | 5 | `GET /api/runtime/ssh-hosts` — alias `~/.ssh/config` en lecture seule (`Include`, profondeur 5) | `<datalist>` du formulaire |
> | 6 | Miroir SFTP/scp des artefacts : push `in/` avant le run, pull `out/` à la complétion | `remote_workdir` |
> | 7 | 11 codes d'erreur SSH métier (`SSH_AGENT_NO_KEY`, `SSH_FORWARDING_DISABLED`, `SSH_HOST_KEY_UNKNOWN`…) | messages actionnables |
> | 8 | Garde-fous tunnel : gestion locale Hermes refusée, URL distante `https` refusée | `SSH_REMOTE_URL_UNSUPPORTED` |
> | 9 | Mention `@<slug> <instruction>` → mission `/runs` dédiée (`agentRef` sur `POST /api/threads`) | brouillon `/chat/new` **uniquement** |
> | 10 | `POST /api/threads/:threadId/commands` + `/help`, `/commands`, `/connector status` | control-plane des missions |
> | 11 | Invariant « aucun agent dans une session `/chat` » (`AGENT_IN_CHAT`, double garde client + serveur) | `/agent*` refusé en chat |
> | 12 | Coque `/chat` persistante : layout dédié, cache LRU de 20 snapshots, prefetch au survol | `/chat`, `/chat/new`, `/chat/:id` |
> | 13 | Streaming inline `POST …/messages?stream=1` → `text/event-stream` + réconciliation par curseur | fil live |
> | 14 | `Makefile` (setup, dev, check, db, runtime) + `apps/web/.env.example` | entrée unique de la DX |
>
> **Hors périmètre v0.9 :** Edge Gateway et enrôlement distant ; runtimes multiples ; redémarrage,
> upgrade et backup d'un runtime distant ; écriture dans `~/.ssh/config` ; pièces jointes à la
> création d'un thread ; autocomplétion `@` et palette de commandes ; mention de fichier (`@fichier`
> n'existe pas — les fichiers passent par les pièces jointes, §16).
>
> **Non-régressions / dettes ouvertes :** aucune authentification (toutes les routes API sont
> anonymes, `/setup` reste une maquette, §17) ; `POST /api/runtime/test` et `PUT /api/runtime` sans
> garde d'origine, avec réutilisation d'un secret stocké vers une cible fournie par l'appelant ;
> `ssh2` connecté sans vérification de clé d'hôte, contrairement au chemin `agent` qui, lui, mappe
> `SSH_HOST_KEY_UNKNOWN` ; `forward()` sans sérialisation et canal unique fermé dès que l'empreinte
> change — une mission en cours peut perdre son tunnel ; sessions SFTP `ssh2` jamais fermées ; noms
> rapatriés de `out/` distant non passés par `sanitizeFilename` / `assertWithinDir` ; composer de
> `/chat/:id` dont le placeholder annonce « @ to mention » alors que `useAgentMention` n'y est pas
> branché (seul `/chat/new` l'utilise) ; reprise,
> annulation hors process et clôture d'orphelin en collision `UNIQUE(run_id, sequence)` ; aucun
> quota sur les sorties ; aucun test du cycle de vie du tunnel ni de la synchronisation distante.

> **Amendement v0.8 — Sessions + Connectors.**
>
> | # | Livré | Surface |
> |---|---|---|
> | 1 | Routes `/chat/session`, `/chat/session/:id` ; redirect `/runs/*` | nav « Sessions » |
> | 2 | Slash commands session : `/agent create\|edit\|show\|switch`, `/model` | control-plane dans le chat |
> | 3 | Table `connectors` + `GET\|PUT\|DELETE /api/connectors/:type` + test IMAP | `/settings/connectors` |
> | 4 | Banner session si connecteur requis manquant | deep-link Settings |
>
> **Hors périmètre v0.8 :** éditeur `.env` Hermes libre ; sync auto vers Himalaya host ; cron UI.
>
> **Modèle :** Session = `threads` (workspace) ; Mission = `run` ; Connector = secret typé chiffré.
>
> **Amendement v0.7, prioritaire — état d’implémentation.** Le socle d’exploitation est branché
> au-delà du CRUD : robustesse d’exécution (Phase 3) et pipeline fichiers partagé (Phase 4 slice).
>
> | # | Livré 30-07-2026 | Surface |
> |---|---|---|
> | 1 | Cancel DB-driven (`POST /api/runs/:id/cancel`) — in-process **ou** stop Hermes depuis DB | plus de 409 « not in this process » |
> | 2 | Réconciliation boot protocol-aware (`agent` resume / `responses` close) | `instrumentation.ts` |
> | 3 | `awaiting_approval` live + `POST /api/runs/:id/approval` → Hermes | banner + statut produit |
> | 4 | `last_event_at` + badge inactivité (signal only) | migration `0003` |
> | 5 | Retry mission terminée (`POST /api/runs/:id/retry`) | bouton Relancer |
> | 6 | Volume partagé `HERMES_SHARED_WORKDIR` → `runs/<id>/{in,out}` | défaut `/tmp/hermes-console-work` |
> | 7 | Table `artifacts` + dépôt / scan SHA-256 + `POST\|GET /api/files` | migration `0004` |
> | 8 | Messages multipart + composer attachment + `/artifacts` DB | UI live |
>
> **Hors slice encore ouverts :** auth `/setup`, coalescing re-mesuré sous vrai LLM, Docker Compose
> partagé Hermes+Console (Phase 5), auth download stricte.
>
> **Axe produit v0.6** (conservé) — généraliste dynamique ; Buzz / Multica / hermes-webui = sources
> d’inspiration, pas de clones. North star inchangé :
> ```text
> Console = control plane + surface de travail
> Runtime  = exécution (Hermes-first)
> Session  = workspace conversationnel
> Mission  = unité d’exécution traçable (run)
> Agent    = identité opérationnelle
> Connector = secret typé (Settings, chiffré)
> Canal    = pluggable (web d’abord)
> ```

> **Amendement v0.6** (conservé — axe produit). La Console n’est ni un clone de Buzz, ni un
> Linear-for-agents (Multica), ni un thin WebUI de parity CLI ([hermes-webui](https://github.com/nesquena/hermes-webui)).
> Détail take/refuse dans l’historique v0.6 ci-dessous et dans [`PRODUCT.md`](../PRODUCT.md).

> **Amendement v0.5** (conservé). La Console n’est plus hybride fixtures/API sur le parcours
> critique. Les agents, l’historique des conversations et la configuration runtime passent par
> PostgreSQL + routes produit. Les fixtures `run_*` restent uniquement pour la démo lecture seule
> (rejeu spike) ; le parcours réel est `thr_*`.
>
> | # | Changement v0.4 → v0.5 | Surface |
> |---|---|---|
> | 1 | Table `agents` + `GET\|POST /api/agents` + `GET\|PATCH /api/agents/:id` | CRUD local, aucun agent créé par défaut |
> | 2 | `/agents`, `/agents/new`, `/runs/new` branchés sur la base | plus de `AGENTS` statiques |
> | 3 | `/runs` et dashboard lisent `listThreads()` | plus de liste `RUNS` fictive |
> | 4 | Table `runtime_config` + `GET\|PUT /api/runtime` | token AES-256-GCM (`APP_ENCRYPTION_KEY`) |
> | 5 | `POST /api/runtime/test` accepte URL/token du formulaire | vrai `GET /health` + `/v1/capabilities` |
> | 6 | `threads.agent_id` FK optionnelle | snapshot nom/instructions/modèle à la création |
>
> **Amendement v0.4** (conservé). Le serveur Hermes expose `/v1/responses` pour le dialogue
> multi-tour. La Console persiste `threads`, `runs`, `messages` et `run_events`. Un message
> utilisateur crée toujours une mission distincte ; assistant-ui fournit l’UX de conversation,
> tandis que la Console garde l’autorité sur le stockage, les statuts et l’accès au runtime.

> **Changements v0.1 → v0.2.** Toutes les modifications proviennent de mesures réelles contre un
> runtime Hermes installé en natif. Les preuves sont dans [`SPIKE-REPORT.md`](./SPIKE-REPORT.md),
> les fixtures dans `spike/fixtures/`. Résumé :
>
> | # | Changement | Origine |
> |---|---|---|
> | 1 | **Les agents deviennent de purs objets locaux** — plus aucun profil Hermes à créer/synchroniser | §4.1 du rapport |
> | 2 | L'adapter cible le **serveur API OpenAI-compatible** (`/v1/runs`), pas le dashboard `:9119` | §3 |
> | 3 | Taxonomie d'événements **réécrite d'après les frames réelles** (la doc officielle est fausse) | §4.2 |
> | 4 | Phase 4 fichiers **repensée sur système de fichiers partagé** ; l'upload API est rejeté (400) | §4.3 |
> | 5 | **Nouveau : les approbations** — statut, écran et route ajoutés au parcours critique | §4.4 |
> | 6 | La « vérification de compatibilité » devient une **découverte de features** via `/v1/capabilities` | §4.5 |
> | 7 | Réconciliation au boot via `GET /v1/runs/{id}` — le mécanisme existe | §4.6 |
> | 8 | Ajout des **critères d'abandon** (absents de la v0.1) | §31 |
>
> **Changements v0.2 → v0.3** (mesures sous vrai modèle `gpt-5.4-nano`) :
>
> | # | Changement | Origine |
> |---|---|---|
> | 9 | ⚠️ **Les approbations ne se déclenchent pas sur `/v1/runs`** — le confinement en conteneur devient une **exigence**, pas une commodité | §8 du rapport |
> | 10 | `reasoning.available` n'est **pas** du raisonnement mais le texte final dupliqué — mapping corrigé | §6.3 |
> | 11 | `tool.completed` **ne transporte aucun résultat** — limite d'UI à assumer | §6.3 |
> | 12 | Coalescing chiffré : **33,6 deltas/s, 4 caractères par delta** | §6.2 |
> | 13 | **~38 k tokens d'entrée par mission** (prompt système + 24 outils) — à afficher | §6.1 |
> | 14 | Modèle de fichiers §16 **validé de bout en bout** sous vrai agent | §6.1 |

---

## 1. Résumé produit

Hermes Console Core est la **couche d’exploitation** d’un runtime agentique : control plane +
surface de travail. Hermes exécute ; la Console rend l’agent **exploitable, crédible et
traçable** — sans imposer Telegram/WhatsApp, sans forcer un workspace collab tiers, sans
réduire le produit à une chat UI de parity CLI.

L'application permet de :

1. connecter un runtime (Hermes aujourd’hui) ;
2. créer et configurer un **agent** (identité opérationnelle : instructions, modèle, limites) ;
3. lui confier une **mission** (unité de travail traçable) ;
4. observer l’exécution en temps réel (activité, outils, coût) ;
5. répondre à une demande d’autorisation ;
6. récupérer résultat + artefacts ;
7. consulter l’historique (audit trail produit).

La version courante n’est pas un SaaS multi-tenant, un Slack-for-agents, un gestionnaire de
projet type Linear, ni un orchestrateur multi-harness.

Elle valide l’hypothèse socle :

> Un utilisateur peut-il exploiter utilement un agent Hermes depuis une interface web
> professionnelle — sans CLI, sans canal messaging bricolé — et obtenir un résultat + une
> trace exploitables ?

---

## 2. Problème

Deux frictions, pas une :

**A. Runtime sans surface pro.** Hermes (comme OpenClaw, Claude Code, Codex) est puissant en
exécution (skills, mémoire, tools, cron, messaging). Sur un setup perso, Telegram marche. Chez
un client, « vos agents vivent dans WhatsApp » donne l’impression du bricolage — même si le
runtime derrière est solide.

**B. Surfaces existantes trop étroites ou trop spécialisées.**
- Un WebUI de parity CLI (ex. hermes-webui) résout l’accès web/mobile, pas le positionnement
  « collaborateur opérationnel » ni le control plane produit.
- Un workspace collab (ex. Buzz) résout la crédibilité équipe, mais n’est pas le produit : c’est
  un *canal*. Rebuilder Buzz/Nostr serait une dérive.
- Un PM human+agent (ex. Multica) résout l’assignation et le lifecycle, mais verrouille le cœur
  produit sur issues/Kanban et multi-harness — trop tôt, trop spécialisé.

Le produit doit masquer la complexité du runtime **et** présenter un workflow métier simple,
généraliste, crédible en entreprise :

```text
Choisir un agent → Décrire une mission → (Fichiers) → Lancer → Observer → (Autoriser) → Récupérer
```

Sans forcer l’utilisateur dans un paradigme chat-only, ticket-only, ou channel-only.

---

## 3. Hypothèse produit

L'hypothèse est validée lorsqu'un utilisateur peut installer ou ouvrir la Console, connecter
Hermes, créer un agent, lancer une première mission et récupérer un résultat exploitable —
**sans devoir ouvrir un terminal après l'installation initiale**, et en ressentant un outil de
travail (identité agent, état de mission, historique) plutôt qu’un chatbot ou un terminal
habillé.

---

## 4. Vision

### 4.1 Court terme (socle)
Le meilleur **control plane + surface de travail** autour d’un runtime Hermes : agents, missions,
streaming, artefacts, runtime health — self-hosted, mono-opérateur.

### 4.2 Moyen terme (généraliste dynamique)
Une couche d’exploitation agentique **ouverte** :
- **Agents** comme identités opérationnelles (support, dev, review, admin…) avec instructions,
  skills, limites ;
- **Missions** avec cycle de vie explicite (pending → running → awaiting_approval → terminal) ;
- **Surfaces pluggables** : web Console d’abord ; connecteurs messaging / workspace (Buzz, Slack,
  Discord, email…) ensuite — la Console reste source de vérité ;
- **Runtimes** : Hermes-first, puis adapter pour d’autres harness si un deuxième cas réel l’exige ;
- **Skills / routines** exposées côté produit (catalogue, attache à un agent) sans réimplémenter
  le moteur Hermes.

### 4.3 Long terme (sans influencer le socle)
Multi-utilisateur léger, automatisations, runtimes distants / Edge, métriques de coût, équipes
d’agents. **Jamais** : rebuild d’un Slack, d’un Linear, ou d’un marketplace skills day-1.

**Règle :** la vision guide le backlog et les refus produit ; elle n’élargit pas le parcours
critique tant que le socle n’a pas prouvé l’hypothèse §3.

### 4.4 Positionnement — ce que nous sommes / ne sommes pas

```text
NOUS SOMMES                         NOUS NE SOMMES PAS
─────────────────────────────       ─────────────────────────────────
Control plane agentique             Clone Buzz / Slack / Nostr
Surface de travail (missions)       Clone Multica / Linear / Jira
Web-first, mobile-capable           Thin parity CLI (hermes-webui)
Hermes-first, adapter-ready         Multi-harness marketplace day-1
Audit trail + approbations          Chatbot généraliste sans état
Self-hosted, crédible client        « Agents dans Telegram » comme pitch
```

---

## 5. Principes produit

### 5.1 Conversation pilotée par des missions
La conversation est le parcours utilisateur principal. Chaque message crée une mission possédant
un agent, une instruction, éventuellement des fichiers, un statut, des événements, un résultat et
des artefacts. Le dialogue ne gomme jamais les limites opérationnelles d’une mission.
*(Angle Multica : lifecycle explicite — pas silent prompt-response.)*

### 5.2 Hermes reste le moteur
La Console ne réimplémente pas les capacités d'Hermes. Elle fournit une abstraction UI, une
persistance produit, un proxy sécurisé, un historique lisible, une gestion simplifiée des E/S.

### 5.3 Un seul parcours critique
```text
Créer un agent → Lancer une mission → Voir l'exécution → (Autoriser si demandé) → Télécharger le résultat
```

### 5.4 Complexité différée
Toute fonctionnalité qui ne sert pas ce parcours part au backlog.

### 5.5 Monolithe modulaire
Une application Next.js unique avec des modules métier internes. Aucun microservice sans contrainte
technique mesurée.

### 5.6 La Console est la source de vérité de l'historique
**Mesuré :** le runtime ne rejoue pas ses événements (0 frame après complétion) et ne conserve les
états terminaux que brièvement. Toute donnée que l'utilisateur doit pouvoir relire est persistée par
la Console, jamais déléguée au runtime.

### 5.7 *(v0.6)* Agent = identité opérationnelle
Un agent n’est pas un preset de prompt jetable. Il a un nom, des instructions, un modèle, un
historique de missions, et (plus tard) skills / limites / canaux. L’UI doit le traiter comme un
collaborateur technique configuré — pas comme un persona de chatbot.
*(Angle Buzz : crédibilité + responsabilité ; sans channels comme modèle primaire.)*

### 5.8 *(v0.6)* Surfaces pluggables, cœur stable
Le web Console est le canal d’autorité. Les intégrations externes (Buzz, Slack, webhooks…) sont
des **transports** qui créent / relaient des missions dans le même modèle. On n’inverse jamais
la dépendance : pas de logique métier qui ne vit que dans un workspace tiers.

### 5.9 *(v0.6)* Généraliste avant spécialisé
Pas de Kanban, CRM, tickets, marketplace skills, multi-tenant, ou multi-harness tant qu’un
deuxième cas d’usage réel ne l’exige. Les primitives restent : Agent, Mission, Runtime, Artefact,
Approbation, (plus tard) Skill, Canal.

### 5.10 *(v0.6)* Contrôles toujours à portée
Modèle, agent, statut runtime, contexte tokens — visibles pendant le travail, pas enterrés dans
des settings. *(Angle hermes-webui : composer footer / Control Center — on reprend l’intention,
pas le layout.)*

---

## 6. Utilisateur cible

**Persona — Opérateur.** Utilisateur métier ou technique léger : consultant, freelance, dirigeant de
TPE, assistant administratif, opérateur interne, développeur cherchant une supervision.

Il sait utiliser une application web, rédiger une instruction, déposer un fichier. Il n'est **pas**
supposé connaître JSON-RPC, WebSocket, Docker, MCP, les profils Hermes ou les sessions du runtime.

**Persona secondaire (vision, pas socle) — Équipe / client.** Plusieurs humains interagissent avec
des agents spécialisés. La crédibilité passe par une surface pro (Console ou canal branché), pas
par Telegram. Le socle reste mono-opérateur ; le multi-user arrive quand le socle a prouvé §3.

---

## 7. Périmètre de la version 0.1

### Runtime
* configuration d'un runtime Hermes (URL + token) ;
* test de connectivité (`GET /health`) ;
* affichage du statut et de la version détectée ;
* ~~vérification de la compatibilité minimale~~ → **découverte des features via `/v1/capabilities`**,
  affichage de la version à titre informatif, gate sur les features requises et non sur un numéro.

### Agents *(simplifié)*
* liste, création, modification (nom, description, instructions) ;
* sélection du modèle (champ optionnel, transmis tel quel) ;
* archivage.
* **Supprimé :** provisioning de profil Hermes, `runtimeState`, synchronisation, suppression dure.
  Un agent est une ligne en base ; il n'a pas d'existence côté runtime.

### Missions
* création, sélection d'agent, saisie d'instruction, ajout de fichiers ;
* lancement, suivi du statut, affichage des événements et de la sortie finale ;
* **réponse aux demandes d'autorisation** *(nouveau)* ;
* annulation (**confirmée supportée** : `running → stopping → cancelled`) ;
* relance d'une mission échouée.

### Historique
Liste des missions, filtre par statut, consultation d'une mission passée, accès aux résultats et
fichiers générés.

### Artefacts
Métadonnées, téléchargement authentifié, distinction entrée/sortie, taille maximale configurable.

### Exploitation
Docker Compose, Postgres, healthchecks, logs structurés, migrations, volume persistant pour les
fichiers **et volume partagé avec Hermes** *(nouveau, cf. §16)*.

---

## 8. Hors périmètre

Inchangé pour le **socle** : multi-tenant, organisations, rôles avancés, équipes d'agents, projets,
tickets, Kanban, CRM, facturation, marketplace ; planification cron, workflows visuels,
orchestration multi-agent, workers multiples, file de messages externe ; Edge Gateway, enrôlement
distant, **runtimes multiples**, upgrade/rollback/backup distants, capacity planning ; RAG intégré,
mémoire long terme, vector DB, génération automatique d'agents.

> **Correction v0.9.** Le *runtime distant* sort du hors-périmètre : un transport `ssh` (tunnel `-L`
> vers un Hermes distant, miroir SFTP des artefacts) est livré et configurable dans
> `/settings/runtime` (§11.2, §12, §16). Restent hors périmètre : l'Edge Gateway, l'enrôlement
> sécurisé, la gestion à distance du cycle de vie Hermes (redémarrage, upgrade, backup) et le
> support de plusieurs runtimes simultanés — une seule configuration reste active.

**Hors périmètre explicite v0.6 (anti-dérive) :**
- rebuild d’un workspace collab (channels, DMs, voice, Nostr) — Buzz reste un *connecteur* futur ;
- cœur produit = issues / board / assignee picker type Multica ;
- objectif « parity CLI 1:1 » ou agent in-process comme hermes-webui ;
- multi-harness (Claude Code, Codex, OpenClaw…) tant qu’un deuxième runtime réel n’existe pas ;
- pitch « agents dans Telegram/WhatsApp » comme interface client.

---

## 9. Parcours utilisateur principal

### 9.1 Première ouverture
```text
Ouverture → Création du compte administrateur → Configuration du runtime → Test → Redirection agents
```
**Critères d'acceptation :** le token Hermes n'est jamais exposé au navigateur après enregistrement ;
une erreur de connexion fournit une explication actionnable ; aucune donnée de démonstration ;
la création du compte est **atomique** (contrainte d'unicité en base — deux requêtes concurrentes ne
peuvent pas créer deux administrateurs).

### 9.2 Création d'un agent *(simplifié)*
```ts
type CreateAgentInput = {
  name: string;
  description?: string;
  instructions: string;
  model?: string;
};
```
**Critères d'acceptation :** nom et instructions obligatoires ; création purement locale, donc
**aucun appel runtime, aucun état incohérent possible, idempotence triviale**.

### 9.3 Lancement d'une mission
```ts
type CreateRunInput = {
  agentId: string;
  prompt: string;
  fileIds?: string[];
};
```
**Critères d'acceptation :** le bouton ne crée qu'une seule exécution ; le statut est immédiatement
visible ; redirection vers le détail ; prompt et fichiers conservés ; erreur de démarrage affichée
sans ambiguïté.

**Règle d'architecture :** la mission ne doit être pilotée **ni par la requête HTTP `POST /api/runs`,
ni par la connexion SSE**. Fermer l'onglet ne doit pas tuer la mission. La route crée la ligne,
démarre un runner détaché et répond immédiatement.

### 9.4 Suivi d'une mission
**Critères d'acceptation :** les événements apparaissent sans rafraîchissement manuel ; une
reconnexion reprend le flux **depuis la base** (le runtime ne rejoue rien) ; le statut final est
persisté ; la perte du flux temps réel ne transforme pas le run en échec ; rafraîchir la page ne perd
pas l'historique.

### 9.5 Autorisation *(nouveau)*
Quand l'agent demande une permission, la mission passe en `awaiting_approval` (statut runtime :
`waiting_for_approval`). L'écran affiche la demande, la commande concernée et les `choices` renvoyés
par le runtime, relayés vers `POST /v1/runs/{id}/approval`.
**Critère d'acceptation :** une mission en attente est visuellement distincte d'une mission en cours ;
l'utilisateur n'a jamais l'impression que « ça tourne » alors qu'on l'attend.

> ⚠️ **Mesuré : cet événement ne s'est jamais déclenché** sur `/v1/runs`, y compris pour une commande
> que Hermes classe comme dangereuse (§18.1). L'écran est implémenté pour le jour où le runtime
> l'émettra ; **il ne constitue pas une protection** et ne doit pas être présenté comme telle.
> Le garde-fou de la v0.1 est le confinement en conteneur.

### 9.6 Consultation du résultat
Résumé, sortie brute ou structurée, fichiers générés, prompt d'origine, agent, date, durée, statut,
**consommation de tokens** (`usage` renvoyé par le runtime).
Actions : télécharger un artefact, copier le résultat, relancer, nouvelle mission avec le même agent.

---

## 10. Écrans

| Route | Contenu |
|---|---|
| `/setup` | URL runtime, token, bouton de test, état, enregistrement |
| `/` | Nouvelle mission, agents, dernières missions, runs actifs, erreurs runtime |
| `/agents` | Liste, modèle, dernière exécution, création |
| `/agents/new` | Formulaire |
| `/agents/[agentId]` | Configuration, nouvelle mission, missions récentes, édition, archivage |
| `/runs` | Historique global paginé |
| `/runs/[runId]` | Écran principal : suivi, approbations, résultat, artefacts, vue brute |
| `/chat` · `/chat/new` · `/chat/[sessionId]` | Surface conversationnelle : coque persistante, sidebar sessions ; mention `@agent` sur `/chat/new` seulement |
| `/runs/new` | Formulaire de mission |
| `/artifacts` | Artefacts d'entrée et de sortie (base) |
| `/settings` | Préférences Console et modèle LLM par défaut synchronisé depuis Hermes |
| `/settings/runtime` | Modification de la connexion Hermes — transport `direct` ou tunnel SSH |
| `/settings/models` · `/settings/connectors` · `/settings/security` · `/settings/retention` · `/settings/appearance` · `/settings/notifications` | Sous-pages Paramètres |

**Correction v0.9 :** les routes `/chat/session*` et `/chat/sessions*` annoncées par l'amendement
v0.8 n'existent pas — ce sont des redirections 307 (`next.config.ts`) vers `/chat*`. `/runs/*` n'est
pas redirigé : c'est une surface de premier plan, et la mention `@agent` y navigue explicitement.

**Précision — l'agent se choisit à la création, jamais après.** `threads.agent_id` est fixé par
`POST /api/threads` et n'est plus modifiable ensuite : il n'existe pas de `PATCH /api/threads/:id`,
et `POST /api/threads/:id/messages` ne valide que `{ message }` — le run suivant réutilise le
snapshot (`agent_name`, `instructions`, `provider`, `model`) figé sur le thread. Conséquence sur
`/chat/[sessionId]` : **aucun sélecteur d'agent, aucune mention, et `/agent show|create|edit|switch`
répond un refus** (`source === "chat"`, `execute-command.ts`). Pour travailler avec un agent, la
session doit naître mission — via `@<slug>` sur `/chat/new`, ou via **Missions → Nouvelle mission**.

**Exigence :** l'écran `/runs/[runId]` doit proposer une **vue « événements bruts »** dès la v0.1.
Sans elle, l'utilisateur technique trouvera la Console inférieure au CLI et retournera au terminal.

---

## 11. Modèle de données

### 11.1 Utilisateur
```ts
type User = { id: string; email: string; passwordHash: string; createdAt: Date };
```

### 11.2 Runtime
```ts
type RuntimeConfig = {
  id: string;
  name: string;
  baseUrl: string;               // http://hermes:8642 — en transport `ssh`, URL vue depuis l'hôte distant
  encryptedToken: string;        // API_SERVER_KEY, chiffré au repos
  transport: "direct" | "ssh";   // v0.9 — `direct` = fetch sur baseUrl, `ssh` = tunnel local -L
  sshHost: string | null;
  sshPort: number;               // défaut 22
  sshUser: string | null;
  sshAuth: "agent" | "password"; // `agent` = binaire ssh (clé/agent), `password` = ssh2
  encryptedSshPassword: string | null;  // AES-256-GCM ; le DTO public n'expose que sshPasswordConfigured
  remoteWorkdir: string | null;  // racine du volume de travail côté machine distante (§16)
  detectedVersion: string | null;
  capabilities: Record<string, unknown> | null;   // snapshot de /v1/capabilities
  lastHealthStatus: "unknown" | "healthy" | "unreachable" | "unauthorized" | "missing_feature";
  lastCheckedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
```
Une seule configuration active. `incompatible` est remplacé par `missing_feature` (une feature
requise absente de `/v1/capabilities`) et `unauthorized` (401 mesuré sur mauvais token).

### 11.3 Agent *(simplifié)*
```ts
type Agent = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  instructions: string;          // envoyé tel quel dans `instructions` de POST /v1/runs
  model: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
```
`hermesProfileName`, `runtimeState` et `runtimeError` sont **supprimés** : sans existence côté
runtime, ils n'ont plus d'objet.

### 11.4 Mission
```ts
type Run = {
  id: string;
  agentId: string;
  hermesRunId: string | null;      // run_… renvoyé par POST /v1/runs
  hermesSessionId: string | null;  // continuité optionnelle (X-Hermes-Session-Id)
  prompt: string;
  status: RunStatus;
  output: string | null;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number } | null;
  errorCode: string | null;
  errorMessage: string | null;
  workdir: string | null;          // répertoire partagé de la mission (cf. §16)
  startedAt: Date | null;
  completedAt: Date | null;
  lastEventAt: Date | null;        // détection d'inactivité
  createdAt: Date;
  updatedAt: Date;
};
```

### 11.5 Événement
```ts
type RunEvent = {
  id: string;
  runId: string;
  sequence: number;   // GÉNÉRÉ PAR LA CONSOLE — le runtime n'émet aucun id
  type: RunEventType;
  payload: Record<string, unknown>;
  occurredAt: Date;
};
```

### 11.6 Fichier
```ts
type Artifact = {
  id: string;
  runId: string;                 // NOT NULL, cascade sur `runs` — aucun artefact hors mission
  direction: "input" | "output";
  filename: string;
  storagePath: string;
  mimeType: string | null;
  sizeBytes: number;
  checksumSha256: string;
  createdAt: Date;
};
```

---

## 12. Architecture technique

```text
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ Navigateur — Next.js UI                                                              │
│   POST /api/runs ──┐                          ┌── GET /api/runs/:id/events (SSE)     │
└────────────────────┼──────────────────────────┼──────────────────────────────────────┘
                     │ 202 + runId              │ Last-Event-ID: <sequence Console>
┌────────────────────▼──────────────────────────▼──────────────────────────────────────┐
│ Application Next.js (process long-lived, JAMAIS serverless)                          │
│                                                                                       │
│  ╔═══════════════════════════╗  emit(runId,evt)  ╔══════════════════════════════════╗ │
│  ║ RunRunner (détaché)       ║──── in-process ──▶║ Route SSE (lecteur pur)          ║ │
│  ║  Map<runId, AbortCtrl>    ║                   ║  1. replay DB depuis sequence N  ║ │
│  ║  singleton HMR-safe       ║                   ║  2. puis live via emitter        ║ │
│  ╚═══════════╤═══════════════╝                   ╚══════════════════════════════════╝ │
│              │ événements normalisés + deltas coalescés (flush ~200 ms)               │
│  ┌───────────▼──────────┐        ╔═════════════════════════════════════════════════╗  │
│  │ Reconciler (au boot) │        ║ HermesAdapter — SEUL point de couplage runtime  ║  │
│  │ running/awaiting →   │───────▶║  health · capabilities · submitRun              ║  │
│  │ GET /v1/runs/:id     │        ║  streamRun · getRun · stopRun · respondApproval ║  │
│  └───────────┬──────────┘        ╚════════════════════╤════════════════════════════╝  │
└──────────────┼──────────────────────────────────────┼─────────────────────────────────┘
               │ SQL (source de vérité produit)       │ HTTP + SSE, Bearer token
               ▼                                      ▼
        ┌──────────────┐                      ┌──────────────────────┐
        │  Postgres    │                      │  Hermes API :8642    │
        │  runs        │                      │  tool_execution=     │
        │  run_events  │                      │       server         │
        │  artifacts   │                      └──────────┬───────────┘
        └──────────────┘                                 │ read_file / write_file / terminal
               ▲                                         ▼
               │            ┌────────────────────────────────────────┐
               └────scan────│ Volume PARTAGÉ  /work/runs/<runId>/     │
                            │  in/  → fichiers déposés par l'utilisateur│
                            │  out/ → fichiers produits par l'agent    │
                            └────────────────────────────────────────┘
```

**Légende / composants**
- **RunRunner** — propriétaire unique de la connexion au runtime pour une mission. Survit à la
  requête HTTP et à la déconnexion du navigateur. Stocké sur `globalThis` (garde anti-HMR en dev).
- **Route SSE** — *lecteur pur*, jamais producteur. Rejoue depuis Postgres puis bascule en live.
  C'est ce qui rend le rafraîchissement de page gratuit (§29).
- **Reconciler** — au démarrage, toute mission non terminale est réconciliée via `GET /v1/runs/:id`,
  sinon marquée terminale avec une cause explicite. *(Le runtime ne rejoue pas ses événements.)*
- **Volume partagé** — indispensable en transport `direct` : les outils de l'agent s'exécutent sur
  l'hôte Hermes (`tool_execution: "server"` mesuré).
- **Canal SSH** *(v0.9)* — en transport `ssh`, l'adapter n'appelle plus `baseUrl` mais l'entrée
  locale d'un tunnel `-L`. Un **canal unique** par empreinte de cible (`user|host|port|auth`) porte à
  la fois le port-forward HTTP et le SFTP des artefacts. Deux implémentations derrière la même
  interface : binaire `ssh` (ControlMaster/ControlPersist) pour l'auth clé/agent, `ssh2` pour l'auth
  par mot de passe. *Limite connue : le canal est un singleton — changer de cible ou enregistrer la
  configuration ferme le canal, y compris celui d'une mission en cours.*
- **Routes du schéma** — `POST /api/runs` et `GET /api/runs/:id/events` datent du spike ; le parcours
  produit passe par `/api/threads/*` (§14).

### 12.2 Stack
Next.js App Router · React · TypeScript strict · Bun · Zod · Drizzle ORM · Postgres ·
assistant-ui (rendu du fil) · `ssh2` (transport tunnel, `serverExternalPackages`) ·
Docker Compose · Caddy en production *(cible — cf. §20)*.

Temps réel : **HTTP + SSE** entre la Console et Hermes (mesuré), **SSE** entre Next.js et le
navigateur. Le navigateur ne communique jamais directement avec Hermes.

> Note SSE : côté Caddy, désactiver le buffering (`flush_interval -1`) ; côté Next.js, route en
> `runtime = "nodejs"` et `dynamic = "force-dynamic"`.

### 12.3 Organisation du code
```text
apps/web/src/
├── app/{(console),setup,api}/
├── modules/{agents,api,artifacts,connectors,runs,runtime,session,settings}/
│   └── runtime/ssh/   (system-ssh · ssh2-password · ssh-config · errors · types)
├── db/  ·  lib/{crypto,…}/  ·  components/
```
La découpe `domain/application/infrastructure/ui` n'est utilisée que lorsqu'elle réduit réellement
le couplage.

---

## 13. Contrat interne Hermes *(réécrit d'après le runtime réel)*

```ts
type HermesRuntimeHealth = {
  reachable: boolean;
  version?: string;                       // GET /health -> { status, platform, version }
  features?: Record<string, boolean>;     // GET /v1/capabilities -> features
  authorized: boolean;                    // 401 mesuré sur token invalide
};

/** Statuts renvoyés par le runtime — mesurés, pas documentés. */
type HermesRunStatus = "started" | "running" | "stopping" | "completed" | "failed" | "cancelled";

/** Événement brut du runtime : le type est DANS le JSON, il n'y a ni `event:` ni `id:` SSE. */
type HermesEvent = {
  event: string;          // "message.delta" | "reasoning.available" | "run.completed" | "tool.*" | "approval.request"
  run_id: string;
  timestamp: number;      // epoch flottant en SECONDES
  [key: string]: unknown; // delta | text | output | usage | …
};

type HermesAdapter = {
  health(): Promise<HermesRuntimeHealth>;

  modelOptions(): Promise<{
    provider: string;
    model: string;
    providers: Array<{
      slug: string;
      name: string;
      is_current: boolean;
      models: string[];
      capabilities: Record<string, { fast?: boolean; reasoning?: boolean }>;
    }>;
  }>; // GET /api/model/options

  submitRun(input: {
    prompt: string;
    instructions?: string;   // PROUVÉ : injecté en fin du prompt système -> remplace les profils
    model?: string;
    provider?: string;
    sessionId?: string;      // continuité optionnelle
  }): Promise<{ runId: string; status: HermesRunStatus }>;   // HTTP 202

  streamRun(runId: string, signal: AbortSignal): AsyncIterable<HermesEvent>;

  getRun(runId: string): Promise<{
    status: HermesRunStatus;
    output: string | null;
    usage?: { input_tokens: number; output_tokens: number; total_tokens: number };
  }>;                                                        // source de la réconciliation

  stopRun(runId: string): Promise<void>;                     // 200 -> "stopping", puis "cancelled"

  respondApproval(runId: string, approved: boolean): Promise<void>;
};
```

**Supprimé de la v0.1 :** `listProfiles`, `createProfile`, `updateProfile`, `createSession`.
Aucune n'existe sur cette surface et aucune n'est nécessaire.

### 13.1 Sélection du modèle LLM

La page `/settings` lit `GET /api/model/options` côté serveur et affiche **tous les providers**
retournés par Hermes, y compris ceux qui nécessitent encore une connexion. Pour chaque provider
authentifié, elle expose son inventaire de modèles et les capacités `fast` / `reasoning` annoncées.
La préférence `provider + model` est persistée dans la base de la Console, séparément des agents, puis
copiée dans chaque nouvelle conversation. Chaque mission transmet explicitement `provider` et
`model` à `/v1/runs`. Les conversations existantes gardent ce couple afin de rester reproductibles.

`openai-api` (clé et facturation API) et `openai-codex` (abonnement ChatGPT/Codex) sont deux
identités distinctes. Quand `openai-codex` est retourné comme non authentifié, la Console lance le
flux device-code officiel de Hermes et ne reçoit que l'URL de vérification, le code public et
l'état du flux. Les access/refresh tokens restent dans le magasin d'authentification Hermes. Sur
un runtime distant qui n'expose pas les routes OAuth Hermes, la Console refuse d'exécuter un CLI
local qui authentifierait la mauvaise machine et demande de lancer la commande sur l'hôte runtime.

La Console ne modifie ni `~/.hermes/.env` ni le dépôt Hermes Agent :

- `.env` reste réservé aux credentials et aux paramètres de processus ;
- le modèle global Hermes appartient à `~/.hermes/config.yaml` ;
- le runtime mesuré annonce `admin_config_rw: false` ;
- `/v1/runs` accepte déjà une surcharge de modèle par requête, qui est le contrat légitime ici.

API Console : `GET /api/runtime/models` renvoie le catalogue normalisé et la préférence effective ;
`PUT /api/runtime/models` valide le provider, son état d'authentification et le modèle contre le
catalogue courant, puis enregistre le défaut des nouvelles conversations. Le catalogue est mis en
cache côté serveur pendant 60 secondes ; le bouton « Actualiser » force une nouvelle lecture Hermes
et partage la requête en cours entre les appels concurrents. L'endpoint Console
`/api/runtime/providers/openai-codex/auth` pilote le flux local sans exposer les secrets.

> **Divergence v0.9 à résorber.** La slash command `/model <modèle>` (§14, route `/commands`) écrit la
> valeur brute sur la conversation **et sur l'agent**, sans validation contre le catalogue ni contre
> l'état d'authentification du provider. Deux chemins de sélection coexistent donc avec des règles
> différentes, et la portée est globale : l'agent étant partagé, la commande affecte ses missions
> futures. Cible : `/model` doit passer par la même validation que `PUT /api/runtime/models`, ou
> déclarer explicitement sa portée.

Les providers qui acceptent une clé manuelle exposent aussi
`POST /api/runtime/providers/:provider/credentials`. Cette route est **locale uniquement** :
elle transmet la clé au CLI Hermes par `stdin`, laisse Hermes la stocker dans son propre pool et ne
l'écrit ni dans la base Console, ni dans le navigateur, ni dans `.env`. Une mise à jour ne retire
que les anciennes clés dont le label `console-web-*` prouve qu'elles ont été ajoutées par cette
Console ; les credentials issus de l'environnement ou ajoutés hors Console restent intacts. Un
runtime distant doit fournir une future API d'administration authentifiée : la Console refuse de
modifier par erreur l'installation locale.

Le cycle de vie suit la même frontière. `POST /api/runtime/restart` exécute
`hermes gateway restart` uniquement lorsque l'URL enregistrée est loopback, déduplique les demandes
concurrentes, puis sonde la santé et les capacités pendant 30 secondes avant d'annoncer le succès.
L'action Web exige une confirmation explicite et peut interrompre une mission active. Pour un
runtime distant, le redémarrage reste indisponible tant que l'Edge n'expose pas une route
d'administration dédiée.

### 13.2 Normalisation des événements *(nouveau — ensemble fermé)*

```ts
type RunEventType =
  | "agent.message"       // <- message.delta, coalescé
  | "tool.call"           // <- tool.started    { tool, preview }
  | "tool.result"         // <- tool.completed  { tool, duration, error }
  | "approval.requested"  // <- approval.request { command, choices } — cf. §18.1
  | "run.error"
  | "run.completed"       // <- run.completed   { output, usage }
  | "system.notice"
  | "raw";                // passthrough de tout type inconnu — obligatoire
```

**Règles de mapping (toutes mesurées sous vrai modèle) :**

1. `message.delta.delta` est **coalescé** en mémoire et flushé toutes les ~200 ms en un seul
   `agent.message`. Mesure : **224 deltas pour 903 caractères en 6,7 s**, soit 33,6 deltas/s et
   4,0 caractères par delta. Un flush à 200 ms regroupe ~6,7 deltas et divise le volume par ~7.
   Persister un delta par ligne est exclu.
2. **`reasoning.available` est ignoré.** Malgré son nom, il ne contient pas de raisonnement mais le
   **texte final complet**, doublon de `run.completed.output`. Le mapper vers un événement de type
   « réflexion » afficherait la réponse deux fois.
3. **`tool.result` ne peut pas afficher de résultat.** `tool.completed` ne transporte que `tool`,
   `duration` et `error` (booléen) — jamais la sortie de l'outil. L'UI affiche « `read_file` a tourné
   0,237 s sans erreur ». C'est une infériorité assumée face au TUI, à indiquer explicitement dans la
   vue « événements bruts » pour ne pas laisser croire à une perte de données.
4. `sequence` est attribué par la Console (compteur monotone par run) — le runtime n'émet aucun `id`.
5. `timestamp` (float, secondes) est converti en `Date`.
6. Tout `event` inconnu tombe dans `raw` et reste affichable. Le runtime évolue ; l'UI ne doit jamais
   perdre un événement qu'elle ne connaît pas.
7. `run.completed.usage` est persisté et **affiché** : mesuré à **38 387 tokens d'entrée** pour un
   prompt trivial (le prompt système de Hermes et ses 24 outils sont refacturés à chaque mission).
   L'utilisateur doit voir ce coût, il est contre-intuitif.

---

## 14. API produit

```text
Runtime   GET|PUT /api/runtime  ·  POST /api/runtime/test  ·  POST /api/runtime/restart
          GET  /api/runtime/ssh-hosts            (v0.9 — alias ~/.ssh/config, lecture seule)
Modèles   GET|PUT /api/runtime/models
          POST /api/runtime/providers/:provider/credentials
          POST|GET|DELETE /api/runtime/providers/openai-codex/auth
Agents    GET|POST /api/agents  ·  GET|PATCH /api/agents/:agentId   (archivage via PATCH)
Connect.  GET /api/connectors  ·  GET|PUT|DELETE /api/connectors/:type
          POST /api/connectors/:type/test
Threads   GET|POST /api/threads                  (POST accepte `agentId` ou `agentRef` — mention @)
          GET|DELETE /api/threads/:threadId
          POST /api/threads/:threadId/messages   (JSON ou multipart + files ; `?stream=1` -> SSE inline)
          POST /api/threads/:threadId/commands   (v0.9 — backend des slash commands)
          GET  /api/threads/:threadId/events     (SSE, curseur Console)
Missions  POST /api/runs/:runId/cancel
          POST /api/runs/:runId/approval
          POST /api/runs/:runId/retry
Fichiers  POST /api/files  ·  GET /api/files/:fileId
Santé     GET /api/healthz  ·  GET /api/readyz
```
> **Note v0.7.** Protocoles Hermes : `HERMES_PROTOCOL=agent` (défaut, `/v1/runs`, réconciliable)
> ou `responses` (`/v1/responses`). Fichiers : volume `HERMES_SHARED_WORKDIR` — pas d’upload API
> Hermes (mesuré 400). Les routes missions legacy du spike restent au backlog.
>
> **Note v0.9.** (a) **Aucune route n'est authentifiée** (§17) ; seules `GET /api/files/:fileId`,
> `POST /api/runtime/restart` et `POST /api/runtime/providers/:provider/credentials` appliquent une
> garde same-origin, qui laisse par ailleurs passer toute requête sans en-tête `Origin`.
> (b) `GET /api/threads/:threadId/events` existe et gère `Last-Event-ID`, mais **n'est consommée par
> aucun client** : l'UI streame en ligne via `?stream=1` puis réconcilie par polling du snapshot.
> (c) `POST /api/files` n'est câblé à aucun composant — l'upload réel passe par
> `POST /api/threads/:threadId/messages` en multipart.

---

## 15. Cycle de vie d'une mission *(révisé)*

```text
pending ──▶ starting ──▶ running ──┬──▶ completed
                            ▲      ├──▶ failed
                            │      └──▶ cancelled
                            │             ▲
                   awaiting_approval ─────┘
                            │
                         (réponse)
```

```ts
type RunStatus =
  | "pending"
  | "starting"
  | "running"
  | "awaiting_approval"   // nouveau
  | "completed"
  | "failed"
  | "cancelled";
```

| Statut Console | Déclencheur mesuré |
|---|---|
| `pending` | ligne créée en base |
| `starting` | `POST /v1/runs` envoyé |
| `running` | 202 reçu, flux SSE ouvert (runtime : `started` puis `running`) |
| `awaiting_approval` | événement `approval.request` reçu (runtime : `waiting_for_approval`) — **jamais observé en pratique, cf. §18.1** |
| `completed` | `run.completed` reçu **ou** `GET /v1/runs/:id` renvoie `completed` |
| `failed` | erreur irréversible |
| `cancelled` | `POST /v1/runs/:id/stop` → `stopping` → `cancelled` (confirmé) |

**Règles ajoutées :**
- **Réconciliation au boot :** toute mission non terminale est repassée par `GET /v1/runs/:id`.
  Si le runtime ne la connaît plus (404 mesuré), elle est close en `failed` avec une cause explicite.
  Sans cela, un redémarrage de conteneur laisse des missions `running` éternelles.
- **Détection d'inactivité :** `lastEventAt` alimente un affichage « inactif depuis X ». On n'échoue
  pas une mission silencieuse, on la signale.
- Aucun worker distribué. Le process Next.js doit être **long-lived, jamais serverless**.

---

## 16. Gestion des fichiers *(réécrit — l'upload API n'existe pas)*

**Mesures :** l'upload de fichier via l'API est rejeté (`HTTP 400 — uploaded files and document
inputs are not supported`). Le champ `resources` de `POST /v1/runs` est accepté (202) mais
**silencieusement ignoré**. Seules les images inline par URL passent.

**Modèle retenu — système de fichiers partagé.** L'agent exécute ses outils sur l'hôte Hermes
(`tool_execution: "server"`), et dispose de `read_file`, `write_file`, `search_files`, `terminal`.

```text
1. L'utilisateur dépose des fichiers        → Console les écrit dans <workdir>/runs/<runId>/in/
2. (transport `ssh`) push SFTP de in/       → <remoteWorkdir>/runs/<runId>/in/ avant le run
3. La Console construit le prompt           → cite les chemins absolus VUS PAR HERMES (POSIX)
4. L'agent lit avec read_file / terminal    → travaille, écrit dans <…>/runs/<runId>/out/
5. (transport `ssh`) pull SFTP de out/      → miroir local, avant le scan
6. À l'événement terminal, la Console scanne <workdir>/runs/<runId>/out/
7. Chaque fichier trouvé devient un Artifact (direction: "output", checksum SHA-256)

> **Limite v0.9 :** le prompt ne cite le répertoire `out/` que s'il existe au moins un fichier
> d'entrée. Une mission sans pièce jointe n'apprend donc jamais où écrire ses sorties, et le scan de
> `out/` ne trouve rien. Les sorties ne sont scannées qu'à la **complétion** : un run annulé ou en
> échec perd les fichiers déjà produits, et le workdir distant n'est jamais purgé.
```

**Conséquence infra :** en transport `direct`, `web` et `hermes` **doivent partager un volume** —
absent du compose de la v0.1. C'est une dépendance dure, à valider en Docker (non testé par le spike).

**Transport `ssh` (v0.9) :** le volume partagé est remplacé par un **miroir**. La racine distante est
`runtime_config.remote_workdir` (défaut `/tmp/hermes-console-work`) ; la Console pousse `in/` avant le
run et rapatrie `out/` avant le scan, via le même canal SSH que le port-forward. *Dettes connues :*
les noms rapatriés ne passent ni par `sanitizeFilename` ni par `assertWithinDir` (contrairement au
dépôt) ; une seule entrée non téléchargeable (sous-dossier, `.`/`..`, permission) fait échouer tout le
rapatriement, donc tout le scan ; le chemin distant de `scp` n'est pas quoté.

**Contraintes conservées :** taille max par fichier et par mission, nombre max de fichiers, noms
normalisés, détection des traversées de chemin, checksum SHA-256, stockage hors répertoire public,
téléchargement via route authentifiée, aucune exécution directe.

**État v0.9 — portée réelle des contraintes.** Quotas, normalisation des noms et contrôle de
traversée sont implémentés et testés **sur le sens entrant uniquement** (`depositInputFile`). Le sens
sortant n'a ni limite de taille, ni limite de nombre, ni normalisation de nom, et le checksum charge
le fichier entier en mémoire (`sizeBytes` est par ailleurs un `integer` Postgres). Aucun contrôle du
type MIME : celui déclaré par le client est stocké puis renvoyé en `Content-Type`. Le téléchargement
**n'est pas authentifié** (§17) : `GET /api/files/:fileId` n'a qu'une garde same-origin et aucun
contrôle d'appartenance run/thread.

```env
MAX_FILE_SIZE_BYTES=20971520
MAX_RUN_FILES_TOTAL_BYTES=104857600
MAX_RUN_FILE_COUNT=20
HERMES_SHARED_WORKDIR=/tmp/hermes-console-work   # défaut réel du code ; /work en cible Compose
# Transport `ssh` : la racine distante n'est PAS une variable d'environnement.
# Elle est stockée en base (runtime_config.remote_workdir, défaut /tmp/hermes-console-work).
```

> **Risque — corrigé en v0.3.** L'agent dispose d'un terminal sur l'hôte Hermes, et son périmètre est
> celui du conteneur, pas du répertoire de la mission.
>
> La v0.2 affirmait ici que « c'est le mécanisme d'approbation qui constitue le garde-fou ».
> **C'est faux.** Mesuré en passe 0c : l'agent a exécuté `rm -f /tmp/…` et supprimé le fichier
> **sans qu'aucune approbation soit demandée**, alors même que le détecteur interne de Hermes classe
> cette commande exacte comme dangereuse (`delete in root path`). Le code assume ce comportement —
> `tools/approval.py:2885` : *« the dangerous-command path keeps the historical fail-open default »*.
>
> **Le garde-fou réel de la v0.1 est donc le confinement, pas l'approbation.** Cf. §18.1.

**Aller-retour validé de bout en bout** (passe 0b, vrai modèle) : l'agent a lu `in/notes.txt`,
calculé la somme et écrit `out/total.txt` contenant `20`. Le modèle par système de fichiers partagé
n'est pas une hypothèse, il fonctionne.

---

## 17. Authentification

Un seul utilisateur administrateur. Au premier démarrage : aucun utilisateur → écran de création →
création unique → inscription désactivée.

**Exigences :** mot de passe hashé (algorithme adapté), cookie de session `HttpOnly`, `Secure` en
production, protection CSRF, limitation des tentatives, expiration des sessions, aucun endpoint
produit accessible sans authentification, **création du premier compte atomique** (contrainte
d'unicité en base).

> **État v0.9 — non implémenté, et c'est le blocage principal.** Aucune table `users`, aucun
> `middleware.ts`, aucune session : **toutes les routes API et toutes les pages sont anonymes**.
> L'écran `/setup` affiche un bloc « Compte administrateur » dont les champs n'ont ni `name`, ni
> état, ni formulaire, ni bouton de soumission — il ne crée rien et ne doit pas être lu comme une
> protection. La seule garde existante, `assertSameOriginMutation`, n'est appliquée qu'à trois routes
> et laisse passer toute requête dépourvue d'en-tête `Origin` (donc tout client non-navigateur).
>
> **Conséquence opérationnelle :** tant que cette section n'est pas livrée, la Console ne doit être
> exposée ni sur Internet ni sur un LAN — bind sur `127.0.0.1`, ou authentification imposée en amont
> par un reverse-proxy. Créer une mission sans authentification équivaut à exécuter des commandes
> sous le compte du runtime Hermes (§18.1, chemin *fail-open*).

---

## 18. Sécurité

**Secrets.** Le token Hermes (`API_SERVER_KEY`) est chiffré au repos (AES-256-GCM, clé issue de
l'environnement), jamais renvoyé par l'API, jamais journalisé. Le navigateur ne contacte jamais
Hermes directement.
*Limite assumée :* le chiffrement protège contre un dump de base, **pas** contre une compromission de
l'application, qui détient la clé. Rotation de clé = ressaisie du token dans `/settings/runtime`.

**Second secret (v0.9).** Le mot de passe SSH (`encrypted_ssh_password`) est chiffré par le même
mécanisme et n'est jamais renvoyé au navigateur (seul le booléen `sshPasswordConfigured` sort). La
règle de rotation s'applique donc à **deux** secrets, tous deux à ressaisir dans `/settings/runtime`.
*Dettes connues :* `APP_ENCRYPTION_KEY` accepte n'importe quelle passphrase, hachée en SHA-256 sans
KDF ni sel ni longueur minimale, et `.env.example` livre un placeholder utilisable tel quel ; les
routes qui déchiffrent ces secrets pour un test de connexion acceptent une cible fournie par
l'appelant, sans garde d'origine.

**Réseau.** Postgres et Hermes n'exposent aucun port public ; seule la Console ou Caddy publie un
port ; réseau Docker interne partagé. `/v1/capabilities` renvoie `cors: false` : le runtime n'est
de toute façon pas conçu pour un accès navigateur direct.

**Réseau — transport `ssh` (v0.9).** Le modèle change : la Console ouvre une connexion SSH
**sortante** et expose un forward en loopback vers un Hermes situé hors du réseau Docker. Ce chemin
implique une gestion des clés d'hôte — assurée par `known_hosts` sur le chemin `agent`, **absente**
sur le chemin `ssh2`/mot de passe — et un `ControlPath` de multiplexage dans un `/tmp` partagé, dont
la propriété n'est pas vérifiée. L'URL distante doit être `http:` : le forward transporte du TCP brut
et un `https` casserait SNI et certificat (`SSH_REMOTE_URL_UNSUPPORTED`).

### 18.1 Confinement du runtime — **exigence, pas commodité** *(nouveau en v0.3)*

**Mesure (passe 0c) :** une commande classée dangereuse par Hermes lui-même s'exécute via `/v1/runs`
sans qu'aucun `approval.request` ne soit émis. Le chemin est *fail-open* par conception.

En clair : **tout ce que le compte exécutant Hermes peut atteindre, l'agent peut le détruire**, sur
simple instruction en langage naturel, sans confirmation. En installation native, cela signifie le
compte utilisateur entier.

Règles v0.1 qui en découlent :

1. **Hermes tourne en conteneur, jamais en natif** sur la machine de l'utilisateur. Le compose §20
   n'est pas une option de déploiement parmi d'autres : c'est le périmètre de sécurité.
   > **Écart v0.9 à traiter.** Le transport `ssh` connecte la Console à un Hermes **arbitraire** sur
   > une machine distante (racine de travail par défaut `/tmp/hermes-console-work`), sans vérifier ni
   > rappeler cette contrainte. Le confinement de l'hôte distant reste entièrement à la charge de
   > l'opérateur. Exigence ouverte : afficher l'avertissement de confinement dans l'UI du mode tunnel,
   > au même titre que l'avertissement de la règle 4.
2. Le conteneur Hermes ne monte **que** son volume de configuration et le volume de travail des
   missions. Aucun montage du home de l'utilisateur, aucun bind sur le système hôte.
3. Le socket Docker n'est **jamais** exposé au conteneur Hermes.
4. L'interface doit dire à l'utilisateur, au moment de la création d'un agent, que celui-ci **peut
   exécuter des commandes et modifier des fichiers** dans son espace de travail. Ne pas le masquer
   derrière l'abstraction « mission ».
5. **À investiguer avant la Phase 3 :** une configuration (`approvals.*`, `HERMES_GATEWAY_SESSION`,
   mode cron) bascule-t-elle `/v1/runs` en fail-closed ? Si oui, l'activer et la documenter. Sinon,
   l'écran d'approbation §9.5 reste une UI sans déclencheur — il est alors implémenté pour le jour où
   le runtime l'émettra, mais **ne doit jamais être présenté comme une protection**.

> Ce point conditionne la mise entre les mains d'un premier utilisateur (§29). Il ne bloque ni la
> Phase 1 ni la Phase 2, qui tournent sur la machine de l'auteur.

**Fichiers.** Validation du nom et du type, quotas, répertoire dédié par mission, pas d'exécution,
téléchargement authentifié, contrôle des chemins.

---

## 19. Observabilité

```ts
type LogContext = {
  requestId?: string;
  runId?: string;
  agentId?: string;
  hermesRunId?: string;
};
```

**Événements à journaliser :** test runtime, création/modification d'agent, démarrage de mission,
soumission au runtime, reconnexion au flux, demande d'autorisation, réponse d'autorisation, fin de
mission, erreur, annulation, réconciliation au boot, téléchargement d'artefact.

**Healthchecks.** `GET /api/healthz` (le process répond) et `GET /api/readyz` (Postgres, stockage,
volume partagé accessible en écriture, configuration runtime présente).
Hermes peut être indisponible sans que la Console soit morte : son état est reporté séparément.

---

## 20. Déploiement

```yaml
services:
  web:
    build: { context: ., dockerfile: apps/web/Dockerfile }
    restart: unless-stopped
    environment:
      NODE_ENV: production
      DATABASE_URL: postgres://hermes:${POSTGRES_PASSWORD}@postgres:5432/hermes
      APP_ENCRYPTION_KEY: ${APP_ENCRYPTION_KEY}
      SESSION_SECRET: ${SESSION_SECRET}
      FILE_STORAGE_PATH: /data/files
      HERMES_BASE_URL: http://hermes:8642          # API server, PAS le dashboard 9119
      HERMES_SHARED_WORKDIR: /work
    volumes:
      - files-data:/data/files
      - hermes-work:/work                          # AJOUT : volume partagé avec l'agent
    depends_on:
      postgres: { condition: service_healthy }
    networks: [internal]

  postgres:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: hermes
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: hermes
    volumes: [postgres-data:/var/lib/postgresql/data]
    healthcheck: { test: ["CMD-SHELL", "pg_isready -U hermes -d hermes"] }
    networks: [internal]

  hermes:
    image: nousresearch/hermes-agent:${HERMES_IMAGE_TAG:-latest}
    restart: unless-stopped
    command: gateway run
    environment:
      API_SERVER_ENABLED: "true"                   # requis pour exposer /v1/runs
      API_SERVER_KEY: ${HERMES_RUNTIME_TOKEN}
    volumes:
      - hermes-data:/root/.hermes
      - hermes-work:/work                          # même volume que `web`
    networks: [internal]

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports: ["80:80", "443:443"]
    volumes:
      - ./infra/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
    depends_on: [web]
    networks: [internal]

networks: { internal: }
volumes: { postgres-data:, files-data:, hermes-data:, hermes-work:, caddy-data: }
```

**Différences avec la v0.1 :** port `8642` et non `9119` ; `API_SERVER_ENABLED` requis ; volume
`hermes-work` monté **des deux côtés** ; variables `HERMES_DASHBOARD_*` supprimées (mauvaise surface).

> **État v0.9 — cible, pas livraison.** Aucun `Dockerfile`, `compose.yml` ni `Caddyfile` n'existe dans
> le dépôt : cette section décrit la Phase 5, non l'existant. Le développement passe par le
> `Makefile` (§21) et un Postgres partagé local.
>
> **Transport `ssh` :** ce compose décrit le transport `direct`. En mode tunnel, `hermes` n'est pas un
> service du compose et le volume `hermes-work` n'est pas partagé — il est remplacé par le miroir SFTP
> (§16). `SESSION_SECRET` est listé pour mémoire : aucune session n'existe encore (§17).

> **En développement sur cette machine**, ne pas déployer un Postgres dédié : réutiliser
> `infra-postgres` sur le réseau `dev-shared-net` (stack `dev-infra` déjà en place).

---

## 21. Expérience développeur

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "typecheck": "tsc --noEmit",
    "test": "bun test",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:migrate": "drizzle-kit migrate"
  }
}
```

**Entrée unique : le `Makefile`** *(v0.9)*. `make setup` (install + env + workdir + vérification
Postgres + migrations), `make dev`, `make check` (lint + typecheck + test), `make db-*`,
`make health` / `make ready`, `make spike-probe` / `make fake-llm`. `make env` génère
`apps/web/.env.local` depuis `.env.example` avec une `APP_ENCRYPTION_KEY` fraîche.
`test:e2e` n'existe pas : aucun harnais E2E n'est installé (§22).

```text
```

```text
apps/web/.env.example                (réel — copié en .env.local par `make env`)
├── DATABASE_URL             ├── HERMES_BASE_URL       (fallback si aucune config en base)
├── APP_ENCRYPTION_KEY       ├── HERMES_RUNTIME_TOKEN  (= API_SERVER_KEY)
│                            ├── HERMES_PROTOCOL       (agent | responses)
│                            └── HERMES_SHARED_WORKDIR (/tmp/hermes-console-work)
└── MAX_FILE_SIZE_BYTES · MAX_RUN_FILES_TOTAL_BYTES · MAX_RUN_FILE_COUNT   (commentés)

La configuration du tunnel SSH n'a AUCUNE variable d'environnement : elle vit exclusivement en base
(`runtime_config`) et se saisit dans Paramètres → Runtime. `SESSION_SECRET`, `FILE_STORAGE_PATH`,
`POSTGRES_PASSWORD` et `HERMES_IMAGE_TAG` relèvent de la cible Compose (§20), pas du dev local.
```

---

## 22. Tests

**Unitaires :** validation des entrées, **mapping des événements Hermes (contre les fixtures réelles
de `spike/fixtures/`)**, coalescing des deltas, transitions de statut, chiffrement des secrets,
normalisation des chemins, règles de quota, gestion des erreurs.

**Intégration (contre le mock construit sur les fixtures) :** soumission d'un run, persistance des
événements, attribution de la `sequence`, clôture d'un run, **réconciliation au boot**, annulation,
**cycle d'approbation**, reconnexion SSE avec `Last-Event-ID`, téléchargement sécurisé.

**E2E — parcours critique :**
```text
Créer le compte → Configurer Hermes → Créer un agent → Lancer une mission
→ Recevoir les événements → Autoriser une action → Voir le résultat → Télécharger un fichier
```

**Scénarios d'erreur :** runtime inaccessible, mauvais token (401), run inconnu (404), perte du flux,
run échoué, fichier trop volumineux, artefact introuvable, redémarrage en cours de mission.

> Le mock runtime est construit à partir de `spike/fixtures/` : les tests E2E sont déterministes et
> ne consomment aucun token.

**État v0.9 — écart entre le plan et l'existant.** La suite réelle est **unitaire uniquement**
(23 fichiers `*.test.ts`, 95 tests, verte via `make test`). **Aucun test d'intégration contre un mock
runtime, aucun test E2E** : `playwright` n'est pas installé et le parcours critique ci-dessus n'est
pas automatisé.

Couvert : mapping et normalisation des événements, coalescing, décision de réconciliation,
chiffrement, chemins d'artefacts et traversées, décisions d'annulation et de retry, garde
same-origin, parser de slash commands, parser de mentions, refus `/agent*` en session chat, mapping
des erreurs SSH et parsing de `~/.ssh/config` (28 tests).

**Angles morts explicites :** cycle de vie du tunnel (`forward`, `close`, `probeForward`,
concurrence), opérations SFTP et `remote-sync`, `scanOutputArtifacts`, branche `remoteRoot` du
prompt, chemins d'erreur de `executeSessionCommand` (`/model`, `/agent create|edit|switch`,
`/connector status`), commandes malformées. C'est-à-dire : **tout le code qui manipule des process,
des sockets ou des fichiers distants n'est couvert par aucun test.**

---

## 23. Exigences non fonctionnelles

**Performance.** Événement visible en moins de deux secondes après réception serveur (mesuré : premier
delta à ~136 ms) ; historique paginé ; pas de polling agressif ; streaming limité aux runs actifs ;
deltas coalescés avant persistance.

**Fiabilité.** Une mission possède toujours un état terminal ou récupérable ; un redémarrage ne perd
pas l'historique ; les fichiers survivent au remplacement du conteneur ; les erreurs Hermes sont
conservées dans un format exploitable.

**Accessibilité.** Navigation clavier, labels explicites, statuts accompagnés de texte, contraste
suffisant, annonces accessibles pour les événements importants — **en particulier les demandes
d'autorisation**, qui doivent être annoncées et non seulement colorées.

**Responsive.** Desktop prioritaire, consultation possible sur mobile, création et suivi utilisables
sur tablette.

---

## 24. Indicateurs de succès

**Activation :** l'utilisateur a connecté Hermes, créé un agent, terminé une mission.

**Métriques :** taux de connexion runtime réussie ; taux de création d'agent réussie ; taux de
missions arrivant à un état terminal ; temps entre l'ouverture et la première mission ; taux de
missions relancées ; taux de missions produisant un artefact ; nombre d'usages nécessitant encore
le CLI.

**Critère principal :** pourcentage d'utilisateurs ayant réalisé une mission complète sans CLI.

**Objectifs :** première mission en moins de dix minutes après installation ; aucune manipulation CLI
après configuration ; au moins 95 % des exécutions avec un statut final cohérent ; aucun secret
Hermes visible dans le navigateur ou les logs.

---

## 25. Risques

| # | Risque | Statut après spike | Réponse |
|---|---|---|---|
| 1 | API Hermes instable | **Réel et confirmé** — la doc officielle diverge du runtime (`assistant.delta` vs `message.delta`) | Tout passe par `HermesAdapter` ; fixtures versionnées ; `raw` passthrough pour les types inconnus |
| 2 | Sessions longues dans Next.js | Ouvert | Process long-lived, jamais serverless ; runner détaché de la requête |
| 3 | Perte du flux | **Aggravé** — le runtime ne rejoue rien (0 frame mesurée) | La Console persiste tout ; reprise via `Last-Event-ID` sur sa propre `sequence` ; réconciliation via `GET /v1/runs/:id` |
| 4 | Recréation du control plane | Ouvert | Toute fonctionnalité doit répondre à une friction observée chez un utilisateur réel |
| 5 | Dépendance au format Hermes | **Atténué** | Événements normalisés vers un ensemble fermé (§13.2) |
| 6 | Fichiers dangereux | **Déplacé** — le vrai risque n'est plus l'upload mais le terminal de l'agent sur l'hôte | Approbations (§9.5), quotas, répertoire par mission, téléchargement authentifié |
| 7 | *(nouveau)* Volume d'événements | Non mesuré sous vrai LLM | Coalescing obligatoire avant persistance ; à re-mesurer dès qu'un provider réel est branché |
| 8 | *(nouveau)* Missions bloquées sur approbation | Identifié | Statut `awaiting_approval` visible, distinct de `running` |

---

## 26. Phases de réalisation *(révisées)*

**Phase 0 — Spike runtime.** ✅ **TERMINÉE** (29-07-2026). Hermes installé en natif, API validée,
fixtures capturées, faux LLM opérationnel. Cf. `SPIKE-REPORT.md`.

**Phase 1 — Tranche verticale conversationnelle.** ✅ **IMPLÉMENTÉE**
Agents locaux, pas d’auth ni de fichiers : message → `POST /v1/responses` → normalisation SSE →
sortie affichée, avec historique PostgreSQL, reprise par curseur et messages suivants dans la même
conversation Hermes.
*Sortie :* le parcours de valeur est démontrable avec un runtime Hermes joignable.

**Phase 2 — Socle produit.** ✅ **IMPLÉMENTÉE (sans auth)** — 29-07-2026
CRUD agents PostgreSQL, historique `/runs` + dashboard branchés sur `threads`, configuration
runtime chiffrée (`runtime_config` + `APP_ENCRYPTION_KEY`), test de connectivité réel depuis
`/settings/runtime`. Auth (compte unique) et `/setup` restent **ouverts**.
*Sortie :* la verticale agents → mission → historique → runtime est exposée dans l’UI sans fixtures.

**Phase 3 — Robustesse d'exécution.** ✅ **IMPLÉMENTÉE (hors coalescing LLM)** —
cancel DB-driven, réconciliation protocol-aware, `awaiting_approval` live +
`POST …/approval`, `lastEventAt` + badge inactivité, **retry** (`POST …/retry`).
Reste optionnel : coalescing re-mesuré sous vrai provider.
*Sortie :* les missions ont toujours un état honnête.

**Phase 4 — Fichiers et artefacts.** ✅ **SLICE VERTICALE IMPLÉMENTÉE** — 30-07-2026.
Table `artifacts` + `runs.workdir`, dépôt `in/`, injection chemins dans le prompt, scan `out/`
à la complétion (SHA-256), `POST /api/files` + `GET /api/files/:id`, page `/artifacts` DB,
messages multipart + attachment composer. Volume : `HERMES_SHARED_WORKDIR` (défaut
`/tmp/hermes-console-work` en dev). Reste : Docker volume Compose partagé (Phase 5), auth
download stricte, polish multi-upload.
*Sortie :* une mission peut recevoir et produire des documents.

**Phase 4 bis — Runtime distant + control-plane dans le chat.** ✅ **SLICE IMPLÉMENTÉE** — 30-07-2026.
Transport `direct` \| `ssh` persisté (migrations `0008`/`0009`), tunnel `-L` par clé/agent (binaire
`ssh`, ControlMaster) ou par mot de passe (`ssh2`), suggestion d'hôtes `~/.ssh/config`, miroir SFTP
des artefacts (`remote_workdir`), codes d'erreur SSH métier, second secret chiffré. Côté chat :
mention `@<slug>` dispatchée en mission `/runs`, route `POST /api/threads/:id/commands`,
`/connector status`, coque `/chat` persistante et streaming inline `?stream=1`.
*Sortie :* une Console locale peut piloter un Hermes situé sur une autre machine.
*Reste ouvert :* vérification de clé d'hôte côté `ssh2`, sérialisation du tunnel, quotas de sortie,
normalisation des noms rapatriés, collisions `UNIQUE(run_id, sequence)` sur les chemins de reprise,
tests du tunnel et de la synchronisation distante.

**Phase 5 — Livraison.** Mock runtime issu des fixtures, tests E2E, logs structurés, Docker Compose
de production, Caddy — **et l'authentification (§17), qui devient le prérequis bloquant** : aucun
Dockerfile ni compose n'existe encore, aucun harnais E2E n'est installé.
*Sortie :* la v0.1 est montrable et installable chez un premier utilisateur.

> Changement de séquencement : la Phase 1 de la v0.1 (config + chiffrement + healthcheck + adapter)
> ne montrait rien à un utilisateur. Le produit valide une hypothèse : la première tranche doit aller
> jusqu'au résultat visible.

---

## 27. Backlog après validation

Orienté **axe v0.6** (généraliste dynamique) — chaque item doit servir Agent / Mission / Runtime /
Skill / Canal, pas un clone de référence.

**0.2 — Surface de travail**
Contrôles toujours à portée (agent, modèle, tokens) ; templates d'agents ; duplication ; prompts
enregistrés ; relance depuis une mission ; export Markdown ; résumé automatique ; vue activité
unifiée (feed missions / événements, pas logs bruts comme vue principale).

**0.3 — Identité agent & skills**
Profil agent enrichi (rôle métier, limites déclarées) ; catalogue skills (lecture / attache depuis
Hermes, sans marketplace) ; plusieurs utilisateurs + rôles simples ; partage d'agents ;
commentaires sur mission.

**0.4 — Automatisations & canaux**
Cron / webhooks entrants ; notifications ; premier connecteur messaging **en tant que transport**
(Buzz *ou* Slack *ou* Discord — un seul, mesuré) ; delivery des résultats hors Console.

**0.5 — Runtimes & Edge**
Runtime distant, Edge Gateway, enrôlement sécurisé, installations multiples, panneau santé
runtime (online/offline, usage) — *angle Multica fleet, sans multi-harness day-1*.

**Ultérieur**
Équipes d'agents, orchestration, projets légers, budgets, métriques avancées, deuxième adapter
runtime si cas réel.

*Reclassés ici depuis la v0.1 :* `DELETE /api/agents/:id`, `DELETE /api/files/:fileId`, filtre par
agent sur l'historique, sélection de provider avancée.

---

## 28. Règles anti-overengineering

Une fonctionnalité est acceptée en v0.1 seulement si elle est indispensable pour exécuter une
mission, utilisée dans le parcours principal, et si son absence empêche de tester le produit avec un
utilisateur. Sinon : **BACKLOG**.

**Interdictions avant la première utilisation réelle :** aucun nouveau service, aucun nouveau
langage, aucun bus de messages, aucun worker distribué, aucun modèle multi-tenant, aucune gestion
d'installation distante, aucune abstraction générique sans deuxième implémentation réelle, aucune
fonctionnalité d'administration hors parcours principal.

**Interdictions v0.6 (anti-clone) :** ne pas démarrer une feature parce que Buzz / Multica /
hermes-webui l’ont. Critère : est-ce une primitive Agent / Mission / Runtime / Skill / Canal qui
renforce le control plane ? Sinon → backlog ou refus.

---

## 29. Définition de terminé

La v0.1 est terminée lorsqu'un nouvel utilisateur peut créer son compte, connecter Hermes, créer un
agent, lancer une mission, suivre les événements, **répondre à une demande d'autorisation**,
rafraîchir la page sans perdre le run, voir le résultat, télécharger les fichiers générés, retrouver
la mission dans l'historique ; que les données survivent au redémarrage **et que les missions en
cours au moment du redémarrage soient réconciliées et non laissées en `running`** ; que l'ensemble
démarre avec Docker Compose ; que le parcours principal soit couvert par un test E2E ; et qu'aucun
accès CLI ne soit requis en usage normal.

**Condition bloquante ajoutée en v0.3 :** avant toute mise entre les mains d'un utilisateur tiers,
le runtime Hermes doit tourner **confiné en conteneur** selon les règles §18.1, et l'interface doit
avertir explicitement que l'agent exécute des commandes. Tant que ce point n'est pas traité, la v0.1
reste utilisable par son auteur uniquement.

> **État v0.9 — 6 critères sur 11 échouent.** Ne sont **pas** tenus : création de compte (§17, rien
> d'implémenté) ; réconciliation des missions au redémarrage (le filet existe mais lève une
> violation `UNIQUE(run_id, sequence)` avant d'atteindre `failRun` — le run reste `running`, et la
> passe de réconciliation, mémoïsée sur `globalThis`, n'est jamais rejouée dans le process) ;
> démarrage par Docker Compose (aucun `Dockerfile`, `compose.yml` ni `Caddyfile` dans le dépôt) ;
> couverture E2E du parcours principal (aucun harnais installé — la suite unitaire est verte,
> 95/95, mais ne couvre pas le parcours) ; avertissement d'exécution de commandes à la
> création d'un agent (§18.1 règle 4 — présent uniquement dans `/settings/security`) ; production
> d'artefacts de sortie dans le cas nominal (les chemins `out/` ne sont annoncés dans le prompt que
> si la mission porte au moins une pièce jointe).
>
> Sont tenus : suivi des événements, rafraîchissement sans perte de run, résultat et téléchargement,
> historique, survie des données au redémarrage, absence de CLI en usage normal.

---

## 30. Résumé exécutif

```text
Un opérateur + Un runtime (Hermes) + Des agents (identités) + Des missions + Du streaming
+ Des artefacts (volume partagé) + Une surface web crédible (control plane)
```

Et pas encore :

```text
Un Slack-for-agents + Un Linear-for-agents + Un SaaS multi-tenant + Un multi-harness marketplace
+ Auth multi-user + Compose prod installable (Phase 5)
```

**Axe v0.9 en une phrase :** la Console est la couche d’exploitation agentique — missions
honnêtes, fichiers partagés, agents configurables, runtime joignable où qu’il soit — générale et
extensible, pas un wrapper CLI ni un clone de workspace/PM.

**Réserve v0.9 :** ce résumé décrit le produit tel qu’il est conçu, pas tel qu’il est déployable.
Sans authentification (§17), sans Compose (§20) et avec un filet de réconciliation non fonctionnel
(§29), la Console reste utilisable **par son auteur, en `127.0.0.1`, uniquement**.

---

## 31. Critères d'abandon *(nouveau)*

La v0.1 valide une hypothèse. Une hypothèse doit pouvoir être **invalidée**, sinon le projet ne meurt
jamais, il pourrit. Le projet s'arrête si l'un de ces signaux se déclenche :

1. **Usage.** Après deux semaines d'usage personnel post-Phase 3, le CLI reste le réflexe par défaut
   pour les missions réelles.
2. **Fiabilité.** Moins de 90 % des missions atteignent un état terminal cohérent après la Phase 3,
   sans cause identifiée et corrigeable.
3. **Dérive runtime.** Un changement de version Hermes casse l'adapter deux fois de suite sans
   chemin de migration raisonnable.
4. **Valeur.** Après la Phase 4, aucune mission réelle ne produit un résultat qu'on n'aurait pas
   obtenu plus vite au terminal.

**Date de revue :** à la fin de la Phase 3.
Décision par défaut en l'absence de revue : **arrêt**, pas continuation.
