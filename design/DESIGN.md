# Hermes Console Mobile Design System

## North star

**Un carnet de mission calme, lisible dans la main.**

L’écran doit ressembler à un outil professionnel mobile, pas à une capture desktop réduite. La hiérarchie vient d’une typographie franche, de surfaces peu nombreuses et d’un seul accent bleu réservé aux actions et à l’état courant.

## Typography

Police : `Inter Variable`, chargée localement avec `@fontsource-variable/inter` afin de conserver le même rendu sans dépendance réseau.

| Rôle | Taille | Graisse | Interligne | Usage |
|---|---:|---:|---:|---|
| Titre de tâche | `clamp(26px, 7cqw, 32px)` | 620 | 1.12 | Question ou décision principale |
| Titre de section | 16 px | 650 | 1.3 | Groupe fonctionnel |
| Corps principal | 15 px | 430 | 1.55 | Explication et contenu saisi |
| Contrôle | 14 px | 600 | 1.25 | Bouton, select, navigation |
| Libellé | 13 px | 650 | 1.3 | Champ et statut |
| Métadonnée | 11 px | 560 | 1.35 | Projet, progression, preuve secondaire |

Règles :

- Aucun texte utile sous 11 px.
- Le texte de lecture ne descend jamais sous 15 px.
- Les titres utilisent l’échelle et le poids, jamais une couleur décorative.
- La largeur de lecture reste sous 65 caractères lorsque l’écran le permet.

## Color strategy

Stratégie restreinte : neutres légèrement froids et un bleu opérationnel inférieur à 10 % de la surface.

- Canvas clair : `#fbfbfc`.
- Surface : `#ffffff`.
- Encre : `#15171a`.
- Texte secondaire : `#626873`.
- Couture : `#e3e5e8`.
- Bleu opérationnel : `#155dfc`.
- Succès : vert olive, toujours accompagné d’une icône et d’un libellé.
- Avertissement : ambre, jamais utilisé seul pour transmettre le sens.

Le dark mode conserve les mêmes rôles et les mêmes contrastes. Aucun gradient de texte. Le seul effet de verre autorisé est la navigation basse, une capsule courte et fonctionnelle, jamais une card de contenu.

## Mobile layout

### Phone, 320 à 559 px de conteneur

- Une colonne.
- En-tête compact, progression, contenu scrollable et navigation basse.
- CTA primaire de 48 px minimum, placé après la décision courante.
- Padding horizontal de 16 px.
- Safe area appliquée à la navigation basse.

### Fold, à partir de 560 px de conteneur

- Rail de navigation de 150 px.
- Tâche au centre, largeur de lecture limitée.
- Navigation basse supprimée.

### TriFold, à partir de 800 px de conteneur

- Rail de navigation, tâche centrale et panneau de preuves.
- Le panneau de preuves complète la tâche sans dupliquer son contenu.

Les seuils sont des container queries fondées sur l’espace réellement disponible, pas sur les noms des appareils.

## Touch and interaction

- Toute cible tactile structurante mesure au moins 44 × 44 px.
- Deux cibles voisines conservent 8 px de séparation lorsque possible.
- Chaque bouton possède un état `:active` visible par transformation légère et variation de surface.
- Aucun comportement ne dépend du hover.
- Focus clavier visible avec anneau bleu et offset de 2 px.
- Les actions destructives sont éloignées du CTA principal.

## Browser behavior

- `min-height: 100dvh`, jamais `100vh`.
- `viewport-fit=cover` et `env(safe-area-inset-bottom)`.
- Aucun `maximum-scale=1`, le pinch-to-zoom reste disponible.
- Pas de barre basse `position: fixed` ; elle participe au layout de l’application.
- Scroll contenu circonscrit à la tâche, sans bloquer le scroll de la page du Design Lab.
- `prefers-reduced-motion` neutralise les animations non essentielles.

## Device frame and Design Lab zoom

Chaque preset possède une largeur et une hauteur logiques. Le cadre est dessiné à cette taille, puis transformé visuellement par le zoom du laboratoire.

- Zoom par défaut : 115 %.
- Plage : 75 à 140 %.
- Le zoom agrandit textes, espacements et chrome ensemble.
- Les container queries continuent d’observer la largeur logique non zoomée.
- Sur petit écran hôte, le cadre se replie à 100 % de la largeur disponible.

## Component rules

- Bouton primaire : 48 px, bleu plein, texte 14 px semi-gras.
- Bouton secondaire : même hauteur et hiérarchie neutre.
- Champ : 48 px minimum, texte 14 à 15 px.
- Zone de demande : 124 px minimum, texte 15 px.
- Navigation basse : capsule flottante sombre/translucide de 56 px, marge horizontale de 12 px et safe area. L’onglet actif repose sur une surface claire et conserve l’accent bleu Hermes ; les quatre cibles font au moins 48 px de haut.
- Progression : pastille 24 px et libellé 10 à 11 px.
- Carte : seulement lorsqu’elle représente un objet ou une décision autonome ; aucune card imbriquée.

## Validation matrix

| Preset | Largeur logique | Hauteur logique | Composition attendue |
|---|---:|---:|---|
| iPhone 15 | 393 | 852 | Colonne + navigation basse |
| iPhone 15 Pro Max | 430 | 932 | Colonne + navigation basse |
| Android standard | 412 | 915 | Colonne + navigation basse |
| Galaxy Z Fold7 ouvert | 672 | 744 | Rail + tâche |
| Galaxy Z TriFold ouvert | 860 | 631 | Rail + tâche + preuves |

## Definition of done

- Les quatre étapes restent lisibles et manipulables sur les cinq presets.
- Aucun texte principal sous 15 px et aucune action structurante sous 44 px.
- Aucun overflow horizontal.
- Ratios et composition vérifiés dans un navigateur réel.
- Typecheck, build Vite et console navigateur sans erreur.
