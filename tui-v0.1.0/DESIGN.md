---
name: Hermes Console
description: Poste de contrôle calme et précis pour exploiter des agents Hermes sans exposer la complexité du runtime.
colors:
  operational-blue: "#155dfc"
  operational-blue-highlight: "#3080ff"
  operational-blue-deep: "#1447e6"
  light-canvas: "#ffffff"
  light-surface: "#f7f7f7"
  light-seam: "#ebebeb"
  light-ink: "#0a0a0a"
  dark-canvas: "#121212"
  dark-surface: "#171717"
  dark-control: "#262626"
  dark-edge: "#404040"
  dark-ink: "#fafafa"
  success: "#9ae600"
  warning: "#fdc700"
  danger: "#ff637e"
  information: "#8ec5ff"
typography:
  headline:
    fontFamily: "Inter Variable, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: "22px"
  title:
    fontFamily: "Inter Variable, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: "18px"
  body:
    fontFamily: "Inter Variable, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: "18px"
  label:
    fontFamily: "Inter Variable, Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: "16px"
    letterSpacing: "0.15px"
  mono:
    fontFamily: "JetBrains Mono Variable, JetBrains Mono, ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "18px"
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "14px"
  2xl: "18px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.operational-blue}"
    textColor: "{colors.light-canvas}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "8px 12px"
    height: "36px"
  button-secondary-dark:
    backgroundColor: "{colors.dark-control}"
    textColor: "{colors.dark-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "8px 12px"
    height: "36px"
  input-dark:
    backgroundColor: "{colors.dark-control}"
    textColor: "{colors.dark-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "8px 12px"
    height: "40px"
  card-dark:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.dark-ink}"
    rounded: "{rounded.xl}"
    padding: "16px"
---

# Design System: Hermes Console

## Overview

**Creative North Star: "Le poste de contrôle calme"**

Hermes Console ressemble à un outil d’exploitation familier posé sur un bureau technique, pas à un terminal mis en scène. La densité est assumée, la hiérarchie est stable et chaque accent signale une action, une sélection ou un état réel. L’interface doit inspirer la confiance d’un outil de travail précis, même lorsqu’elle expose des sujets techniques comme SSH, les modèles ou les autorisations.

Le système reprend la discipline de BoardUI : surfaces neutres étagées, contrôles compacts, Inter pour la lecture et JetBrains Mono uniquement pour les valeurs techniques. Le bleu reste rare. Les animations confirment un changement d’état en 150 à 250 ms et ne chorégraphient jamais le chargement d’une page. À 320 px, la navigation et les formulaires se recomposent sans défilement horizontal.

**Key Characteristics:**

- Dense, calme et opérationnel.
- Hiérarchie obtenue par la lumière des surfaces, pas par une accumulation de contours.
- Accent réservé aux actions primaires, sélections, focus et informations actives.
- États accessibles par une icône et un libellé, jamais par la couleur seule.
- Dark mode de référence, avec équivalence fonctionnelle complète en light mode.

## Colors

La palette associe un graphite neutre à un bleu opérationnel. Les couleurs d’état restent franches, mais toujours contenues dans de petites zones fonctionnelles.

### Primary

- **Bleu opérationnel :** action primaire, focus, contrôle sélectionné et navigation active. Son usage doit rester inférieur à 10 % de l’écran.
- **Bleu de survol :** variation plus lumineuse réservée au hover et aux informations actives.
- **Bleu profond :** état pressé et texte d’information sur fond clair.

### Neutral

- **Nappe claire :** fond dominant en light mode.
- **Surface claire :** cartes, rails et remplissages secondaires en light mode.
- **Couture claire :** séparateurs et bordures discrètes en light mode.
- **Nappe graphite :** fond et panneau dominant en dark mode.
- **Surface graphite :** cartes, widgets et rail latéral en dark mode.
- **Contrôle graphite :** boutons, inputs, chips et popovers en dark mode.
- **Arête graphite :** seule bordure volontairement visible sur un contrôle sombre.

