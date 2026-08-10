# Benchmarks produit

Les trois interfaces à surveiller en continu, parce qu'elles occupent le terrain
voisin du nôtre sans occuper le même. Ce fichier existe pour une seule raison :
revenir sur leur GitHub avant chaque décision de design importante, comparer sur
pièces, et écrire ce qu'on prend et ce qu'on refuse. Aucune des trois n'est un
modèle à copier. Deux sont des anti-références explicites de
[`DESIGN.md`](../DESIGN.md).

Dernière revue générale : **11-08-2026**.

## Carte de positionnement

```
                    conversation au centre
                              ▲
                              │
                    ┌─────────┴─────────┐
                    │       Buzz        │  relay Nostr, salons, huddles, canvases
                    │  (block/buzz)     │  le travail est une pièce jointe au flux
                    └─────────┬─────────┘
                              │
   parité CLI ◄───────────────┼───────────────► autorité produit
                              │                 (mission, gate, audit)
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
┌───────┴────────┐   ┌────────┴────────┐   ┌────────┴────────┐
│  hermes-webui  │   │ Hermes Desktop  │   │ Hermes Console  │
│ (nesquena)     │   │ (NousResearch)  │   │     (nous)      │
│ sessions +     │   │ client officiel │   │ mission, gate   │
│ transcript     │   │ du runtime      │   │ épinglé, audit  │
└────────────────┘   └─────────────────┘   └─────────────────┘
                              │
                              ▼
                      exécution au centre

Légende : l'axe horizontal va de la parité avec la CLI vers l'autorité produit.
L'axe vertical va de la conversation vers l'exécution. Notre position revendiquée
est le seul quadrant que personne n'occupe : autorité produit ET exécution, avec
la conversation subordonnée à la mission.
```

## 1. Buzz

- Dépôt : <https://github.com/block/buzz>
- Éditeur : Block, Inc. Licence open source, Rust plus React.
- Chemins à ouvrir en priorité : `desktop/src/features/` pour le vrai inventaire
  de surfaces, `web/src/` pour l'app légère, `VISION_*.md` à la racine pour
  savoir où ils vont, `CHANGELOG.md` pour la cadence.

**Ce qu'ils font.** Un workspace où humains et agents collaborent sur un relay
Nostr que l'on héberge soi-même. Chaque message, réaction, étape de workflow et
événement git devient un événement signé dans un journal unique. Les agents sont
présentés comme des membres et non des bots, avec leur propre paire de clés.
Au 11-08-2026, `desktop/src/features/` expose 29 domaines : présence,
notifications, statut utilisateur, recherche, huddle, forum, projets,
mémoire d'agent, modération, rappels, emojis personnalisés, terminal, mesh
compute, entre autres.

**Ce qu'on leur prend.** L'événement unique et signé comme primitif de base,
transposé à l'échelle de la mission plutôt qu'à celle du relay. L'idée du
commentaire ancré à un instant, qu'ils appliquent à une frame vidéo et que nous
appliquons à un instant d'exécution. La promesse d'une recherche qui ramène la
conversation, le patch, le run et l'approbation dans un seul classement.

**Ce qu'on leur refuse.** L'identité sociale. Huddles, forum, communautés,
emojis personnalisés, terminal intégré, mesh compute. `DESIGN.md` interdit d'en
faire notre identité produit et `PRODUCT.md` classe en anti-référence les
fonctions collaboratives qui prennent le pas sur la File et les missions.

**Leur faiblesse exploitable.** Le salon est une liste plate. La sortie d'un
agent écrase mécaniquement les humains, et le seul indicateur disponible reste
le non-lu, qui est une métrique hostile pour un opérateur. Leurs approval gates
vivent dans le flux, donc elles remontent et disparaissent. Notre réponse est
l'échelle de bruit et le gate épinglé qui ne défile jamais.

**Écart à vérifier à chaque revue.** Le README promet une recherche unifiée que
`web/src/features/` ne contenait pas au 11-08-2026 (seulement `invite` et
`repos`). Vérifier si la promesse est tenue, et où.

## 2. Hermes Desktop

- Dépôt : <https://github.com/NousResearch/hermes-agent>, application dans
  `apps/desktop/`.
- Éditeur : NousResearch. C'est le client officiel du runtime que nous pilotons.
- Chemins à ouvrir en priorité : `apps/desktop/`, `web/`, `ui-tui/`, et le
  `README.md` racine pour la liste des canaux supportés.

