# Gate 0 — Validation commerciale

**Reviewer final :** responsable produit avec accord du partenaire concerné.

**Critère de sortie :** preuve d'un workflow utile et engagement payant avant tout investissement
fleet.

## Frontière d'expérimentation

La Gate 0 autorise la découverte et des essais supervisés dans une sandbox isolée, avec identifiants
et données synthétiques. Elle n'autorise pas un pilote sur une production cliente ni des données
sensibles. Un tel pilote exige d'abord les protections minimales applicables de Gate 1 : durabilité,
confinement, avertissement IA et, pour une cible distante, parcours SSH sécurisé. La Gate 0 peut être
acceptée commercialement sans prétendre que ces protections opérationnelles sont déjà livrées.

La Gate 0 distingue le **parcours cœur**, obligatoire pour sa décision, des **adaptateurs de canal**
optionnels. Le parcours cœur reste utilisable depuis le Web mobile sans dépendre de Telegram, Buzz
ou d'une application native. Telegram peut ensuite alimenter un brouillon et Buzz peut relayer la
collaboration, mais ni l'un ni l'autre ne devient l'autorité de la tâche, de l'exécution ou des
décisions.

## US-G0-UX-001 — Cadrer une demande avant exécution

> En tant que **demandeur métier**, je veux choisir une intention et valider le résultat attendu, les
> exclusions et le plan, afin qu’aucune réalisation ne commence sur une demande implicite.

- **État :** `VÉRIFIÉE LOCALEMENT, NON ACCEPTÉE` — desktop, persistance et navigateur 320 px prouvés ;
  reviewer métier indépendant et appareil physique ouverts.
- **Dépendances :** auth locale ou session utilisateur valide, capacité `thread.create`.
- **Scénario positif :** Étant donné un utilisateur sans vocabulaire technique, quand il choisit une
  intention, décrit un objectif, un résultat observable et un hors-périmètre, alors la Console affiche
  une compréhension et un plan avant de proposer le lancement.
- **Scénario négatif :** Étant donné un objectif trop court, un résultat absent ou aucun hors-périmètre,
  quand l’utilisateur tente de continuer, alors le contrôle reste désactivé et aucune requête de
  création de mission n’est émise.
- **Tests :** `P-UNIT` du contrat de spec, `P-E2E` navigateur desktop et 320 px.
- **Preuves attendues :** rapport daté avec parcours Ghostchrome, description observable des trois
  étapes et absence de requête prématurée. Les captures ne sont pas versionnées : elles restent hors
  dépôt et le rapport porte leur empreinte `sha256`, conformément à la décision du 08-08-2026. La reprise persistante et l'identifiant de tâche relèvent de
  `US-G0-TASK-001`.
- **Reviewer :** responsable produit, avec un demandeur métier distinct de l’implémenteur.

## US-G0-UX-002 — Refuser une exécution non isolée

> En tant que **demandeur métier**, je veux que la Console mette ma tâche en attente si les outils ne
> sont pas réellement isolés, afin qu’une validation de plan ne puisse pas modifier un autre projet.

- **État :** `VÉRIFIÉE LOCALEMENT`.
- **Dépendances :** US-G0-UX-001.
- **Scénario positif :** Étant donné un setup terminé via le skip d’authentification, quand un plan à
  faible risque est validé sans sandbox par tâche, alors l’interface affiche la mise en attente et ne
  propose aucun lancement.
- **Scénario négatif :** Étant donné un appel direct à `POST /api/threads` avec une demande guidée,
  quand le client tente de contourner l’interface, alors l’API répond `409
  GUIDED_EXECUTION_NOT_ISOLATED` avant tout accès runtime et ne crée aucun run.
- **Tests :** `P-UNIT` API fail-closed, `P-E2E` Ghostchrome avec skip auth.
- **Preuves attendues :** rapport daté, bouton désactivé, réponse API 409 et compte de threads guidés
  inchangé.
- **Reviewer :** développeur backend et reviewer sécurité.

## US-G0-UX-003 — Divulguer progressivement l’exécution

> En tant que **demandeur métier**, je veux suivre compréhension, préparation, réalisation et
> vérification, afin de connaître l’état sans lire les logs ou les événements Hermes.

- **État :** `VÉRIFIÉE LOCALEMENT, NON ACCEPTÉE` — progression activée sur une tentative Hermes réelle,
  vue normale sans shell et artefacts complets à la demande.
- **Dépendances :** US-G0-UX-002 et US-G0-DELIVERY-001.
- **Scénario positif :** Étant donné une mission `software_delivery`, quand son statut évolue, alors
  les quatre étapes affichent un état textuel cohérent et les détails techniques restent accessibles.
- **Scénario négatif :** Étant donné une mission générale ou un chat, quand l’écran s’ouvre, alors la
  progression de livraison logicielle n’est pas affichée artificiellement.
