# Phase 0 — Rapport de spike Hermes Console

**Date :** 29-07-2026
**Runtime testé :** Hermes Agent v0.19.0 (2026.7.20), installation **native** (`~/.hermes`), Python 3.11.15
**Surface testée :** serveur API OpenAI-compatible, `http://127.0.0.1:8642`
**Modèles :** faux LLM local (passe 0a), puis **`gpt-5.4-nano` via OpenAI** (passes 0b et 0c)
**Verdict :** ✅ **GO** — 17/20 vérifications passées en 0a ; passes 0b/0c exécutées sous vrai modèle.

> ⚠️ **Une réserve de sécurité est apparue en passe 0c et doit être traitée avant toute exposition
> de la Console à un utilisateur : le mécanisme d'approbation ne se déclenche pas sur la route
> `/v1/runs`, y compris pour une commande que Hermes classe lui-même comme dangereuse.** Cf. §8.

---

## 1. Objet

Le PRD v0.1 reposait entièrement sur un `HermesAdapter` (§13) supposé — `createProfile`, `createSession`,
`submitPrompt`, `streamEvents` — dont **aucune méthode n'avait été observée sur un runtime réel**.
Ce spike avait pour seul but de répondre à une question binaire avant d'écrire la moindre ligne
d'application : *l'API dont le PRD a besoin existe-t-elle ?*

Réponse : **oui, et elle est nettement meilleure que ce que le PRD supposait.**

---

## 2. Ce qui a été installé et mesuré

```bash
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash -s -- --skip-setup --no-skills
```

Configuration ajoutée à `~/.hermes/.env` (sauvegarde : `~/.hermes/.env.bak.pre-spike`) :

```env
API_SERVER_ENABLED=true
API_SERVER_KEY=spike-local-dev-key
OLLAMA_API_KEY=fake-local
OLLAMA_BASE_URL=http://127.0.0.1:8787/v1
```

`hermes config set model ollama/fake-local`, puis `hermes gateway run`.

Aucune clé LLM payante n'a été utilisée : le spike sert lui-même un **faux endpoint OpenAI-compatible**
(`spike/fake-llm.ts`, Hono) sur lequel Hermes est branché. Le run traverse donc toute la boucle
agentique réelle, seul l'appel modèle est simulé — ce qui permet en prime de logger exactement
ce que Hermes envoie au modèle.

---

## 3. Résultats mesurés

| # | Vérification | Résultat |
|---|---|---|
| 1 | `GET /health` sans auth | ✅ `{"status":"ok","platform":"hermes-agent","version":"0.19.0"}` |
| 2 | `GET /v1/capabilities` | ✅ contrat auto-descriptif complet |
| 3 | `GET /health/detailed` | ✅ `status=ok` |
| 4 | `GET /v1/models` | ✅ |
| 5 | Sans token | ✅ HTTP 401 |
| 6 | Mauvais token | ✅ HTTP 401 |
| 7 | `POST /v1/runs` | ✅ HTTP **202** → `{"run_id":"run_…","status":"started"}` |
| 8 | `instructions` par run acceptées | ✅ **aucun profil Hermes à créer** |
| 9 | `GET /v1/runs/:id/events` (SSE) | ✅ 6 frames, premier delta en ~136 ms |
| 10 | Frames SSE avec `id:` | ❌ **absent** → la Console doit générer sa propre `sequence` |
| 11 | `GET /v1/runs/:id` | ✅ `status=completed` + `output` + `usage` |
| 12 | Instructions honorées par le modèle | ❌ *artefact de test* — le faux LLM ignore le prompt (voir §4.1) |
| 13 | Replay SSE après complétion | ❌ **0 frame** → la Console doit persister les événements |
| 14 | Run observable en vol | ✅ `status=running` |
| 15 | `POST /v1/runs/:id/stop` | ✅ HTTP 200 → `{"status":"stopping"}` |
| 16 | Annulation → état terminal | ✅ `status=cancelled` |
| 17 | Run inconnu | ✅ HTTP 404, `code=run_not_found` |
| 18 | Pièce jointe fichier | ✅ HTTP 400 (rejet confirmé, voir §4.3) |
| 19 | `resources` sur `/v1/runs` | ⚠️ HTTP 202 mais **ignoré silencieusement** (§4.3) |
| 20 | `GET /api/sessions` | ✅ HTTP 200 |

