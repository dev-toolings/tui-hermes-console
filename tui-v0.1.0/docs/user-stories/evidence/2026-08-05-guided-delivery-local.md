# Preuve locale — parcours guidé et garde d’isolation

**Date :** 05-08-2026
**Branche :** `feat/guided-software-delivery`
**Environnement :** Console locale, Hermes `0.20.0`, accès direct `127.0.0.1:8642`, authentification locale de développement via le contrôle `Skip`.

## Verdict

- Le parcours desktop demande → résultat attendu → compréhension → plan est vérifié avec Ghostchrome.
- Le plan à faible risque affiche une mise en attente et le bouton `Réalisation isolée indisponible` est désactivé.
- L’API refuse aussi le contournement avec `409 GUIDED_EXECUTION_NOT_ISOLATED` avant l’accès au runtime.
- Le viewport 320 px reste à rejouer : la commande de redimensionnement Ghostchrome n’a pas persisté sur la session et n’est pas comptée comme preuve.

Capture retirée du dépôt le 08-08-2026, conservée hors Git : plan guidé et garde fail-closed,
`sha256 9bc212c9ecedcc34b4a9efeea8785cce880dedf700c01593ed1adc9f230eec37`. Ce rapport est de toute
façon remplacé par la preuve du 06-08-2026, qui couvre le viewport 320 px resté ouvert ici.

## Parcours navigateur

1. Ouvrir la Console sans session : redirection vers le setup.
2. Utiliser `Connexion locale · développement` (`Skip` d’authentification).
3. Vérifier la redirection par défaut vers `/tasks/new`.
4. Choisir `Ajouter une fonctionnalité`.
5. Saisir une demande synthétique d’email après annulation, son résultat observable, ses exclusions,
   son audience et un exemple.
6. Vérifier la reformulation, le plan en quatre étapes, le risque faible et les limites techniques.
7. Vérifier le message de mise en attente et le contrôle de lancement désactivé.

La base contenait un seul thread `software_delivery`, créé lors du diagnostic initial à `17:05:19Z`.
Après le rejeu final à `17:11Z`, le maximum `created_at` est resté inchangé et aucun run guidé actif
n’existait : la page finale n’a donc créé ni thread ni run.

Après collecte des preuves, le thread synthétique a été supprimé via `DELETE /api/threads/:id` : la
réponse a confirmé `deleted: true`, une session Hermes supprimée et un workdir purgé. Le compte DB
du thread est revenu à zéro et son dossier de run n’existe plus.

## Incident découvert pendant la recette

La première version lançait directement Hermes. Le run de diagnostic
`run_106071c66cd24fc89cda8e5e8e350824` a été arrêté dès que le runtime configuré a inspecté un autre
projet. Son état PostgreSQL final est `cancelled`.

Avant l’arrêt effectif, Hermes avait appliqué deux patchs dans le dépôt configuré
`iautos/apps/api`. Les deux changements ont été retirés ligne par ligne, puis `git diff --exit-code`
a confirmé le retour exact à l’état Git pour :

- `src/Feature/Payment/Application/Service/SubscriptionService.php` ;
- `templates/emails/subscription_canceled.html.twig`.

Cause vérifiée : `ensureRunWorkdirs()` crée un espace d’artefacts et `runs.workdir` le mémorise, mais
`executeAgentRun()` ne transmet aucun cwd à `createHermesAgentRun()`. Le runtime conserve donc son
`terminal.cwd` global ; ce workdir ne constitue pas une sandbox de code. La correction choisie est
fail-closed jusqu’à une isolation par tâche démontrée.

## Contrôles automatisés

~~~text
bun test apps/server/src/api/threads/route.test.ts packages/console-core/src/modules/guided-task/spec.test.ts
7 pass · 0 fail

bun run typecheck
console-core · server · web : exit 0

bun run lint
exit 0 · trois warnings préexistants hors du slice

bun run test
609 pass · 3 skip · 0 fail

bun run build
exit 0

git diff --check
exit 0
~~~

Les tests API couvrent séparément l’authentification/suppression nécessitant une validation technique
et la demande à faible risque refusée faute de sandbox.

## Limites restantes

- pas de persistance autonome du brouillon ou de la révision de spec ;
- pas de dépôt connecté, commit de base, branche, diff, tests ou preview ;
- progression `software_delivery` présente dans le code mais non activée avant la sandbox ;
- validation technique complète et viewport 320 px encore ouverts.
