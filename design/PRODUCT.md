# Hermes Console Mobile

## Register

Product.

## Product promise

Hermes Console Mobile transforme une demande professionnelle en travail logiciel vérifié. La personne décrit le résultat, confirme la compréhension, valide le plan, suit la réalisation et décide à partir de preuves lisibles.

Le produit mobile n’est ni un terminal réduit, ni un chat générique, ni une copie miniature de la Console desktop. Il est la surface rapide et tactile du parcours guidé.

## Users

- Demandeur métier qui formule un résultat sans connaître Git, Hermes ou le runtime.
- Responsable qui valide le périmètre, le plan et le résultat depuis son téléphone.
- Développeur qui consulte les détails techniques uniquement lorsqu’ils sont nécessaires.

## Physical scene

Une responsable de projet consulte la tâche debout ou en déplacement, en lumière naturelle, avec une seule main et quelques secondes d’attention. Le texte doit rester lisible sans zoom navigateur et l’action attendue doit être accessible au pouce.

## Core journey

1. Demande : décrire le résultat attendu et choisir le projet.
2. Compréhension : confirmer le périmètre inclus et exclu.
3. Plan : lire les étapes, l’effort estimé et les risques.
4. Réalisation : suivre un état synthétique, sans logs bruts.
5. Preuves : ouvrir les contrôles, l’aperçu et la validation finale.

## Device contract

La même tâche doit fonctionner sur :

- Safari iOS, iPhone 15 et iPhone 15 Pro Max ;
- Chrome Android, téléphone standard ;
- Galaxy Z Fold ouvert, avec rail de navigation ;
- Galaxy Z TriFold ouvert, avec rail et panneau de preuves.

Le zoom du Design Lab agrandit uniquement la représentation physique. Il ne change jamais la largeur logique de l’application ni ses breakpoints.

## Product boundaries

- Web mobile responsive, pas d’application native promise.
- Prototype interactif piloté par des classes mock locales, pas de PWA installable ni de mode offline dans `design/`.
- La Console reste l’autorité des validations et des preuves.
- Les détails techniques sont disponibles par divulgation progressive.
- Aucune exécution n’est représentée comme sûre sans preuve d’isolation.

## Success criteria

- Corps de texte à 15 px minimum, 16 px pour la lecture principale.
- Titres de tâche entre 26 et 32 px selon la largeur disponible.
- Cibles tactiles de 44 × 44 px minimum et espacement suffisant.
- Aucun défilement horizontal à partir de 320 px.
- CTA principal dans la zone basse du contenu.
- Safe areas iOS, thème sombre, focus visible et `prefers-reduced-motion`.
- Navigation et contenu adaptés sans breakpoint propre à un modèle commercial.
- Les cinq presets conservent exactement leur ratio logique documenté.

## Non-goals

- Reproduire le chrome physique d’un appareil au pixel près.
- Afficher des métriques ou preuves qui n’existent pas réellement dans le produit.
- Ajouter un service worker, des notifications push ou une installation PWA au prototype.
