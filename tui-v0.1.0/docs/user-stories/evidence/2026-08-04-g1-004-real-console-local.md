# Preuve — US-G1-004D — route Console réelle en local

- **Date :** 04-08-2026
- **Runtime :** Hermes local 0.20.0, provider configuré hors dépôt
- **Harness :** `bun run proof:g1-004-real`
- **Secret :** `HERMES_RUNTIME_TOKEN` injecté uniquement au lancement, jamais imprimé ni écrit

## Résultats observés

Le harness démarre une PostgreSQL éphémère, un serveur Console séparé et utilise le vrai Hermes
local. Il génère la paire Ed25519 policy en mémoire, crée un site/run/approbateur réel, puis exerce
`POST /api/runs/:runId/approval`.

```text
G1-004D positive=real-console-route policy=pass no-terminal-effect=pass
G1-004D negative=real-console-route policy-unavailable=pass remote-untouched=pass
positive: route / postgresClaim / signedPolicy / hermesApproval / noTerminalEffect = pass
negative: policyUnavailable / remoteUntouched / recovery = pass
```

- Le choix `deny` traverse le claim PostgreSQL, l'enforcer signé, puis le vrai adaptateur Hermes.
  Hermes bloque la commande destructive de probe et aucun chemin n'est créé.
- Avec les clés policy absentes, l'API répond `503`, le run Hermes reste suspendu et aucun POST
  distant d'approbation n'est envoyé.
- Après redémarrage Console, le run est repris puis clôturé avec l'état réel Hermes.

Cette recette a aussi révélé puis validé deux corrections nécessaires : les audits `denied` gardent
des états avant/après strictement identiques malgré le proof signé, et un `404` du flux SSE après
une terminaison Hermes relit l'état canonique avant de déclarer un échec.

## Limites Gate 1

La recette est locale : elle ne remplace pas le rejeu sur la VM 210. Le préflight PVE 210 reste
bloqué par l'absence de provider d'inférence, et la revue P-SEC ainsi que les signatures reviewer
et opérateur 2 restent obligatoires.
