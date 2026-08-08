# Hermes Console — Mobile Design Lab

Prototype autonome React + Vite + Tailwind du parcours mobile guidé de Hermes Console.

- [Vision produit](./PRODUCT.md)
- [Design system mobile](./DESIGN.md)

## Lancer le prototype

```bash
cd design
bun install
bun run dev
```

Routes principales :

```text
/lab/:deviceId/:stage
/lab/iphone-15/request
/lab/iphone-15-pro-max/understanding
/lab/pixel-9/plan
/lab/fold-7/proof
/lab/tri-fold/proof
```

L’appareil et l’étape sont portés par l’URL. Les CTA de la tâche naviguent entre les pages ; il n’existe plus de sélecteur d’écran propre au laboratoire.

Structure :

```text
packages/device-kit/       presets et dimensions
packages/guided-flow/      étapes et transitions
src/components/ui/         primitives génériques
src/components/guided-task shell adaptatif
src/data/                  classes mock immuables et catalogues typés
src/pages/stages/          pages routées du parcours
```

## Scénario interactif

Le prototype conserve un état en mémoire pendant la navigation entre les routes. Les classes de `src/data/` alimentent toutes les étapes :

- la demande, le projet, la priorité et les pièces jointes modifient la compréhension puis le plan ;
- l’avancement des contrôles, leur consultation et l’ouverture de l’aperçu modifient la page de preuves ;
- recommencer restaure un nouveau scénario mock sans dépendance réseau.

Ces données restent volontairement locales au Design Lab : elles démontrent le contrat d’interaction sans simuler un backend réel.

Validation statique :

```bash
bun run typecheck
bun run build
```

## Appareils simulés

| Preset | Écran constructeur | Viewport de design |
|---|---:|---:|
| iPhone 15 | 6,1 pouces, 2556 × 1179 | 393 × 852 CSS px |
| iPhone 15 Pro Max | 6,7 pouces, 2796 × 1290 | 430 × 932 CSS px |
| Google Pixel 9 | 6,3 pouces, 2424 × 1080 | 412 × 915 CSS px |
| Samsung Galaxy Z Fold7 ouvert | 8 pouces, 2184 × 1968 | 672 × 744 CSS px |
| Samsung Galaxy Z TriFold ouvert | 10 pouces, 2160 × 1584 | 860 × 631 CSS px |

Les viewports sont des surfaces CSS de simulation qui conservent le ratio et le comportement de chaque famille. Ils ne prétendent pas reproduire le ratio de pixels natif 1:1 ni le chrome exact du navigateur.

## Sources constructeur

- [Apple — caractéristiques techniques de l’iPhone 15](https://support.apple.com/en-us/111831)
- [Apple — caractéristiques techniques de l’iPhone 15 Pro Max](https://support.apple.com/en-us/111828)
- [Google — caractéristiques techniques du Pixel 9](https://store.google.com/us/product/pixel_9_specs)
- [Samsung — fiche technique du Galaxy Z Fold7](https://image-us.samsung.com/us/smartphones/galaxy-z-fold7/pdf/Q7_B2B_Spec_Sheet_R3Lc.pdf)
- [Samsung — écran du Galaxy Z TriFold](https://www.samsung.com/us/support/answer/ANS10010265/)

## Principes appliqués

- Une seule expérience, adaptée par container queries du compact au tri-fold.
- Zoom global réglable de 75 à 140 %, à 115 % par défaut, sans modifier les breakpoints internes.
- Cibles tactiles de 44 px sur les navigations et actions structurantes.
- Résultat, compréhension, plan, preuve et validation avant les détails techniques.
- Navigation basse sur téléphone, rail latéral sur fold, panneau de preuves sur tri-fold.
- Safe areas, focus visible, thème sombre complet et réduction des animations.
- Aucune métrique métier fictive : les contenus sont un scénario de démonstration explicitement contenu dans le prototype.
