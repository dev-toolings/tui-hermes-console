# Revue adversariale — US-G0-UX-001

- Date : 08-08-2026
- Cible : preuve courante de `US-G0-UX-001` sous `DER-001`
- Reviewer exécutant : agent Codex piloté par l'implémenteur
- Indépendance : aucune ; limite explicitée ci-dessous
- Verdict : aucun écart bloquant dans le périmètre de `US-G0-UX-001`

## Attaques tentées

| Hypothèse attaquée | Vérification | Résultat |
|---|---|---|
| Un objectif trop court pourrait créer une tâche malgré le bouton grisé | objectif `Court`, état DOM du bouton, compteur PostgreSQL avant/après | `disabled=true`, `guided_tasks=2` avant et après |
| L'écran de plan pourrait masquer une exécution déjà commencée | corrélation de la tâche synthétique avec `guided_task_attempts` et les `runs` créés depuis la tâche | `0` tentative, `0` run |
| Une ancienne preuve pourrait être resignée sans rejeu | comparaison de date et nouveau parcours dans un navigateur nommé neuf | rejeu daté du 08-08-2026, captures et tâche synthétique nouvelles |
| La preuve pourrait étendre silencieusement `DER-001` | contrôle des stories nommées dans le rapport | seule `US-G0-UX-001` est resignée ; `UX-002` et `APPROVAL-001` sont explicitement exclues |
| Les captures pourraient exposer l'identité réelle | inspection visuelle des trois captures finales | identité remplacée dans le DOM par une valeur synthétique ; aucun secret visible |
| Le contrôle UI pourrait diverger du contrat du core | exécution du test de `isGuidedDraftReady` et lecture du seuil courant | seuils `12/8/3`, `5 pass`, `0 fail` |

## Limites et risques résiduels

- La preuve négative porte sur le parcours UI contractuel de `UX-001`, pas sur une frontière de
  sécurité API. Le contournement API appartient aux stories de sécurité exclues de `DER-001`.
- Le navigateur est desktop ; l'acceptation ne resigne pas la tranche mobile ni un appareil physique.
- Le setup a créé un agent synthétique dans l'environnement local. Il ne participe ni à une tentative
  ni à un run et n'affecte pas le verdict de la story.
- Le remplacement d'identité est une expurgation DOM avant capture ; les assertions ont été lues
  avant et après dans le produit et PostgreSQL.

## Limite DER-001

L'agent qui conduit cette revue est lancé, cadré et interrompible par l'implémenteur, sur un périmètre
que celui-ci a choisi. Cette revue ne constitue pas une revue indépendante et ne doit jamais être
présentée comme telle.

## Conclusion

Les deux chemins exigés sont observés sur l'arbre courant, l'absence d'exécution prématurée est
confirmée par PostgreSQL, et le périmètre de la dérogation est explicitement borné. Aucun contre-exemple
n'a invalidé l'acceptation locale de `US-G0-UX-001` sous `DER-001`.