Fixtures brutes : `spike/fixtures/` (rejouables comme mock).

---

## 4. Découvertes qui changent le PRD

### 4.1 Les agents peuvent être de purs objets locaux — **la plus grosse simplification**

Le PRD §9.2/§11.3 imposait de créer un **profil Hermes** par agent, avec un `runtimeState`
(`provisioning | ready | error | archived`), une synchronisation à réconcilier et une idempotence
« lorsque possible ». C'était un problème d'état distribué à deux sources de vérité.

**Mesure :** le champ `instructions` de `POST /v1/runs` est injecté par Hermes **à la fin de son propre
prompt système** (7214 caractères au total, marqueur trouvé à l'offset 7127) :

```
Conversation started: Wednesday, July 29, 2026
Model: ollama/fake-local
Provider: ollama-cloud
Platform: api_server

Tu es 'Agent Test Spike'. Reponds toujours en francais et termine par la balise [SPIKE-AGENT].
```

**Conséquence :** un « agent » Console = une ligne Postgres (nom + instructions + modèle). Zéro
provisioning, zéro dérive, zéro `runtimeState`. `createProfile` / `updateProfile` **disparaissent de
l'adapter**. La ligne 12 du tableau (« instructions honorées ») est un faux négatif : le faux LLM
renvoie une réponse figée. La transmission, elle, est prouvée.

### 4.2 Les statuts et les noms d'événements de la doc sont **faux**

La documentation officielle annonce des événements `assistant.delta`. Le runtime émet en réalité :

```
data: {"event": "message.delta",        "run_id": "run_…", "timestamp": 1785322738.034, "delta": "Spike OK. Tr"}
data: {"event": "reasoning.available",  "run_id": "run_…", "timestamp": 1785322738.041, "text": "…"}
data: {"event": "run.completed",        "run_id": "run_…", "timestamp": 1785322738.059, "output": "…",
       "usage": {"input_tokens":100,"output_tokens":20,"total_tokens":120}}
```

Points de forme, tous vérifiés :
- **pas de ligne `event:` SSE** — le type est *dans* le JSON, champ `"event"` ;
- **pas de ligne `id:`** — donc `Last-Event-ID` est inopérant nativement ;
- `timestamp` = epoch **flottant** en secondes, pas ISO ;
- statut en vol = `running` (la doc dit `started`).

C'est la justification à elle seule du spike : coder l'adapter sur la doc aurait produit un parser mort.

### 4.3 Les fichiers : le PRD Phase 4 est à réécrire

Deux mesures :

1. Pièce jointe via l'API → **HTTP 400** :
   > `Inline image inputs are supported, but uploaded files and document inputs are not supported on this endpoint.`
2. `resources: [{type:"file", path:"…"}]` sur `POST /v1/runs` → **HTTP 202 mais no-op** : ni le contenu
   ni le chemin n'apparaissent dans le prompt envoyé au modèle.

En revanche `/v1/capabilities` renvoie `runtime.tool_execution: "server"` et l'agent dispose de
**24 outils exécutés côté hôte Hermes**, dont `read_file`, `write_file`, `search_files`, `terminal`.

Le prompt système de Hermes le dit lui-même explicitement :
> « the runs endpoint intercepts nothing — a MEDIA: tag there renders as literal text exposing a raw
> host filesystem path. For those cases, state the plain file path in your response text instead. »

**Le vrai modèle de fichiers est donc le système de fichiers partagé**, pas l'upload API :
la Console écrit les entrées dans un répertoire par run sur l'hôte Hermes, cite le chemin dans le
prompt, l'agent lit/écrit avec ses outils, la Console scanne le répertoire pour les sorties.
→ **En Docker, cela impose un volume partagé `web` ↔ `hermes`, absent du compose §20 du PRD v0.1.**

### 4.4 Le PRD ignore complètement les **approbations**

`/v1/capabilities` expose `approval_events: true`, `run_approval_response: true`, et l'endpoint
`POST /v1/runs/{run_id}/approval`. Un agent doté de `terminal` et `write_file` **peut bloquer en
attendant une autorisation humaine**. Le PRD v0.1 n'a ni ce statut, ni cet écran, ni cette route :
un run resterait figé « en cours » sans que l'utilisateur sache qu'on l'attend.

C'est le seul manque fonctionnel réellement bloquant pour le parcours critique.

### 4.5 `/v1/capabilities` remplace la « vérification de compatibilité »

Le PRD §7 exigeait une « vérification de la compatibilité minimale » sans jamais définir le contrat.
Le runtime fournit mieux : une découverte de fonctionnalités machine-lisible. On stocke la version
pour l'afficher, et on **gate sur les `features`**, pas sur un numéro de version.

### 4.6 Réconciliation : le mécanisme existe

`GET /v1/runs/{id}` renvoie l'état + l'`output` final sans maintenir de connexion SSE. C'est
exactement la source de vérité qui manquait au PRD pour la reprise après redémarrage. Attention :
les états terminaux ne sont conservés que « brièvement » et le buffer d'événements expire — mesuré,
un reconnexion après complétion renvoie **0 frame**. La Console doit persister ; elle ne peut pas
déléguer l'historique au runtime.

---

## 5. Ce que le spike n'a pas prouvé *(mis à jour après les passes 0b/0c)*

Restent non mesurés :

- **Pas de test en Docker.** Tout est validé en installation native. Le volume partagé et le réseau
  interne restent à valider.
- **Pas de run long** (> 5 min), donc l'expiration du buffer d'événements n'a pas été observée sur un
  cas réel, seulement déduite de la doc et du replay vide.
- **Pas de test de charge** ni de runs concurrents.
- **Le cycle d'approbation complet** (`approval.request` → `POST /approval` → reprise) n'a **jamais pu
  être observé**, faute d'avoir réussi à le déclencher. Cf. §8.

Levé depuis : les événements outils, le volume de deltas, la transmission des instructions et le
modèle de fichiers sont désormais mesurés sous vrai modèle (§6 et §7).

---

## 6. Passe 0b — sous vrai modèle (`gpt-5.4-nano`)

Sonde : `spike/probe-real.ts`. Deux runs réels.

### 6.1 Run avec outils + aller-retour fichiers

Prompt : lire `<workdir>/in/notes.txt`, additionner les nombres, écrire le total dans
`<workdir>/out/total.txt`.

| Mesure | Valeur |
|---|---|
| Événements | 17 en 13 782 ms |
| Répartition | 9 `message.delta`, 3 `tool.started`, 3 `tool.completed`, 1 `reasoning.available`, 1 `run.completed` |
| Premier delta | 13 614 ms (l'agent outille d'abord, puis rédige) |
| Statut final | `completed` |
| Sortie | `"20\n[SPIKE-AGENT]"` |
| Consommation | **38 387 tokens d'entrée**, 350 de sortie |

**Deux validations majeures :**

1. **Les instructions par run sont réellement honorées.** Le marqueur `[SPIKE-AGENT]` demandé via
   `instructions` figure dans la sortie. Ce que la passe 0a ne pouvait que déduire du prompt système
   est maintenant prouvé de bout en bout : **l'hypothèse « agents = objets purement locaux » tient**.
2. **Le modèle de fichiers du PRD §16 fonctionne.** L'agent a lu `in/notes.txt`, calculé 3+5+12, et
   écrit `out/total.txt` contenant `20`. L'aller-retour par système de fichiers partagé est validé.

**Coût à retenir :** ~38 k tokens d'entrée pour un prompt trivial. Le prompt système de Hermes et ses
24 outils sont facturés à **chaque** mission. À intégrer dans l'affichage produit (`usage` est déjà
renvoyé) et dans toute projection de coût.

