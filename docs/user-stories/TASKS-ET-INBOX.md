# Tâches et Inbox — contrat produit inspiré par Multica

**Date :** 09-08-2026

**Statut :** contrat normatif ; aucune capacité `PROPOSÉE` n'est déclarée livrée par ce document.

**Référence :** Multica est une source de comparaison, pas une dépendance, un composant intégré ni
un modèle de licence à reprendre.

## Frontière produit

~~~text
┌────────────────────────┐
│ Web ou canal           │
└───────────┬────────────┘
            │ capture · brouillon
            ▼
╔════════════════════════╗
║ Console                ║
║ Contrat · décisions    ║
╚═══════════╤════════════╝
            │ mandat borné
            ▼
┌────────────────────────┐
│ Hermes exécute         │
└───────────┬────────────┘
            │ résultats
            ▼
╔════════════════════════╗
║ Console                ║
║ Preuves · décisions    ║
╚═══════════╤════════════╝
            │ projection sans autorité
            ▼
┌────────────────────────┐
│ Inbox ou canal         │
└────────────────────────┘
~~~

Légende : la Console est la source de vérité du contrat, des décisions et des preuves ; Hermes
reçoit un mandat borné pour exécuter ; un canal ne fait que capturer ou projeter. Aucun des trois
ne rend l'autre implicite.

Une **capture** est le texte brut fourni par une personne ou un canal. Un **contrat** est une
révision durable qui rend objectif, résultat attendu et exclusions contrôlables. Un **plan** est la
partie validée de ce contrat. Une **tentative** est une exécution Hermes distincte. Les **preuves**
décrivent le résultat d'une tentative. Une **décision** est un acte humain attribué par la Console.

Les états de story restent exclusivement ceux de [CONVENTIONS.md](CONVENTIONS.md). La prose de
chaque story distingue donc code présent, preuve locale, P-E2E et acceptation, sans créer de
nouveau pseudo-état.

## Matrice Multica : adoption bornée