**Ce qu'ils font.** Le client de référence du runtime Hermes, à côté d'une TUI
et d'une interface web, avec une passerelle vers Telegram, Discord, Slack,
WhatsApp et Signal.

**Ce qu'on leur prend.** La vérité du runtime affichée sans fard : modèle actif,
outils, sortie en flux. C'est la discipline que `DESIGN.md` nous impose déjà.

**Ce qu'on leur refuse.** Le messaging grand public comme surface d'entreprise.
`DESIGN.md` interdit de présenter Telegram ou WhatsApp comme surface principale.

**Le vrai risque, et il n'est pas esthétique.** `docs/PRD.md` le nomme déjà :
si Hermes Desktop absorbe la mission, l'audit et les rôles avant que notre wedge
soit validé, notre différenciation disparaît. C'est la seule des trois
références dont une sortie produit peut nous tuer. À surveiller à chaque revue :
apparition d'un objet mission durable, d'un journal d'audit, d'une gestion de
rôles ou d'un modèle d'autorisation dans `apps/desktop/`.

## 3. hermes-webui

- Dépôt : <https://github.com/nesquena/hermes-webui>
- Éditeur : communauté. Python sans framework côté serveur, JavaScript sans build
  côté client, SSE pour le flux.
- Chemins à ouvrir en priorité : `static/` pour l'interface, `docs/` pour les RFC.

**Ce qu'ils font.** Une interface web auto-hébergée pour Hermes Agent, en trois
panneaux : sessions à gauche, transcript au centre, explorateur de fichiers du
workspace à droite. Gestion de sessions riche, opérations fichiers, git,
entrée vocale, thèmes et skins, cron, cartes d'appel d'outil, garde
d'approbation sur les commandes dangereuses, liens de partage en lecture seule.

**Ce qu'on leur prend.** La carte d'appel d'outil et la garde d'approbation sur
commande dangereuse, qui sont la bonne intuition. La densité du panneau de
sessions. L'absence de build, qui est une leçon de sobriété, pas un modèle
d'architecture pour nous.

**Ce qu'on leur refuse.** La parité CLI 1:1. `DESIGN.md` l'interdit
explicitement : sans modèle Mission ni journal d'audit, l'interface n'est qu'un
habillage de la ligne de commande. La session comme objet racine, aussi : une
session n'est pas une unité de travail traçable.

**Leur faiblesse exploitable.** Tout est une session. Rien ne survit à la
session, donc rien n'est auditable au niveau du produit, et la reprise d'un
travail à froid repose sur la mémoire de l'opérateur.

## Référence secondaire

**Multica** (<https://github.com/multica-ai/multica>) n'est pas une interface
concurrente mais une source de formes produit, déjà traitée en détail dans
[`docs/PRD.md`](PRD.md) section 5.6. Attention licence : elle ajoute des
conditions aux termes Apache 2.0. Aucun code, composant UI, backend, daemon ou
CLI Multica ne doit entrer ici, seulement des formes produit publiques.

## Procédure de revue

À faire avant toute décision de design structurante, et au minimum une fois par
trimestre.

1. Ouvrir les trois dépôts et relever la date du dernier commit ainsi que le
   `CHANGELOG` quand il existe.
2. Pour Buzz, redérouler l'inventaire de `desktop/src/features/` et noter les
   dossiers apparus ou disparus depuis la dernière revue.
3. Pour Hermes Desktop, chercher spécifiquement mission, audit, rôles et
   autorisations. C'est le signal de risque, pas une curiosité.
4. Pour hermes-webui, regarder `docs/` : leurs RFC annoncent les directions
   avant le code.
5. Écrire le delta ici, dans la section concernée, avec la date au format
   `dd-mm-yyyy`. Ne pas ouvrir de nouveau fichier par revue.
6. Si un écart remet en cause une règle de `DESIGN.md` ou de `PRODUCT.md`,
   ouvrir une décision tracée plutôt que de modifier la charte en silence.

## Journal des revues

| Date | Portée | Constat |
|---|---|---|
| 11-08-2026 | Les trois | Revue initiale. Buzz à 29 domaines côté desktop et 2 côté web. Hermes Desktop confirmé dans `apps/desktop/`. hermes-webui en trois panneaux centrés sur la session. Aucune des trois ne tient l'objet mission avec gate épinglé et journal d'audit. |