### 6.2 Volume de deltas — dimensionnement du coalescing

Run bavard (paragraphe de 150 mots, sans outil) :

| Mesure | Valeur |
|---|---|
| `message.delta` | **224** |
| Caractères | 903 |
| Durée | 6 668 ms |
| Débit | **33,6 deltas/s**, moyenne **4,0 caractères par delta** |

**Conclusion :** persister un delta par ligne est exclu. À 33,6 deltas/s, un flush toutes les 200 ms
regroupe ~6,7 deltas et divise le volume de lignes par ~7. La règle §13.1 du PRD est confirmée
chiffrée, pas supposée.

### 6.3 Formes exactes des événements

```json
{"event":"tool.started",       "run_id":"run_…","timestamp":1785324127.2199,"tool":"read_file","preview":"notes.txt L1-2000"}
{"event":"tool.completed",     "run_id":"run_…","timestamp":1785324127.4575,"tool":"read_file","duration":0.237,"error":false}
{"event":"message.delta",      "run_id":"run_…","timestamp":1785324131.3107,"delta":"\n\n20"}
{"event":"reasoning.available","run_id":"run_…","timestamp":1785324131.4707,"text":"20\n[SPIKE-AGENT]"}
{"event":"run.completed",      "run_id":"run_…","timestamp":1785324131.4802,"output":"20\n[SPIKE-AGENT]",
                               "usage":{"input_tokens":38387,"output_tokens":350,"total_tokens":38737}}
```