- **Tests :** `P-UNIT` des états, `P-E2E` navigateur avec inspection des détails techniques.
- **Preuves attendues :** capture avant et après état terminal, statut runtime corrélé.
- **Reviewer :** responsable produit et développeur frontend.

La progression est corrélée à la tentative persistée ; sa preuve datée inclut la sandbox et les
vérifications, sans valoir acceptation produit indépendante.

## US-G0-TASK-001 — Persister la tâche et ses révisions

> En tant que **demandeur métier**, je veux retrouver une tâche avec sa demande, son projet, son plan
> et ses tentatives, afin qu'une fermeture de page ou une correction ne perde pas le contrat validé.

- **État :** `VÉRIFIÉE LOCALEMENT, NON ACCEPTÉE` — agrégat PostgreSQL, révisions immuables, reprise,
  correction, idempotence et isolation site/projet prouvés.
- **Dépendances :** US-G0-UX-001 et frontière site/projet disponible pour le pilote.
- **Scénario positif :** Étant donné un brouillon suffisamment renseigné, quand l'utilisateur
  l'enregistre puis valide une nouvelle révision du plan, alors la Console conserve un identifiant de
  tâche stable, le projet, l'auteur, les révisions immuables de spécification et les tentatives liées.
- **Scénario négatif :** Étant donné deux projets ou une révision antérieure, quand un utilisateur
  recharge, change de périmètre ou tente de lancer une ancienne version, alors aucun contenu ne fuit
  entre projets et seule la révision explicitement validée peut devenir le mandat d'une mission.
- **Tests :** `P-UNIT` transitions de révision, `P-INT` PostgreSQL/ownership, `P-E2E` création,
  rechargement et correction, `P-SEC` accès croisé et révision falsifiée.
- **Preuves attendues :** identifiant de tâche, historique des révisions, projet et acteurs corrélés,
  reprise après fermeture, refus cross-project et preuve qu'aucun run ne précède la validation.
- **Reviewer :** développeur backend, responsable produit et reviewer sécurité.

## US-G0-DELIVERY-001 — Produire une modification vérifiable

> En tant que **demandeur métier**, je veux recevoir une preview ou une démonstration accompagnée des
> scénarios vérifiés, afin de juger le résultat sans devoir lire une pull request.

- **État :** `VÉRIFIÉE LOCALEMENT, NON ACCEPTÉE` — Hermes et Bubblewrap réels, diff, fichiers, tests,
  preview textuelle, artefacts SHA-256 et cleanup prouvés ; preview déployée et reviewer ouverts.
- **Dépendances :** US-G0-TASK-001, US-G0-UX-001..002, dépôt connecté et sandbox bornée.
- **Scénario positif :** Étant donné un dépôt de test et une tâche validée, quand la réalisation se
  termine, alors la Console fige la révision de spécification et le commit de base, exécute une
  tentative isolée, puis fournit diff, tests, fichiers, preview disponible et résumé métier.
- **Scénario négatif :** Étant donné des tests en échec ou une preuve absente, quand Hermes termine,
  alors le résultat n’est jamais présenté comme vérifié ; une commande hors dépôt ou une évasion de
  sandbox est refusée avant effet.
- **Tests :** `P-INT` Git/runner, `P-E2E` dépôt synthétique, `P-SEC` évasion de sandbox.
- **Preuves attendues :** révision de spécification, commit de base, branche/tentative, diff,
  commandes, sorties, URL de preview, artefacts et nettoyage.
- **Reviewer :** développeur indépendant et demandeur métier.

## US-G0-APPROVAL-001 — Séparer validation fonctionnelle et technique

> En tant que **responsable de projet**, je veux appliquer deux validations selon la nature du
> changement, afin qu’un accord métier ne puisse pas autoriser une migration, une dépendance ou une
> modification d’authentification.

- **État :** `IMPLÉMENTÉE, VÉRIFIÉE LOCALEMENT, NON ACCEPTÉE` — décisions plan, technique, outil et
  fonctionnelle séparées ; deux comptes navigateur et revue sécurité indépendants ouverts.
- **Dépendances :** US-G0-TASK-001 et US-G0-DELIVERY-001 ; les fondations RBAC et policy
  fail-closed doivent être disponibles dans l'environnement pilote sans prétendre que Gate 1 ou
  Gate 2 est acceptée.
- **Scénario positif :** Étant donné un changement de texte sans risque, quand le métier valide, alors
  la politique peut autoriser la livraison sans revue technique obligatoire.
- **Scénario négatif :** Étant donné une migration, une suppression, une dépendance, un paiement ou
  une modification d’authentification, quand seul le métier valide, alors la livraison reste bloquée
  et demande un développeur habilité.
- **Tests :** `P-UNIT` matrice, `P-INT` rôles, `P-E2E` deux comptes, `P-SEC` contournement.
- **Preuves attendues :** décisions attribuées, policy versionnée et refus sans effet de bord.
- **Reviewer :** reviewer sécurité et responsable produit.

## US-G0-MOBILE-001 — Piloter le parcours cœur depuis un mobile