### Tertiary

- **Succès lime :** runtime sain et opération réussie.
- **Avertissement jaune :** confirmation ou situation à surveiller.
- **Danger rose :** erreur, refus ou action destructive.
- **Information bleue :** explication contextuelle et état informatif.

### Named Rules

**The One Accent Rule.** Le bleu sert l’action, la sélection et le focus. Il n’est jamais décoratif.

**The Surface Ladder Rule.** En dark mode, la nappe, la surface, le contrôle puis l’arête suivent toujours cet ordre de clarté. Une bordure posée dans une card utilise l’arête, jamais la couture de fond.

**The Semantic State Rule.** Succès, avertissement, danger et information associent toujours couleur, icône et texte explicite.

## Typography

**Display Font:** Inter Variable (avec Inter et la pile système en repli)  
**Body Font:** Inter Variable (avec Inter et la pile système en repli)  
**Label/Mono Font:** JetBrains Mono Variable pour les chemins, commandes, identifiants et valeurs techniques seulement

**Character:** Une seule sans-serif humaniste porte l’essentiel de l’interface. La différence entre titres, libellés et aide vient du poids, de l’échelle et du contraste, jamais d’une fonte décorative.

### Hierarchy

- **Headline** (600, 16 px, 22 px) : titre de page ou de section principale.
- **Title** (600, 13 px, 18 px) : titre de carte, de groupe de champs ou de bloc fonctionnel.
- **Body** (400, 13 px, 18 px) : texte courant et contenu de contrôle. Les explications restent sous 70 caractères par ligne lorsque la surface le permet.
- **Label** (500, 12 px, 16 px, 0,15 px) : libellé, statut compact et navigation secondaire.
- **Mono** (400, 12 px, 18 px) : commande, chemin, URL technique, port et identifiant.

### Named Rules

**The Compact Hierarchy Rule.** Un changement de niveau doit être perceptible par le poids et au moins un pas d’échelle, sans transformer une page de réglages en page marketing.

**The Mono Is Data Rule.** JetBrains Mono signale une valeur technique. Elle ne sert jamais aux titres, boutons ou paragraphes.

## Elevation

L’élévation est structurelle et discrète. Les surfaces se séparent d’abord par leur niveau de gris, puis par une couture ou une ombre courte lorsque l’élément flotte réellement. Les cards au repos restent presque plates ; dialogs, popovers et sidebar peuvent employer une ombre plus diffuse.

### Shadow Vocabulary

- **Contrôle :** ombre de 1 à 2 px, réservée aux boutons et petits contrôles qui doivent se détacher de leur surface.
- **Card :** combinaison très légère d’une couture proche et d’une diffusion de 4 px.
- **Élevé :** ombre diffuse de 12 px avec une arête d’un pixel, réservée aux overlays, popovers et chrome flottant.

### Named Rules

**The Tonal First Rule.** Si une différence de surface suffit, aucune ombre supplémentaire n’est autorisée.

**The One Inset Rule.** Un conteneur en creux n’en contient jamais un second au même niveau tonal. Le parent garde alors une bordure et laisse le fond en creux au contenu utile.

## Components

### Buttons

- **Shape:** rectangle compact aux coins doucement arrondis (10 px), hauteur standard 36 px.
- **Primary:** gradient vertical du bleu lumineux au bleu opérationnel, texte clair, padding horizontal minimal de 12 px.
- **Hover / Focus:** éclaircissement de l’accent, anneau visible de 2 px et transition de 150 ms. Le mode réduit supprime toute animation non essentielle.
- **Secondary / Ghost / Danger:** le secondaire utilise la surface de contrôle et une arête visible ; le ghost emploie un lavis d’accent ; le danger reste réservé aux actions destructives.
- **Icon with label:** utiliser exclusivement la propriété `leadingIcon` ou `trailingIcon`. L’icône est décorative, masquée aux technologies d’assistance et séparée du libellé par le gap du composant.