**Deux pièges de nommage, corrigés dans le PRD :**

- **`reasoning.available` n'est pas du raisonnement.** C'est le **texte final complet**, doublon de
  `run.completed.output`. Le mapper vers un événement « réflexion de l'agent » afficherait la réponse
  deux fois. → à ignorer, ou à traiter comme `system.notice`.
- **`tool.completed` ne transporte aucun résultat.** Seulement `tool`, `duration`, `error` (booléen).
  La Console peut afficher « `read_file` a tourné 0,237 s sans erreur », **jamais ce qui a été lu**.
  C'est une infériorité assumée face au TUI, à documenter dans la vue « événements bruts ».

---

## 7. Fixtures ajoutées

`real-run-events.json`, `real-run-event-counts.json`, `real-run-status.json`,
`real-run-artifacts.json`, `real-run-chatty-counts.json`, `real-event-shapes.json`,
`approval-flow.json`.

---

## 8. Passe 0c — approbations : **fail-open confirmé** ⚠️

Sonde : `spike/probe-approval.ts`. Protocole : créer un fichier jetable dans `/tmp`, demander à
l'agent de le supprimer, et **refuser** l'approbation attendue.

**Résultat : aucune approbation n'a été demandée. La commande s'est exécutée, le fichier a été
supprimé.**

```json
{"event":"tool.started","tool":"terminal","preview":"rm -f /tmp/hermes-spike-deleteme.txt + 1 command"}
{"event":"tool.completed","tool":"terminal","duration":1.228,"error":false}
approvalEvent: null
fileSurvived: false
```

Ce n'est pas un défaut de détection. Interrogé directement, le détecteur de Hermes classe bien la
commande exacte comme dangereuse :

```python
>>> detect_dangerous_command('rm -f /tmp/hermes-spike-deleteme.txt')
(True, 'delete in root path', 'delete in root path')
```

Le mécanisme existe pourtant : `gateway/platforms/api_server.py:6243-6266` émet `approval.request`,
bascule le run en `waiting_for_approval` et attend `POST /v1/runs/{id}/approval`. Il n'a simplement
pas été sollicité sur ce chemin. Le code l'explique — `tools/approval.py:2885` :

