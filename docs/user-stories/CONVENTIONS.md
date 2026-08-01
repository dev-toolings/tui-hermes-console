# Conventions normatives

Les mots **DOIT**, **NE DOIT PAS**, **DEVRAIT** et **PEUT** sont employés au sens normatif. Une
exigence `DOIT` non prouvée bloque la story.

## Forme d'une story

Chaque story contient au minimum :

- un identifiant stable `US-G<n>-<nnn>` ou `US-G<n>-<domaine>-<nnn>` pour une epic décomposée ;
- un rôle, un besoin et une valeur ;
- un état ;
- les dépendances ;
- des scénarios Given/When/Then ;
- au moins un test positif et un test négatif ;
- les preuves attendues ;
- le reviewer habilité à accepter la story.

La phrase canonique est :

> En tant que **rôle**, je veux **capacité**, afin de **résultat observable**.

## Given / When / Then

- **Given / Étant donné** décrit un état initial contrôlé, sans cacher un prérequis.
- **When / Quand** décrit une seule action ou un seul événement déclencheur.
- **Then / Alors** décrit un résultat observable et mesurable.
- **And / Et** complète une clause sans introduire un second scénario.

Un scénario négatif doit démontrer le refus, l'absence d'effet de bord et la présence d'une trace
attribuée quand une frontière de sécurité est concernée.

## États autorisés

| État | Sens | Passage autorisé |
|---|---|---|
| `PROPOSÉE` | contrat rédigé, non estimé | vers `PRÊTE` |
| `PRÊTE` | dépendances identifiées, testable | vers `EN_COURS` |
| `EN_COURS` | implémentation active | vers `IMPLÉMENTÉE` ou `BLOQUÉE` |
| `IMPLÉMENTÉE` | code présent, preuves incomplètes | vers `VÉRIFIÉE` |
| `VÉRIFIÉE` | tous les tests exigés passent | vers `ACCEPTÉE` |
| `ACCEPTÉE` | reviewer habilité et rapport daté | état terminal positif |
| `BLOQUÉE` | obstacle et propriétaire documentés | retour vers `PRÊTE` ou `EN_COURS` |
| `REJETÉE` | besoin invalidé ou test décisif échoué | état terminal négatif |

`Livré`, `présent dans le code` ou `validé statiquement` ne sont pas des synonymes de `ACCEPTÉE`.

## Types de preuve

| Code | Preuve | Exigence minimale |
|---|---|---|
| `P-CODE` | code/revue | commit ou diff identifié, revue sans secret |
| `P-UNIT` | test unitaire | commande, version, résultat et nombre de tests |
| `P-INT` | intégration | services réels ou doubles explicitement nommés |
| `P-E2E` | parcours navigateur/API | scénario, environnement, horodatage et corrélation |
| `P-OPS` | exploitation réelle | redémarrage, panne, reprise ou restauration observée |
| `P-SEC` | sécurité négative | tentative interdite, refus, absence d'effet et audit |
| `P-COM` | validation commerciale | compte rendu signé, métriques agrégées et engagement |

Les preuves doivent être reproductibles. Une sortie de commande est copiée avec ses secrets
expurgés ; le code de sortie et le résultat attendu sont conservés.

## Identifiants de corrélation

Un rapport E2E utilise des identifiants synthétiques et relie au minimum :

`site/projet → utilisateur/rôle → agent → thread → run → décision → artefact → audit`.

Les identifiants réels peuvent être hashés dans le rapport, mais le mapping brut reste hors Git
dans le coffre ou le ticket d'exploitation autorisé.

## Tests positifs et négatifs

Pour toute mutation sensible :

1. le rôle autorisé réussit dans son périmètre ;
2. le rôle non autorisé reçoit un refus stable ;
3. la ressource reste inchangée après le refus ;
4. la décision et l'acteur sont audités ;
5. un retry ne duplique pas la mutation.

Pour toute opération distante :

1. la cible connue et autorisée réussit ;
2. une identité inconnue échoue ;
3. une empreinte d'hôte différente échoue ;
4. une coupure ferme ou réconcilie proprement la ressource ;
5. aucun secret n'apparaît dans les logs ou la ligne de commande.

## Dérogations

Une dérogation DOIT contenir : exigence concernée, raison, risque, mesures compensatoires,
propriétaire, date d'expiration et approbateur. Une dérogation ne PEUT PAS transformer un contrôle
non fail-closed en contrôle de sécurité revendiqué.