> En tant que **demandeur ou approbateur mobile**, je veux cadrer une tâche, lire son résultat et
> prendre la décision qui m'appartient depuis mon téléphone, afin de ne pas dépendre d'un poste fixe.

- **État :** `IMPLÉMENTÉE, PARTIELLEMENT VÉRIFIÉE` — navigateur 320 px, cibles tactiles et
  idempotence PostgreSQL prouvés ; appareil physique, coupure radio et reviewer accessibilité ouverts.
- **Dépendances :** US-G0-UX-001..003, US-G0-DELIVERY-001 et US-G0-APPROVAL-001.
- **Scénario positif :** Étant donné un viewport de 320 px et un appareil tactile, quand un demandeur
  crée une tâche puis qu'un approbateur consulte les preuves et décide, alors aucun contrôle requis
  n'est masqué, aucun défilement horizontal n'est nécessaire et la décision est attribuée.
- **Scénario négatif :** Étant donné une preuve technique volumineuse, un réseau interrompu ou une
  décision sensible, quand l'utilisateur agit depuis le mobile, alors l'interface ne tronque pas le
  sens, ne double pas la mutation et ne remplace jamais une validation technique requise.
- **Tests :** `P-E2E` navigateur 320 px et appareil réel, navigation clavier/tactile, coupure/reprise
  réseau et mutation idempotente.
- **Preuves attendues :** captures création/plan/résultat/décision, absence d'overflow, identifiants de
  mutation corrélés et test de reprise.
- **Reviewer :** demandeur métier distinct, approbateur distinct et reviewer accessibilité.

## US-G0-001 — Qualifier trois design partners

> En tant que responsable produit, je veux qualifier trois PME, agences ou intégrateurs réunissant un
> demandeur métier et un développeur, afin de tester la réduction de traduction entre besoin et
> livraison logicielle.

- **Dépendances :** aucune.
- **Acceptation positive :** Étant donné la grille ICP du PRD, quand trois organisations sont
  interviewées, alors chacune documente le demandeur, le développeur disponible, le dépôt pilote, le
  changement borné, le décideur, le budget, la douleur actuelle et les contraintes de données.
- **Acceptation négative :** Étant donné un prospect sans produit logiciel, sans revue technique
  disponible ou cherchant seulement un chat/agent de code, quand il est évalué, alors il n'est pas
  compté parmi les trois partenaires.
- **Preuves :** `P-COM`, trois fiches expurgées, consentement au pilote, raisons de qualification ou
  rejet. Grille de qualification et gabarit de fiche : [guides/G0-001-QUALIFICATION-PARTENAIRE.md](guides/G0-001-QUALIFICATION-PARTENAIRE.md).
- **État initial :** `PROPOSÉE`.

## US-G0-002 — Piloter un workflow étroit par partenaire

> En tant que binôme partenaire, je veux piloter une modification logicielle supervisée et peu risquée
> dans une sandbox représentative, afin de mesurer la valeur sans masquer le travail manuel.

- **Dépendances :** US-G0-001, US-G0-TASK-001, US-G0-DELIVERY-001,
  US-G0-APPROVAL-001 et US-G0-MOBILE-001.
- **Acceptation positive :** Étant donné un workflow borné, des données synthétiques et une sandbox
  isolée, quand il est exécuté de bout en bout,
  alors la tâche, sa révision, la mission, les interventions, les validations fonctionnelle et
  technique, le résultat et les preuves sont corrélés et le demandeur confirme l'utilité.
- **Acceptation négative :** Étant donné une action destructive, un usage à haut impact, des données
  sensibles, une production cliente avant les protections Gate 1 ou un périmètre non borné, quand il
  est proposé, alors le pilote le refuse ou le réduit avant exécution.
- **Preuves :** `P-COM`, `P-E2E`, protocole par partenaire, rapport de mission expurgé, incidents et
  reprises manuelles.
- **État initial :** `PROPOSÉE`.

## US-G0-003 — Décider sur des métriques et un engagement payant

> En tant que responsable produit, je veux une décision commerciale falsifiable, afin de ne pas
> construire la fleet sur une demande supposée.

- **Dépendance :** US-G0-002.
- **Acceptation positive :** Étant donné trois pilotes, quand la revue est tenue, alors sont mesurés
  temps de cadrage, temps jusqu'au résultat vérifiable, taux d'états terminaux cohérents, corrections,
  interventions manuelles, coût de support, valeur perçue et engagement financier signé.
- **Acceptation négative :** Étant donné l'absence d'engagement payant ou un besoin principalement
  hors positionnement, quand la revue est tenue, alors le verdict est `NO-GO` ou `PIVOT`, jamais un
  passage implicite à la Gate 1.
- **Preuves :** `P-COM`, tableau agrégé des métriques, objections, montant et durée de l'engagement,
  décision `GO/NO-GO/PIVOT`.
- **État initial :** `PROPOSÉE`.