### Chips

- **Style:** fond sémantique atténué, libellé de 11 à 12 px, rayon complet lorsque le statut est bref.
- **State:** le texte porte le sens complet. Une icône accompagne les états importants ; la couleur seule ne suffit jamais.

### Cards / Containers

- **Corner Style:** courbe douce de 14 px pour les surfaces et 18 px pour les choix larges.
- **Background:** surface claire ou graphite selon le thème. Le contrôle plus clair est réservé aux éléments interactifs.
- **Shadow Strategy:** tonalité d’abord, ombre de card seulement si la surface doit se détacher.
- **Border:** couture sur la nappe ; arête visible à l’intérieur d’une card, d’un popover ou d’un dialog.
- **Internal Padding:** 16 px par défaut, 12 px pour les blocs compacts.

### Inputs / Fields

- **Style:** contrôle de 40 px, fond de contrôle, bordure d’arête, rayon de 10 px et padding horizontal de 12 px.
- **Focus:** bordure d’accent plus anneau de 2 px à faible opacité.
- **Error / Disabled:** message explicite lié au champ ; état disabled désaturé sans supprimer le contraste du libellé.
- **Alignment:** dans une même ligne, chaque champ fournit une aide de longueur comparable ou réserve son emplacement. Les inputs partagent toujours la même ligne de base.

### Navigation

- **Style:** rail compact, libellés en Inter, icônes Lucide homogènes et sélection portée par un fond neutre ou l’accent.
- **States:** hover discret, focus visible, état courant annoncé sémantiquement. Sur mobile, la navigation se replie sans masquer les actions principales.

### Mission Activity

Les missions, approvals et événements montrent d’abord le statut et l’action attendue. Une autorisation humaine requise domine l’activité courante ; les logs bruts restent secondaires et les artefacts conservent un accès direct.

## Do's and Don'ts

### Do:

- **Do** utiliser les tokens BoardUI et les alias Hermes, notamment `seam` et `inset` dans une card ou un dialog.
- **Do** aligner labels, aides et contrôles sur une grille prévisible ; à 320 px, empiler les colonnes sans défilement horizontal.
- **Do** utiliser `leadingIcon` et `trailingIcon` pour les boutons avec libellé, avec une icône `aria-hidden`.
- **Do** conserver un focus visible, une navigation clavier complète et des cibles tactiles appropriées au contexte.
- **Do** montrer la vérité du runtime : données mesurées, état en cours et limites du protocole doivent rester distincts.
- **Do** garder les contrôles agent, modèle, tokens et statut runtime à portée pendant le travail.

### Don't:

- **Don't** transformer Hermes Console en chatbot généraliste sans agents configurés, états d’exécution, outils ni responsabilité produit.
- **Don't** copier visuellement un terminal ni faire des logs bruts la vue principale.
- **Don't** produire une interface SaaS décorative où cards, gradients et animations prennent le pas sur l’état réel de la mission.
- **Don't** inventer des données absentes du protocole Runtime ni masquer une limite du runtime.
- **Don't** cloner Buzz ou Slack en faisant des channels, DMs ou de la voix l’identité produit.
- **Don't** cloner Multica ou Linear en faisant du board, de l’assignee picker ou des issues le cœur UX.
- **Don't** réduire le produit à une parité CLI 1:1 façon hermes-webui, sans modèle Mission ni audit trail.
- **Don't** présenter Telegram ou WhatsApp comme la surface entreprise principale.
- **Don't** utiliser de texte en gradient, de glassmorphism décoratif, de grille répétitive de cards identiques ou de bordure latérale colorée supérieure à 1 px.
- **Don't** imbriquer une card dans une card ; utiliser la hiérarchie de surface, une couture ou un séparateur.
- **Don't** animer les propriétés de layout ni employer bounce ou elastic ; toute transition doit expliquer un état.
