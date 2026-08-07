# Product

## Register

product

## Users

Professionnels métier qui savent décrire un résultat attendu, ainsi que développeurs chargés de valider les décisions techniques sensibles. Aucun utilisateur métier ne doit connaître Git, le CLI, les sessions Hermes ou son protocole d'événements.

## Product Purpose

Hermes Console est une **console guidée qui transforme une demande professionnelle en travail logiciel vérifié**. L’utilisateur décrit le résultat, confirme la compréhension et valide le plan. La Console gouverne ensuite l’exécution Hermes, conserve les preuves et demande une validation technique lorsque la politique du projet l’exige. Les canaux mobiles peuvent capturer ou relayer le travail, mais ne remplacent jamais cette autorité.

Hermes peut être local, installé avec la Console, accessible sur un réseau privé ou déployé sur un VPS (Edge / Relay plus tard).

**État (v0.9, 06-08-2026) :** le parcours `software_delivery` cœur est livré et vérifié localement : tâche et révisions persistantes, dépôt/commit gelés, worktree Bubblewrap, Hermes réel, diff, preuves SHA-256, quatre vérifications Bun et décisions plan/technique/outils/fonctionnelle distinctes. La vue normale masque le shell et la tranche navigateur tient à 320 px. La preuve indépendante, l'appareil physique, la preview déployée et l'acceptation Gate restent ouverts. Aucun connecteur Telegram ou Buzz n'est livré et le core n'en dépend pas.

North star :

```text
Tâche      = demande, compréhension, plan, réalisation, preuve et validation
Mission    = une tentative d’exécution traçable de la tâche
Console    = autorité produit, politique, audit et divulgation progressive
Hermes     = moteur d’exécution
Projet     = périmètre métier et technique de la modification
Preuve     = test, artefact, diff, capture ou résultat vérifiable
Workspace  = vue durable d'une tâche, de ses acteurs, tentatives, preuves et décisions
Canal      = entrée ou projection externe ; jamais source de vérité ni autorité d'exécution
```

**Primitives v0.9**

| Primitive | Rôle | Stockage actuel | État |
|---|---|---|---|
| **Tâche guidée** | Demande, projet, révisions, plan, tentatives et validations | PostgreSQL + `/tasks/new` + `/tasks/:taskId` | livré, vérifié localement |
| **Mission** | Une tentative Hermes traçable | `runs` | livré |
| **Session** | Conversation d’exécution et corrections | `threads` | livré |
| **Agent** | Configuration avancée facultative | `agents` | livré |
| **Preuve** | Résultat, fichier et trace de vérification | `guided_task_evidence`, `artifacts`, `run_events` | preuve guidée livrée, preview déployée absente |
| **Workspace de mission** | Vue regroupant tâche, acteurs, activité, preuves et décisions | `/tasks/:taskId` | tranche guidée livrée, collaboration multi-acteurs à étendre |
| **Canal** | Capture rapide ou collaboration externe | futur adaptateur Telegram/Buzz | optionnel, non livré |

Hors périmètre : éditeur `.env` Hermes libre ; secrets collés dans le transcript.

## Brand Personality

Précise, calme, opérationnelle. L'interface doit inspirer la confiance d'un outil de travail familier et rendre l'activité de l'agent intelligible sans exposer la complexité du runtime. Crédible chez un client — pas « bricolage messaging ».

## Anti-references

- Un chat vide comme point d’entrée principal.
- Un formulaire demandant au métier de choisir un agent, un modèle ou un runtime.
- Une copie visuelle du terminal ou un flux de logs bruts comme vue principale.
- Une interface SaaS décorative où les cartes, gradients et animations prennent le pas sur l'état réel de la mission.
- Une UI qui invente des données absentes du protocole Runtime ou masque une limite du runtime.
- Un clone Buzz / Slack (channels, DMs, voice) comme identité produit.
- Un clone Multica / Linear (board, assignee picker, issues) comme cœur UX.
- Un thin WebUI de parity CLI (hermes-webui) sans modèle Mission / audit trail produit.
- Un pitch « vos agents vivent dans Telegram/WhatsApp » comme surface entreprise.

## Design Principles

- **Résultat avant mécanique.** La vue normale parle de demande, plan, réalisation, vérification et validation.
- **Aucune exécution avant validation.** La Console construit un contrat lisible et attend l’accord explicite.
- **Deux profondeurs, une seule vérité.** La vue normale simplifie le vocabulaire. Les détails techniques montrent tout ce qui a réellement été exécuté.
- **Validation fonctionnelle et technique distinctes.** Une décision sensible ne peut pas être masquée dans une approbation générique.
- **BoardUI comme coque complète.** Reprendre le shell, la navigation, les thèmes, les dispositions, les contrôles et les traitements du flux `ai-chat`, puis remplacer ses données de démonstration par le métier Hermes.
- **Montrer la vérité du runtime.** Distinguer données mesurées, état en cours et limites du protocole.
- **Une interruption humaine évidente.** Une autorisation requise doit dominer l'écran et ne jamais ressembler à une simple activité en cours.
- **Contrôles techniques à portée, mais secondaires.** Modèle, tokens, outils et statut runtime vivent dans les détails.
- **Le shell disparaît derrière la tâche.** Garder une hiérarchie familière, compacte et stable sur mobile comme sur desktop.
- **Surfaces pluggables, cœur stable.** Web Console = canal d’autorité ; Buzz/Slack/etc. = transports futurs, jamais source de vérité.
- **Console décide, Edge accède, Hermes exécute.** Les secrets et politiques restent côté serveur ; un accès direct couvre les réseaux joignables et un Relay sortant couvre les installations derrière NAT ou pare-feu.

## Workspace, mobile et canaux

Le workspace produit n'est pas un nouveau Slack. Il s'organise autour d'une tâche durable : projet,
demande, révisions validées, humains, agents, tentatives, activité lisible, preuves et décisions. La
Console en conserve la version de référence.

Le Web mobile fait partie du parcours cœur. Un demandeur ou un approbateur doit pouvoir créer une
tâche, lire le résultat et prendre la décision qui lui appartient à 320 px et sur appareil tactile.
Une application native Console n'est pas une promesse actuelle.

Les intégrations de canal restent optionnelles pour la première Gate :

- **Telegram** sert à capturer rapidement un texte, une pièce jointe ou un vocal vers un brouillon
  attribué au bon projet. Une capture ne lance jamais automatiquement une mission.
- **Buzz** peut fournir un workspace collaboratif avec channels, humains et agents, puis projeter les
  événements d'une tâche et proposer une reprise humaine. Une réaction ou un message Buzz ne vaut
  jamais validation Console sans identité, policy et audit Console.
- **Hermes Console** reste l'autorité de la tâche, de la spécification, de l'exécution, des preuves et
  des validations.

Cette frontière permet d'utiliser Telegram pour l'immédiateté et Buzz pour les missions longues sans
coupler le produit à leur disponibilité mobile ni réimplémenter channels, DMs, voice ou présence.

## Accessibility & Inclusion

Le rendu doit rester utilisable à 320 px sans défilement horizontal, proposer des cibles tactiles suffisantes, résister à une coupure/reprise réseau sans double mutation, proposer un dark mode réellement stylé, conserver une navigation complète au clavier avec focus visible, fermer les overlays avec Échap et respecter `prefers-reduced-motion`. Aucun statut ne doit reposer uniquement sur la couleur.
