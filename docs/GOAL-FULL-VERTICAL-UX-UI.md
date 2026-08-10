# Goal : implémenter la nouvelle UX/UI full vertical de Hermes Console

## Mission

Refondre le Design Lab puis `apps/web` pour faire de Hermes Console un carnet de mission guidé dont
l’Inbox est la porte d’entrée et le workspace de tâche la surface forte.

Le parcours à fermer est :

~~~text
┌────────────┐  demande guidée  ┌──────────────┐  contrat validé  ┌──────────────┐
│ Inbox      │─────────────────▶│ Tâche        │─────────────────▶│ Tentative    │
│ actions    │                  │ contrat      │                  │ Hermes       │
└────────────┘                  └──────────────┘                  └──────┬───────┘
                                                                         │ preuves réelles
                                                                         ▼
┌────────────┐  décision humaine ┌──────────────┐  résultat vérifié ┌──────────────┐
│ Historique │◀─────────────────│ Validation   │◀─────────────────│ Preuves      │
└────────────┘                  └──────────────┘                   └──────────────┘
~~~

Légende : chaque flèche porte le changement d’état réel qui autorise l’étape suivante. Composants :
Inbox, tâche durable, tentative Hermes, preuves, validation humaine et historique.

Phrase directrice à conserver :

> Hermes Console transforme une demande métier en travail logiciel vérifié. La Console gouverne,
> Hermes exécute, l’humain décide.

## Hiérarchie normative

Lire et appliquer dans cet ordre :

1. `docs/user-stories/TASKS-ET-INBOX.md`
2. `docs/PRD.md`, en particulier le mandat full vertical et les gates V0 à V4
3. `design/app-web-rework/PRODUCT.md`
4. `design/app-web-rework/DESIGN.md`
5. Design Lab
6. `apps/web`

Un niveau traduit le précédent sans inventer de règle. Si le prototype contredit une story ou le
PRD, corriger le prototype. Si `apps/web` contredit une interaction validée du Design Lab, corriger
`apps/web` après validation du prototype.

## Résultat attendu

### Navigation

- Inbox est la route d’accueil.
- Accès métier directs : Inbox, Nouvelle tâche, Historique, Artefacts.
- Détails techniques : Sessions/Missions, Agents, Skills, Chat expert.
- Administration : Runtime Hermes, Paramètres, Journal d’audit, Aide.
- Retirer `Aperçu` du rail principal et de la navigation basse. Une route legacy peut rester
  accessible sans être présentée comme le cœur du produit.
- Kanban uniquement dans Sessions/Missions et uniquement pour les runs.

### Inbox

- Titre : `N actions à traiter` ou `File à jour`.
- CTA : `Nouvelle tâche`.
- Quatre sections dans l’ordre : `Décisions à traiter`, `À reprendre`, `Brouillons à compléter`,
  `Activités en cours`.
- Aucune formulation personnelle sans affectation serveur : supprimer `en attente de vous`,
  `rien ne vous attend`, `votre signature` et `rien à faire`.
- Utiliser des listes structurées et des séparateurs, pas une grille de cards.
- Montrer les pannes partielles sans masquer la source encore disponible.
- Ouvrir ou charger l’Inbox ne crée aucune tentative et n’appelle jamais Hermes.

### Nouvelle tâche

- Quatre moments : Demande, Compréhension, Plan, Contrat.
- L’étape Contrat récapitule objectif, résultat attendu, inclus, exclusions, risques et validations.
- Créer la tâche durable sans lancer Hermes.
- Sur TriFold et desktop, afficher l’aperçu du contrat dans le panneau droit.
- Sur téléphone et Fold, garder l’aperçu dans le flux après les champs.

### Workspace de tâche

- Header : retour Inbox, projet, titre, révision et statut réel.
- Corps : objectif, résultat attendu, hors périmètre, plan, décisions, tentative Hermes.
- Panneau droit : preuves, tests, diff, fichiers, aperçu, journal et état runtime.
- Sur téléphone, les preuves viennent après la tentative.
- Sur Fold, rail + tâche ; pas de panneau droit permanent.
- Sur TriFold et desktop, rail + tâche + panneau de preuves.
- Une décision active est la seule carte forte de l’écran.
- Détails techniques par divulgation progressive inline ou dans le panneau, jamais dans un modal par
  défaut.

### Sessions/Missions

- Conserver la bascule Liste/Kanban.
- Le Kanban représente les états réels des runs et ne modifie jamais le contrat d’une tâche.
- Lier un run à sa tâche source lorsque la relation existe.
- Garder le chat expert secondaire et hors accueil.

## Architecture responsive obligatoire

| Conteneur | Composition |
|---|---|
| 320 à 559 px | Une colonne, navigation basse, CTA tactile et safe area |
| 560 à 799 px | Rail compact de 152 px + tâche |
| 800 à 1279 px | Rail + tâche + contexte de 220 à 280 px |
| 1280 à 1535 px | Rail développé + workspace + contexte de 300 à 360 px |
| 1536 px et plus | Lecture centrale bornée, espace supplémentaire donné aux preuves |

Utiliser des container queries, Grid/Flex, `minmax()`, variables CSS et propriétés logiques. Aucun
scroll horizontal à 320 px, aucune largeur rigide inutile, aucun comportement hover-only.

