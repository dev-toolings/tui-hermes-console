# Preuve — US-G1-004 — préflight Hermes déployé

- **Date :** 04-08-2026
- **Cible :** `hermes-ephemeral-01` — `192.168.1.210`, VMID 210
- **PVE :** 9.2.6
- **Hermes :** 0.20.0, écoute locale `127.0.0.1:8642`
- **Accès :** tunnel SSH avec `known_hosts` strict ; clé API Hermes lue côté cible sans être
  affichée ni copiée dans le dépôt

## Observations positives

- `GET /health` authentifié : HTTP 200, version `0.20.0`.
- `GET /v1/capabilities` authentifié : HTTP 200 ; les capacités `run_submission`,
  `approval_events` et `run_approval_response` sont annoncées.
- `GET /v1/models` authentifié : HTTP 200.

## Rejeu réel négatif

Un run de recette inoffensif a été soumis via `POST /v1/runs` : le prompt demandait uniquement
`printf G1_004_RUNTIME_PROBE`, sans autre outil ni action.

- réponse de création : HTTP 202 ; run `run_27c6ccc146974fc78dac00c4765af7f0` ;
- lecture immédiate : `status=failed` ;
- erreur Hermes : `Provider authentication failed: No inference provider configured`.

Le run n’a jamais atteint `waiting_for_approval`. Aucun `POST /v1/runs/:id/approval` n’a été
envoyé et aucun effet terminal n’a été déclenché. Cette preuve établit donc la disponibilité et
la limite actuelle du runtime, mais ne constitue pas une preuve P-E2E de la policy pré-effet.

## Conclusion Gate 1

Le prochain rejeu doit configurer un provider d’inférence dans le secret manager de la cible,
puis répéter le scénario avec un opérateur 2 : atteindre `waiting_for_approval`, vérifier les
quatre refus pré-effet et l’absence d’effet, puis exécuter le chemin autorisé. Aucune clé provider
n’a été inventée ou transférée pendant cette recette.
