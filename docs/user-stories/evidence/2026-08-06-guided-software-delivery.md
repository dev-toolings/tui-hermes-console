# Preuve locale — workflow guidé de livraison logicielle

- Date : 06-08-2026
- Stories : `US-G0-UX-001..003`, `US-G0-TASK-001`, `US-G0-DELIVERY-001`,
  `US-G0-APPROVAL-001`, tranche navigateur de `US-G0-MOBILE-001`
- Environnement : dépôt local, PostgreSQL local et éphémère Docker, Hermes Agent 0.20.0,
  Bubblewrap, navigateur Ghostchrome
- Verdict technique : `VÉRIFIÉE LOCALEMENT, NON ACCEPTÉE`
- Reviewer indépendant : non renseigné

## Portée vérifiée

Le parcours cœur Web fonctionne sans Telegram ni Buzz : création d'une tâche durable, révisions
immuables, plan validé, décisions attribuées, dépôt et commit gelés, tentative Git/Bubblewrap,
exécution Hermes réelle, diff, quatre vérifications Bun sans réseau, artefacts SHA-256, validation
fonctionnelle et nettoyage. Aucun commit, push, PR ou déploiement n'a été créé.

Les adaptateurs Telegram et Buzz restent optionnels et non livrés. Aucun identifiant de canal n'a
été requis pour les tests du core.

## Exécution de bout en bout réelle

Tâche principale :

- tâche `task_56010e83-3a93-45da-99d1-fad3e37bf797`, état final `completed` ;
- 5 révisions persistées, révision courante
  `taskrev_1b48beeb-8d4b-49c1-b747-a27c8e875b4e` ;
- 6 tentatives conservées dans l'historique ;
- tentative verte `attempt_1e9243e1-aa45-45d1-83c3-d72281d30d15` ;
- commit de base `673596a9be753d089eb0154e918860ab00654df6` ;
- fichier proposé : `README.md`, statut Git `M` ;
- décision fonctionnelle attribuée `taskdec_88832a6c-2d45-4247-95d1-d7f7b6a04355` ;
- replay exact de la décision fonctionnelle : une seule ligne persistée.

Les vérifications de la tentative 6, exécutées avec le réseau désactivé dans Bubblewrap :

| Commande configurée | Code | Durée |
|---|---:|---:|
| `bun run test` | 0 | 1 689 ms |
| `bun run typecheck` | 0 | 7 387 ms |
| `bun run lint` | 0 | 7 337 ms |
| `bun run build` | 0 | 13 589 ms |

Les huit preuves persistées (`hermes_output`, `summary`, `preview`, `commands`, `tests`, `files`,
`diff`, `cleanup`) portent chacune une empreinte SHA-256. L'état `evidenceComplete=true` n'a été
posé qu'après les quatre codes de sortie positifs.

## Corrections réellement observées

Le pipeline a échoué fermé avant de devenir vert :

1. runtime Python Hermes non monté dans le namespace ;
2. sortie Hermes sans modification vérifiable ;
3. résolution DNS absente dans le namespace ;
4. dépendances du worktree non accessibles ;
5. cache Vite placé sur un montage en lecture seule.

Chaque cause a produit une tentative `failed` conservée. Les corrections ont ajouté le runtime UV en
lecture seule, la cible réelle de `/etc/resolv.conf`, les `node_modules` vérifiés en lecture seule et
un `tmpfs` limité aux caches éphémères. La tentative 6 est la première à satisfaire tout le contrat ;
aucune tentative rouge n'a été requalifiée.

## Tests positifs et négatifs

- `P-UNIT` : contrat de demande, six frontières sensibles, révocation par décision ultérieure,
  impossibilité d'accepter sans preuves complètes.
- `P-INT` PostgreSQL : révisions immuables, idempotence tâche/révision/décision, attribution
  approver, refus cross-site, refus fonctionnel sans preuve puis replay réseau sans doublon.
- `P-SEC` : commandes limitées à des argv `bun`/`bunx`, métacaractères et `npm` refusés, root hôte
  non modifiable, liens symboliques refusés, capabilities supprimées, réseau coupé pour les tests.
- `P-INT` production : les six tables guidées sont classées dans la frontière owner/runtime et le
  rôle runtime ne reçoit que le DML attendu.
