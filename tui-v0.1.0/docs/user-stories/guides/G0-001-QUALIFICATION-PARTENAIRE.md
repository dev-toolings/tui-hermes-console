# Guide US-G0-001 : qualifier un design partner

But : produire les trois fiches `P-COM` exigées par `US-G0-001`. Ce guide ne remplace pas
l'entretien, il empêche seulement qu'une fiche soit incomplète au moment de la revue de Gate 0.

`US-G0-001` est la seule condition de Gate qui ne dépend techniquement de rien. Aucune preuve
technique supplémentaire ne la rapproche de son état terminal.

## Grille de qualification

Un prospect n'est comptabilisé parmi les trois partenaires que si les huit champs sont renseignés.
Un champ vide vaut rejet, pas report.

| # | Champ | Ce qui est recevable | Ce qui ne l'est pas |
|---|---|---|---|
| 1 | Demandeur métier | Une personne nommée qui décrit un résultat attendu et qui sera disponible pour valider | Un sponsor qui délègue à un tiers non identifié |
| 2 | Développeur disponible | Une personne capable de faire la revue technique, avec un temps annoncé | « On trouvera quelqu'un » |
| 3 | Dépôt pilote | Un dépôt Git réel, accessible, avec une suite de tests exécutable | Un projet sans tests, ou un dépôt qu'on ne peut pas partager |
| 4 | Changement borné | Une modification descriptible en une phrase, réalisable en une tentative | « Moderniser l'application » |
| 5 | Décideur | Qui signe l'engagement, nommément | Un comité sans date de réunion |
| 6 | Budget | Un ordre de grandeur annoncé et une échéance | « Si ça marche on verra » |
| 7 | Douleur actuelle | Le coût observé aujourd'hui, chiffré ou daté | Une curiosité pour l'IA |
| 8 | Contraintes de données | Hébergement, données personnelles, secteur régulé, exigences de conservation | Inconnu à l'issue de l'entretien |

## Critères de rejet immédiat

Trois profils ne sont pas comptés, même s'ils sont enthousiastes, et le motif est consigné :

1. l'organisation n'a pas de produit logiciel qui lui appartient ;
2. aucune revue technique n'est disponible côté partenaire ;
3. la demande porte sur un chat ou un agent de code, pas sur une livraison gouvernée.

Le troisième est le plus fréquent et le plus coûteux à découvrir tard. Poser tôt la question
« qui valide, et sur quelle preuve ? » le révèle en général en une minute.

## Gabarit de fiche

Une fiche par organisation, dans `docs/user-stories/evidence/`, nommée
`aaaa-mm-jj-g0-001-partenaire-<n>.md`. Aucun nom d'entreprise, aucun nom de personne, aucun contact
en clair : identifiants synthétiques, comme l'exige la section « Identifiants de corrélation » de
[CONVENTIONS.md](../CONVENTIONS.md). Le mapping réel reste hors Git.

~~~markdown
# US-G0-001 : fiche partenaire PARTNER-01

- Date d'entretien : jj-mm-aaaa
- Statut : QUALIFIÉ | REJETÉ | EN ATTENTE
- Secteur et taille : ...

## Les huit champs

1. Demandeur métier : rôle, disponibilité annoncée
2. Développeur disponible : rôle, temps annoncé
3. Dépôt pilote : langage, présence d'une suite de tests, mode d'accès
4. Changement borné : une phrase
5. Décideur : rôle
6. Budget : ordre de grandeur, échéance
7. Douleur actuelle : coût observé, chiffré ou daté
8. Contraintes de données : hébergement, données personnelles, conservation

## Verdict

Motif de qualification ou de rejet, en une phrase. Si REJETÉ, indiquer lequel des trois critères
de rejet s'applique.

## Consentement au pilote

Obtenu le jj-mm-aaaa | non obtenu. Portée du consentement, et ce qui a été explicitement exclu.
~~~

## Ce que la fiche prouve, et ce qu'elle ne prouve pas

Elle prouve qu'une conversation réelle a eu lieu et que le partenaire satisfait la grille ICP.
Elle ne prouve ni l'engagement payant, qui relève de `US-G0-003`, ni la faisabilité du changement,
qui relève de `US-G0-002`. Ne pas anticiper ces deux états sur la base d'un entretien favorable.

## Rattachement

Ajouter chaque fiche à [evidence/README.md](../evidence/README.md), puis renseigner la colonne
`Preuve` de `US-G0-001` dans [TRACEABILITY.md](../TRACEABILITY.md). L'état passe `VÉRIFIÉE` à trois
fiches qualifiées, jamais avant.