| Décision | Élément de référence | Application Console | Critère testable |
|---|---|---|---|
| **ADOPTÉ** | Une issue peut avoir plusieurs tasks/runs ; terminer un run ne termine pas nécessairement le travail ([Multica Tasks](https://multica.ai/docs/tasks)). | La tâche et sa révision sont distinctes de la tentative Hermes et de sa décision fonctionnelle. | Une tentative `completed` sans preuves complètes et décision fonctionnelle laisse la tâche non terminée. |
| **ADAPTÉ** | L'Inbox Multica est humaine, concerne une activité qui requiert un suivi et ne déclenche jamais les agents ([Multica Inbox](https://multica.ai/docs/inbox)). | L'Inbox Console reste une projection de tâches et missions ; elle devient personnelle seulement après attribution explicite par le serveur, sans créer de run. | Un utilisateur non destinataire ne voit pas l'item comme sien ; ouvrir ou charger l'Inbox ne crée aucune tentative ni appel Hermes. |
| **REJETÉ** | Une assignation, mention, conversation ou Autopilot peut créer directement un task/run ([sources de déclenchement Multica](https://multica.ai/docs/tasks)). | Aucun brief, assignation, mention ou canal ne court-circuite le contrat, le plan validé et les décisions Console. Aucun issue tracker, board Kanban ou picker d'assignee/squad n'est ajouté. | Après une capture rapide, il existe au plus un brouillon/révision ; il n'existe ni `guided_task_attempt`, ni run Hermes, ni appel runtime. |
| **DIFFÉRÉ** | Les Autopilots peuvent déclencher des agents sur horaire ou événement ([Multica Daemon and runtimes](https://multica.ai/docs/daemon-runtimes)). | L'automatisation reste hors périmètre tant que consentement, politique, isolation et décisions préalables ne sont pas prouvés. | Une automation absente ou non autorisée échoue avant création d'une tentative ; son éventuelle reprise exige un contrat futur approuvé. |

Multica explique aussi que le daemon coordonne tandis que la machine connectée exécute
([Daemon and runtimes](https://multica.ai/docs/daemon-runtimes)). Cette séparation éclaire la
frontière Console/Hermes, mais ne remplace pas les contrôles propres à la Console. La réutilisation
de son code reste hors périmètre : sa licence réserve l'usage hosted ou embedded sans licence
commerciale ([Multica License](https://github.com/multica-ai/multica/blob/main/LICENSE)).

## Ordre de livraison

1. `US-G0-INBOX-001` — constater et accepter la projection actuelle, sans la présenter comme
   personnelle ;
2. `US-G0-UX-004` — ajouter, si le besoin est confirmé, la capture rapide qui reste un brouillon ;
3. `US-G0-INBOX-002` — seulement ensuite, porter une affectation personnelle par résumé serveur.

Les étapes 2 et 3 sont optionnelles et non bloquantes pour le `GO` Gate 0 actuel.

## US-G0-UX-004 — Capturer rapidement sans déclencher Hermes

> En tant que **demandeur métier**, je veux déposer une demande courte depuis `/tasks/new`,
> afin que la Console pré-rédige un brouillon de contrat sans démarrer une réalisation implicite.

- **État :** `PROPOSÉE` — cible optionnelle, non bloquante pour Gate 0 : pas de capture rapide Web
  livrée ni de P-E2E associé. Elle ne requalifie pas `US-G0-UX-001`, déjà acceptée
  pour le cadrage Web explicite.
- **Dépendances de contrat :** `US-G0-UX-001`, identité Console et capacité
  `guided.task.create`.
- **Dépendances de Gate :** aucune. Cette story n'est pas une dépendance de `US-G0-001`,
  `US-G0-002`, `US-G0-003` ni du `GO` Gate 0 actuel.
- **Ordre de livraison :** 2/3. Cette story suit la vérité de projection actuelle et précède toute
  personnalisation de l'Inbox, car elle produit le brouillon que celle-ci devra présenter comme
  action à compléter.
- **Scénario positif :** Étant donné un utilisateur authentifié et un brief court saisi dans
  `/tasks/new`, quand il choisit « préparer le brouillon », alors la Console crée ou enrichit
  une révision `draft` attribuée à son auteur, sans affecter un autre membre, avec la provenance de
  capture et les champs inconnus explicitement signalés.
- **Scénario négatif :** Étant donné une capture rapide, une mention, une assignation ou un message
  de canal, quand aucune révision courante validée et aucune décision requise n'existent, alors la
  Console ne crée ni tentative, ni thread de mission, ni appel Hermes ; toute tentative de contourner
  ce passage reçoit un refus stable et audité.
- **Preuves attendues :** `P-INT` montrant création/idempotence du brouillon et provenance ;
  `P-SEC` démontrant l'absence de tentative/run après capture et le refus du contournement ; `P-E2E`
  avec identifiants corrélés capture → tâche → révision, puis vérification des compteurs de tentative
  et d'appels Hermes à zéro.
- **Limites :** le Web est le premier périmètre. Un futur canal peut capturer le même brief, mais ne
  peut ni valider le plan, ni autoriser un outil, ni rendre une décision fonctionnelle. La capture
  n'est pas une affectation et n'introduit pas d'assignee picker.
- **Reviewer :** responsable produit et reviewer sécurité.

## US-G0-INBOX-001 — Projeter les actions visibles sans devenir un tracker

> En tant que **membre autorisé**, je veux voir les tâches et missions accessibles qui appellent un
> suivi, afin de décider, reprendre ou les consulter sans parcourir des logs Hermes.

- **État :** `VÉRIFIÉE LOCALEMENT, NON ACCEPTÉE` — les tests purs couvrent le brouillon, le contexte
  projet, le wording partagé, les personas de création et les deux sources dégradées. Un navigateur
  réel sur `127.0.0.1:1420` confirme aussi le header partagé, deux brouillons dans leur section, le
  libellé projet humain et la navigation de création pour la persona courante. Le P-E2E des personas
  négatifs et des sources dégradées, ainsi que la revue d'acceptation, restent absents.
- **Dépendances de contrat :** `US-G0-TASK-001`, `US-G0-APPROVAL-001`.
- **Ordre de livraison :** 1/3. Préserver d'abord la projection des objets source, puis ajouter la
  capture optionnelle et, séparément, l'affectation personnelle.
- **Scénario positif — projection :** Étant donné les index autorisés de tâches guidées et de
  missions, quand une décision, une reprise ou une exécution en cours est présente, alors l'Inbox
  projette une ligne qui mène vers l'objet source et n'écrit aucun état propre.
- **Scénario positif — brouillon :** Étant donné une tâche au statut `draft`, quand la projection se
  rend, alors elle apparaît sous « Brouillons à compléter », jamais sous « En cours, rien à faire ».
- **Scénario positif — contexte lisible :** Étant donné une tâche liée à un projet autorisé, quand
  la projection se rend, alors elle affiche le libellé humain du projet fourni par le résumé serveur,
  jamais son identifiant interne.
- **Scénario positif — wording partagé :** Étant donné l'absence d'affectation personnelle serveur,
  quand un membre ouvre la projection, alors les titres et libellés décrivent une file partagée par
  rôle/capacité, sans « votre signature », « en attente de vous » ni autre formulation personnelle.
- **Scénario négatif — persona :** Étant donné une persona qui ne possède que `thread.create` ou
  seulement `guided.task.create`, quand la navigation et l'Inbox se rendent, alors elles n'exposent
  pas une création vouée au refus et ne masquent pas une création autorisée.
- **Scénario négatif — source :** Étant donné une action réservée à un autre rôle ou une source
  partiellement indisponible, quand un membre charge ou ouvre l'Inbox, alors aucun CTA interdit n'est
  promis, aucune action de read/archive/subscription n'est simulée, aucune tentative Hermes ne
  démarre et l'incomplétude est visible sans masquer l'autre source.
- **Preuves attendues :** `P-UNIT` de projection et de matrice rôle/capacité ; `P-E2E` de la source
  dégradée, de la navigation vers l'objet source, des deux personas de création, des trois AC
  (brouillon, libellé projet, wording partagé) et de l'absence de lancement Hermes.
- **Limites :** l'Inbox actuelle est une projection client par rôles/capacités, non une Inbox
  personnelle ou assignée. Elle ne possède ni table Inbox propre, ni état read/archive/subscription ;
  elle consomme les résumés paginés `GET /api/guided/tasks` et `GET /api/inbox/missions`.
  Elle n'est pas un backlog, un board, un journal d'événements ni un sélecteur d'agent. La preuve
  navigateur courante ne remplace ni le P-E2E multi-persona et de source dégradée, ni la revue
  d'acceptation. Ces limites ne requalifient ni `US-G0-UX-001`, ni `US-G0-TASK-001`, ni
  `US-G0-DELIVERY-001`.
- **Reviewer :** responsable produit, développeur backend et reviewer sécurité.

## US-G0-INBOX-002 — Afficher les actions personnelles depuis un résumé serveur

> En tant que **membre explicitement affecté**, je veux voir uniquement les actions que la Console
> m'a attribuées, afin de savoir ce qui attend réellement mon intervention sans transformer l'Inbox
> en système d'assignation.

- **État :** `PROPOSÉE` — cible optionnelle, non bloquante pour Gate 0 : les deux résumés techniques
  paginés existent, mais aucun index ou résumé serveur personnel, realtime ni P-E2E à deux comptes
  n'est livré par la projection actuelle.
- **Dépendances de contrat :** `US-G0-INBOX-001` ; `US-G0-UX-004` uniquement pour rendre visible un
  brouillon issu d'une capture rapide.
- **Dépendances de Gate :** aucune. Cette story n'est pas une dépendance de `US-G0-001`,
  `US-G0-002`, `US-G0-003` ni du `GO` Gate 0 actuel.
- **Ordre de livraison :** 3/3. Cette story ne peut pas requalifier a posteriori la file partagée par
  rôle/capacité de `US-G0-INBOX-001` comme une Inbox personnelle.
- **Scénario positif :** Étant donné un résumé serveur paginé et temps réel qui lie explicitement un
  membre à une action, quand ce membre ouvre l'Inbox, alors il voit l'item avec un libellé de projet
  humain, les brouillons sous « Brouillons à compléter » et les autres actions dans leur section
  métier, jamais sous « En cours, rien à faire ».
- **Scénario négatif :** Étant donné un membre habilité par son rôle mais non affecté à l'action,
  quand il ouvre l'Inbox, alors il ne voit jamais « en attente de vous » pour cet item, ne reçoit
  aucun CTA de décision/reprise et ne peut pas provoquer de tentative Hermes par cette lecture.
- **Preuves attendues :** `P-INT` de l'attribution, de la pagination et du flux realtime ; `P-E2E`
  à deux comptes montrant affecté/non affecté, brouillon à compléter, état source dégradé et absence
  de run Hermes à l'ouverture ; audit corrélé membre → action → objet source.
- **Limites :** l'affectation est une donnée d'orientation serveur, non un picker d'assignee, une
  colonne Kanban ou une permission de décider. Les rôles et décisions restent évalués par la Console
  au moment de l'action.
- **Reviewer :** responsable produit, développeur backend et reviewer sécurité.

## Mise en œuvre et preuve actuelles

La projection actuelle compose deux résumés paginés conditionnés par capacité et isole leurs pannes
(`apps/web/src/loaders.ts`). Elle ne persiste pas l'Inbox ; les résumés serveur sélectionnent les
tâches et missions applicables, et celui des tâches porte déjà le nom humain du projet
(`apps/web/src/lib/inbox.ts`). Les décisions et reprises sont ensuite filtrées par la combinaison
rôle/capacité. Les tests de projection, loader et pagination sont locaux ; ils ne démontrent ni
attribution serveur, ni realtime, ni parcours navigateur à deux comptes.

La tentative guidée courante est distincte de l'ancien chemin de thread :
`POST /api/guided/tasks/:taskId/attempts` vérifie le mandat et lance le worktree/sandbox Hermes
(`apps/server/src/modules/guided-task/delivery.ts:164-224, 271-318`). La constante historique
`GUIDED_EXECUTION_ISOLATED` et le refus de `POST /api/threads` ne décrivent pas ce chemin et ne
doivent pas être utilisés pour dégrader son état.