- `P-E2E` : parcours Ghostchrome demande → résultat attendu → plan → URL durable
  `/tasks/task_1c9b3ea3-581a-462b-a1bc-a60e8a3773f5`, puis consultation de la tâche terminée.
- 320 px : `innerWidth=320`, `scrollWidth=320`, aucun contrôle requis sous 44 px, détails techniques
  fermés et aucun texte shell visible dans la vue normale.

Validation finale du dépôt :

- `bun run test` : 626 pass, 3 skip déclarés, 0 fail ;
- `bun run typecheck` : succès sur core, server et web ;
- `bun run lint` : succès, 3 warnings préexistants hors parcours guidé ;
- `bun run build` : succès Vite ;
- `git diff --check` : succès.

## Observations d'interface

Les deux captures d'origine ont été retirées du dépôt le 08-08-2026. Elles sont conservées hors Git,
avec leur empreinte ci-dessous, pour deux raisons : la règle projet interdit de versionner des
images, et la capture desktop exposait en clair le nom et l'adresse électronique de l'opérateur,
ce que la section « Identifiants de corrélation » de [CONVENTIONS.md](../CONVENTIONS.md) interdit.

Ce qui était observable sur le résultat desktop, `sha256
ab0894d32f66495a96b532de5cf72e6bfdce2338c1e059714800491d51b904fd` :

- en-tête « TÂCHE GUIDÉE », titre de la tâche, mention « Projet relié · révision 5 · préparée par
  admin » et badge d'état « Terminée » ;
- les quatre étapes toutes cochées : « 1. Demande cadrée », « 2. Décisions préparées »,
  « 3. Réalisation isolée », « 4. Résultat vérifié » ;
- le bloc « Mandat validé » avec Objectif, Résultat attendu et Hors périmètre renseignés ;
- « Résultat de la tentative 6 » avec le badge « Vérifications réussies », la phrase « La proposition
  respecte le mandat et toutes les vérifications configurées ont réussi », et le fichier `README.md`
  comme seul fichier touché ;
- les trois décisions distinctes en colonne de droite, chacune au statut « Approuvée » : « Validation
  du plan », « Approbation d'outil » et « Validation fonctionnelle », avec leur libellé métier ;
- le repli « Détails techniques exhaustifs » fermé par défaut, donc aucun shell exposé en vue normale ;
- l'état runtime « Connecté · 0.20.0 » sur `127.0.0.1:8642`, avec la mention « Token en place ».

Ce qui était observable sur le rendu à 320 px, `sha256
2e59e51817b0bbd9d4fb2831d3f49c4342c1e4487457ac3580f2a91959d98183` :

- aucune coupure horizontale ni défilement latéral à 320 px de large ;
- le titre de la tâche passe sur cinq lignes sans troncature, la ligne de métadonnées se replie ;
- les quatre étapes s'empilent verticalement, chacune conservant sa coche et son libellé complet ;
- le bloc « Mandat validé » reste lisible et l'en-tête reste accessible.

## Nettoyage

Les worktrees et homes éphémères ont été supprimés. Les six branches techniques créées pendant le
diagnostic pointaient toutes sur le commit de base et ont été supprimées après vérification ; elles
ne contenaient aucun commit unique. Le cleanup courant supprime désormais worktree, home et branche.
Les sessions Ghostchrome de preuve sont arrêtées à la fin de la validation.

## Écarts encore ouverts

- aucun reviewer indépendant ni demandeur métier distinct n'a signé la preuve ;
- aucun appareil physique iOS/Android ni lecteur d'écran n'a été utilisé ;
- la reprise réseau est prouvée par idempotence PostgreSQL et clés UI stables, pas par une coupure
  radio sur appareil réel ;
- la preview est textuelle avec diff/fichiers, sans URL de déploiement ;
- Telegram/Buzz ne sont pas intégrés et aucun credential de canal n'était disponible ou nécessaire ;
- pas de PR, CI distante, push ou déploiement dans cette tranche.

## Verdict

`VÉRIFIÉE LOCALEMENT, NON ACCEPTÉE` : le workflow cœur est exécuté et prouvé, mais les écarts
ci-dessus interdisent de marquer les stories `ACCEPTÉES` ou la Gate 0 terminée.
