# Product

## Register

product

## Users

Opérateurs métier ou techniques légers qui savent décrire une mission, joindre des fichiers et lire un résultat, mais ne doivent pas connaître le CLI, JSON-RPC, les sessions Hermes ou son protocole d'événements.

Vision (pas socle) : équipes / clients qui doivent voir l’agent comme un collaborateur technique crédible — pas comme un bot Telegram.

## Product Purpose

Hermes Console est la **couche d’exploitation agentique** : control plane + surface de travail autour d’un runtime (Hermes aujourd’hui). Elle configure des agents (identités opérationnelles), lance et supervise des missions traçables, conserve l’historique / audit trail, gère les artefacts sur volume partagé (`HERMES_SHARED_WORKDIR`) et administre la connexion runtime.

Hermes peut être local, installé avec la Console, accessible sur un réseau privé ou déployé sur un VPS (Edge / Relay plus tard).

**État (v0.7) :** Phase 3 (cancel, réconciliation, approvals, retry, inactivité) et Phase 4 slice fichiers sont branchées. Auth `/setup` et Compose prod restent ouverts.

**Axe produit (v0.6) — généraliste dynamique.** On prend les bons angles de Buzz, Multica et hermes-webui sans les cloner :

| Référence | On prend | On refuse |
|---|---|---|
| Buzz | Agent visible, crédible, avec droits / historique ; runtime où il doit tourner | Rebuild workspace collab / Nostr ; channels comme modèle primaire |
| Multica | Lifecycle mission explicite ; skills qui compoundent ; santé runtime | Cœur produit = issues / Kanban ; multi-harness day-1 |
| hermes-webui | Accès web/mobile sans CLI ; contrôles à portée ; sessions / workspace fichiers | Parité CLI 1:1 ; chat sans missions ; agent in-process |

North star :

```text
Console = control plane + surface de travail
Runtime  = exécution (Hermes-first, adapter-ready)
Session  = workspace conversationnel (pilote agents + missions)
Mission  = unité d’exécution traçable (run Hermes)
Agent    = identité opérationnelle
Connector = secret typé chiffré (IMAP, etc.) — jamais dans le chat
Canal    = pluggable (web d’abord)
```

**Primitives v0.8**

| Primitive | Rôle | Stockage |
|---|---|---|
| **Session** | Surface `/chat` (OpenClaw-iso Control UI) — session sidebar + pane | `threads` |
| **Mission** | Une exécution Hermes déclenchée par un message | `runs` |
| **Agent** | Identité (instructions, modèle) — CRUD formulaire ou depuis la session | `agents` |
| **Connector** | Credentials typés (Gmail IMAP, Outlook, pro) chiffrés AES-256-GCM | `connectors` |

Hors périmètre : éditeur `.env` Hermes libre ; secrets collés dans le transcript.

## Brand Personality

Précise, calme, opérationnelle. L'interface doit inspirer la confiance d'un outil de travail familier et rendre l'activité de l'agent intelligible sans exposer la complexité du runtime. Crédible chez un client — pas « bricolage messaging ».

## Anti-references

- Un chatbot généraliste sans agents configurés, états d’exécution, outils ni responsabilité produit.
- Une copie visuelle du terminal ou un flux de logs bruts comme vue principale.
- Une interface SaaS décorative où les cartes, gradients et animations prennent le pas sur l'état réel de la mission.
- Une UI qui invente des données absentes du protocole Runtime ou masque une limite du runtime.
- Un clone Buzz / Slack (channels, DMs, voice) comme identité produit.
- Un clone Multica / Linear (board, assignee picker, issues) comme cœur UX.
- Un thin WebUI de parity CLI (hermes-webui) sans modèle Mission / audit trail produit.
- Un pitch « vos agents vivent dans Telegram/WhatsApp » comme surface entreprise.

## Design Principles

- **Conversation pilotée par des missions.** Chaque message déclenche une mission traçable, avec état, activité, résultat et artefacts.
- **Agent = identité opérationnelle.** Nom, instructions, modèle, historique — collaborateur configuré, pas persona jetable.
- **BoardUI comme coque complète.** Reprendre le shell, la navigation, les thèmes, les dispositions, les contrôles et les traitements du flux `ai-chat`, puis remplacer ses données de démonstration par le métier Hermes.
- **Montrer la vérité du runtime.** Distinguer données mesurées, état en cours et limites du protocole.
- **Une interruption humaine évidente.** Une autorisation requise doit dominer l'écran et ne jamais ressembler à une simple activité en cours.
- **Contrôles toujours à portée.** Agent, modèle, tokens, statut runtime visibles pendant le travail.
- **Le shell disparaît derrière la tâche.** Garder une hiérarchie familière, compacte et stable sur mobile comme sur desktop.
- **Surfaces pluggables, cœur stable.** Web Console = canal d’autorité ; Buzz/Slack/etc. = transports futurs, jamais source de vérité.
- **Console décide, Edge accède, Hermes exécute.** Les secrets et politiques restent côté serveur ; un accès direct couvre les réseaux joignables et un Relay sortant couvre les installations derrière NAT ou pare-feu.

## Accessibility & Inclusion

Le rendu doit rester utilisable à 320 px sans défilement horizontal, proposer un dark mode réellement stylé, conserver une navigation complète au clavier avec focus visible, fermer les overlays avec Échap et respecter `prefers-reduced-motion`. Aucun statut ne doit reposer uniquement sur la couleur.
