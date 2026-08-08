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
| `GELÉE` | périmètre explicitement suspendu par décision produit ; aucun travail ni critère de Gate exigé | retour vers `PRÊTE` si le périmètre est rouvert |
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

### Registre des dérogations ouvertes

#### DER-001 : acceptation par un implémenteur unique, bornée à Gate 0

| Champ | Valeur |
|---|---|
| **Exigence concernée** | « le reviewer habilité à accepter la story » (§ Forme d'une story) et l'état `ACCEPTÉE`, qui exige un reviewer habilité distinct de l'implémenteur |
| **Raison** | L'équipe est réduite à une personne. L'historique git ne contient que deux adresses appartenant au même individu (`kev.aubree@gmail.com`, `kaubree@tilvest.com`). Sans dérogation, `ACCEPTÉE` est inatteignable par construction et la méthode entière reste sans état terminal positif |
| **Risque** | L'implémenteur signe sa propre acceptation. L'indépendance du jugement disparaît, avec un biais de complaisance sur les cas limites et les scénarios négatifs. Une acceptation obtenue sous DER-001 n'a pas la même valeur probante qu'une acceptation contradictoire, et ne DOIT pas être présentée comme telle à un tiers |
| **Mesures compensatoires** | 1. Périmètre borné aux stories Gate 0 sans frontière de sécurité et sans volet commercial. **Sont nommément exclues, y compris dans Gate 0 :** `US-G0-UX-002` (refus d'une exécution non isolée, reviewer sécurité), `US-G0-APPROVAL-001` (validations fonctionnelle et technique, reviewer sécurité), `US-G0-001`, `US-G0-002` et `US-G0-003` (volet commercial). Toute story Gate 1 ou Gate 2 est hors périmètre par construction, notamment `US-G1-002`, `US-G1-004`, `US-G1-005`, `US-G1-009` et les stories `US-G1-SSH-*`. 2. La preuve DOIT être rejouée à la date de l'acceptation, jamais reprise d'un rapport antérieur. **Quand une preuve couvre plusieurs stories, le rapport DOIT borner par écrit les sections resignées** et déclarer explicitement lesquelles ne le sont pas ; rejouer un document multi-stories ne vaut jamais acceptation des stories exclues qu'il couvre. 3. Le rapport DOIT contenir un scénario positif ET un scénario négatif, conformément au § Tests positifs et négatifs. 4. Une revue adversariale DOIT être exécutée et son compte rendu joint. **Sa portée est limitée et cette limite DOIT être écrite dans le rapport :** l'agent qui la conduit est lancé, cadré et interrompible par l'implémenteur, sur un périmètre que celui-ci a choisi. Elle ne constitue pas une revue indépendante et ne DOIT jamais être présentée comme telle. 5. Le rapport d'acceptation DOIT porter la mention « acceptée sous DER-001, sans revue contradictoire humaine » |
| **Propriétaire** | Propriétaire produit, compte git `kaubree@tilvest.com` |
| **Date d'expiration** | 08-11-2026. Au-delà, toute acceptation obtenue sous DER-001 doit être reconfirmée par un reviewer indépendant ou repasse en `VÉRIFIÉE` |
| **Approbateur** | Le propriétaire produit lui-même. Cette auto-approbation est la faiblesse assumée de la dérogation et la raison de son périmètre étroit et de son expiration courte |

Ouverte le 08-08-2026.