## Direction visuelle

- Inter, 15 px minimum pour le contenu mobile, 13 px permis sur desktop dense.
- Neutres froids et bleu opérationnel sur moins de 10 % de l’écran.
- Mode clair de référence mobile et dark mode complet.
- Une couleur d’état implique icône et libellé.
- Listes et séparateurs avant les cards ; aucune card imbriquée.
- Aucun gradient de texte, aucune bordure latérale colorée, aucun glassmorphism décoratif.
- Motion de 150 à 250 ms uniquement pour confirmer un état ou révéler un détail.
- Cibles tactiles de 44 × 44 px minimum, focus visible et `prefers-reduced-motion`.
- `min-height: 100dvh`, safe areas iOS et pinch-to-zoom conservé.

## Ordre d’exécution

### Phase 0 : protéger l’état du dépôt

- Lire `git status` et le diff des fichiers ciblés.
- Le worktree est sale : préserver toutes les modifications préexistantes et ne rien réinitialiser.
- Utiliser uniquement `bun` et `bunx`, jamais `npm` ou `npx`.
- Ne pas commit ni push sans demande explicite.

### Phase 1 : Design Lab

Le prototype historique a été conservé intégralement dans `design/backup-ui-mobile-app`. Ne pas le
modifier ni le remettre à la racine de `design` : il sert uniquement de sauvegarde et de référence.

Le nouveau prototype de référence est l’application autonome `design/app-web-rework`.

Mettre à jour en priorité :

- `design/app-web-rework/src/components/AppShell.tsx`
- `design/app-web-rework/src/screens/Pages.tsx`
- `design/app-web-rework/src/data.ts`
- `design/app-web-rework/src/styles.css`
- `design/app-web-rework/PRODUCT.md`
- `design/app-web-rework/DESIGN.md`

Le Design Lab doit démontrer les layouts Phone, Fold, TriFold et desktop avant le portage Web.

### Phase 2 : produit Web

Porter l’interaction validée vers :

- `apps/web/src/components/shell/nav-config.ts`
- `apps/web/src/components/shell/app-sidebar.tsx`
- `apps/web/src/components/shell/console-shell.tsx`
- `apps/web/src/screens/inbox.tsx`
- `apps/web/src/lib/inbox.ts`
- `apps/web/src/screens/guided-task.tsx`
- `apps/web/src/screens/guided-task-detail.tsx`
- les composants Sessions/Missions existants

Réutiliser les DTO, capacités, routes et mutations réels. Ne pas créer un store métier parallèle, ne
pas ajouter de faux compteur et ne pas inventer de preuve. Ne modifier le backend que si un contrat
UI déjà normatif est impossible avec les données existantes ; dans ce cas, démontrer précisément le
champ manquant avant toute extension.

### Phase 3 : hardening

- États loading, empty, degraded, error, disabled et unauthorized.
- Navigation clavier, focus, labels accessibles et ordre DOM cohérent.
- Mode clair et sombre.
- Aucune navigation interne ne remplace un écran stable par un squelette plein écran.
- Aucun lancement Hermes lors de la création ou de l’ouverture de l’Inbox.

## Critères d’acceptation

- La route `/` mène à `/inbox`.
- Design Lab et Web partagent les mêmes libellés, sections et chemins.
- Les quatre sections Inbox sont visibles dans le bon ordre lorsque peuplées.
- Les brouillons ne tombent jamais dans `Activités en cours`.
- Le wizard possède quatre moments et crée un contrat sans tentative.
- Le workspace affiche contrat, tentative, preuves et décision dans cet ordre logique.
- Le panneau de preuves n’est présent qu’avec assez de largeur et suit la route courante.
- Kanban absent de l’Inbox et des tâches, présent seulement dans Sessions/Missions.
- Chat expert, Agents, Skills et runtime restent secondaires.
- Aucun overflow horizontal aux largeurs 320, 393, 430, 672, 860, 1024, 1280 et 1536 px.
- Aucun texte principal sous 15 px sur mobile, aucune cible structurante sous 44 px.
- Aucun wording personnel non soutenu par une affectation serveur.
- Dans le Design Lab, toute donnée simulée est explicitement signalée comme prototype local.
- Dans `apps/web`, aucune décision, preuve, capacité ou état runtime n’est simulé.

## Validation

Exécuter au minimum :

```bash
bun --cwd design/app-web-rework run typecheck
bun --cwd design/app-web-rework run build
bun run test
bun run typecheck
bun run lint
bun run build
git diff --check
```

Effectuer ensuite une validation navigateur réelle du Design Lab et de `apps/web` aux huit largeurs
d’acceptation. Vérifier navigation, scroll, console, thèmes, focus, état dégradé et absence de
tentative Hermes à l’ouverture de l’Inbox ou à la création du contrat. Les serveurs nécessaires à
cette validation peuvent être démarrés pour cette mission puis doivent être arrêtés avant le handoff.

## Handoff attendu

Rendre :

1. la liste précise des fichiers modifiés ;
2. les décisions UX appliquées ;
3. les commandes et résultats de validation ;
4. les largeurs réellement vérifiées dans le navigateur ;
5. les écarts restant entre Design Lab et Web ;
6. les capacités encore non prouvées, sans les présenter comme livrées.