> « The dangerous-command path keeps the historical **fail-open** default. »

### Conséquences

1. **Correction du PRD.** La v0.2 affirmait en §16 : « c'est le mécanisme d'approbation qui constitue
   le garde-fou ». **C'est faux par défaut.** Corrigé.
2. **Le vrai périmètre de risque** est celui du compte qui exécute Hermes. En installation native,
   c'est le compte utilisateur complet — l'agent a écrit et supprimé dans `/tmp` sans obstacle.
3. **Conséquence d'architecture :** l'isolation ne peut pas être déléguée au runtime. En v0.1,
   Hermes doit tourner **en conteneur**, avec un volume de travail dédié, et non en natif sur la
   machine de l'utilisateur. C'était une commodité de déploiement ; c'est désormais une exigence.
4. **À investiguer avant la Phase 3 :** existe-t-il une configuration (`approvals.*`,
   `HERMES_GATEWAY_SESSION`, mode cron) qui bascule la route `/v1/runs` en fail-closed ? Si oui,
   l'activer et la documenter. Sinon, l'écran d'approbation du PRD §9.5 est une UI sans déclencheur,
   et le confinement par conteneur devient l'unique garde-fou.

Aucun dégât : le seul fichier supprimé était le fichier jetable créé pour ce test.

---

## 9. Verdict

Le parcours critique du PRD — *créer un agent → lancer une mission → voir l'exécution → récupérer le
résultat* — est **réalisable sur l'API réelle**, avec un adapter nettement plus simple que prévu, et
il a été exécuté de bout en bout sous vrai modèle, fichiers compris.

On continue. Le PRD est mis à jour en **v0.3** (`docs/PRD.md`).

**Une condition ajoutée :** le confinement de Hermes en conteneur passe de commodité à exigence
(§8). Tant que ce point n'est pas traité, la Console ne doit pas être exposée à un utilisateur tiers.

---

## 10. Reproduire

```bash
# 1. runtime — nécessite OPENAI_API_KEY dans ~/.hermes/.env
hermes gateway run                      # API server sur :8642

# 2. passe 0a — protocole, sans aucune clé provider
cd spike && bun install
bun run fake-llm.ts &                   # faux LLM OpenAI-compatible
bun run probe.ts                        # 20 vérifications de protocole

# 3. passes 0b/0c — sous vrai modèle (consomme des tokens)
bun run probe-real.ts                   # outils, deltas, aller-retour fichiers
bun run probe-approval.ts               # tentative de déclenchement d'approbation
```

> La passe 0a reste utilisable **sans clé** : c'est elle qui fournira le mock déterministe des
> tests E2E. Les passes 0b/0c consomment de vrais tokens (~40 k d'entrée par run).

---

## 11. Passe 5 — continuité de conversation et sorties d'outils

**Date :** 30-07-2026 · **Runtime :** Hermes Agent v0.19.0 sur `kev@192.168.1.57` (tunnel SSH)
· **Modèle :** `gpt-5.4-nano` · **Session de test :** `api_1785434743_0095df03`

### 11.1 Le défaut observé en production

Deux missions consécutives d'un même thread Console :

| run | input | sortie |
|---|---|---|
| `run_cc69134c` | `execute une research de météo` | demande la ville — correct |
| `run_e29cf69f` | `paris là à cette heure ci` | **donne l'heure**, pas la météo |

`createHermesAgentRun` ne postait que `input` + `instructions` : le 2ᵉ run n'a jamais vu le mot
« météo ». Ce n'est pas un défaut de modèle, c'est un contexte amputé par la Console.

### 11.2 `POST /v1/runs` accepte déjà `conversation_history` — MESURÉ

`api_server.py:6107-6148` accepte `conversation_history: [{role, content}]` (précédence la plus
haute), `previous_response_id`, et un `input` multi-messages. Rejoué à l'identique, en ajoutant
les deux messages précédents :

```jsonc
// même input, avec conversation_history
{"event":"tool.started","tool":"terminal","preview":"curl -s 'https://wttr.in/Paris?format=%C+%t+%w+%h+%p'"}
{"event":"run.completed","output":"Météo à Paris à l’instant (source: wttr.in) : Ensoleillé, 33°C.
 Vent: 10 km/h (↑). Humidité: 25%. Précipitations: 0.0 mm.",
 "usage":{"input_tokens":25366,"output_tokens":344}}
```

→ **La continuité ne demande aucun changement de protocole.** On reste sur `/v1/runs`, donc on
garde `run_stop`, les approbations et la réconciliation.

### 11.3 `session_id` ne rejoue PAS l'historique — MESURÉ

Contre-épreuve, même `session_id`, **sans** `conversation_history` :

```jsonc
{"event":"run.completed","output":"Tu parles de quoi exactement “et à Lyon” ? (météo, prix,
 horaires, événement, itinéraire, autre)","usage":{"input_tokens":12417}}
```

12 417 tokens d'entrée contre 25 366 : aucun historique injecté. Contrairement à
`/api/sessions/{id}/chat/stream` qui appelle `_conversation_history_for_session`, le chemin
`/v1/runs` ne lit jamais la session pour construire le prompt.

**Conséquence de conception :** les deux mécanismes sont **orthogonaux**, sans risque de doublon.
La Console reste la source de vérité de l'historique (Postgres → `conversation_history`) ; le
`session_id` ne sert qu'à la persistance côté runtime.

### 11.4 Les sorties d'outils sont récupérables — MESURÉ

`tool.completed` du flux `/v1/runs` ne transporte toujours aucun résultat (cf. §4.2). Mais avec un
`session_id` stable, `GET /api/sessions/{id}/messages` expose le tour complet :

```jsonc
{"role":"tool","tool_name":"terminal","tool_call_id":"call_zIhrlAkf8IV63587Gswo9awH",
 "content":"{\"output\": \"Sunny +33°C ↗10km/h 25% 0.0mm\", \"exit_code\": 0, \"error\": null}"}
```

→ `hasResultPayload: false` codé en dur dans `lib/hermes-events.ts` cesse d'être une fatalité :
la Console peut **backfiller** les sorties après `run.completed`, en appariant sur `tool_name`
dans l'ordre FIFO (même appariement que le normaliseur, faute d'identifiant dans le flux SSE).

### 11.5 Ce que la passe 5 n'a pas prouvé

- Le comportement sous **runs concurrents partageant un `session_id`** (l'ordre FIFO du backfill
  pourrait alors mal apparier). Les threads Console ayant chacun leur session, le cas ne se
  présente pas aujourd'hui — à revérifier si un thread lance plusieurs missions en parallèle.
- La **taille** que peut atteindre `conversation_history` avant troncature côté runtime : un
  thread long finira par devoir être fenêtré côté Console.

### 11.6 Reproduire

```bash
TOK=$(sed -n 's/^API_SERVER_KEY=//p' ~/.hermes/.env | head -1 | tr -d '"')
SID=$(curl -s -X POST -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' \
  -d '{"title":"spike-phase5"}' http://127.0.0.1:8642/api/sessions | jq -r .session.id)

# 11.2 — avec historique : le modèle comprend « météo »
curl -s -X POST -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' \
  -d "{\"input\":\"paris là à cette heure ci\",\"model\":\"gpt-5.4-nano\",\"session_id\":\"$SID\",
       \"conversation_history\":[{\"role\":\"user\",\"content\":\"execute une research de météo\"},
       {\"role\":\"assistant\",\"content\":\"Quelle ville ?\"}]}" http://127.0.0.1:8642/v1/runs

# 11.4 — les messages role=tool portent leur sortie
curl -s -H "Authorization: Bearer $TOK" http://127.0.0.1:8642/api/sessions/$SID/messages | jq
```
