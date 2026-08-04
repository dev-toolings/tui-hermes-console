# Preuve — US-G1-004 — P-E2E Hermes local

- **Date :** 04-08-2026
- **Cible :** Hermes local `127.0.0.1:8642`
- **Hermes :** 0.20.0, `/health` HTTP 200
- **Secret :** clé API lue depuis l'environnement local sans être affichée ni enregistrée

## Rejeu approval réel

1. Un run Hermes réel a été créé avec une commande de probe `rm -rf` ciblant uniquement un
   répertoire inexistant : `run_d794afdc8e79432da13651c65f4a5570`.
2. Le run a atteint `waiting_for_approval` ; le chemin était absent avant la décision.
3. Un refus direct `POST /v1/runs/:id/approval` avec `{choice: "deny", approved: false}` a
   répondu HTTP 200.
4. Hermes a terminé le run avec `BLOCKED: Command denied by user` et le chemin est resté absent.

## Rejeu avec la policy Console

Un second run réel a été suspendu avant la même commande :
`run_3ddb9995c20e4339a3298394d832131e`.

- `enforceHermesApproval` a produit une décision `actionKind=hermes.run.approval` liée à la
  portée `approval-local-policy-proof` ;
- l'autorité Ed25519 a été générée en mémoire uniquement ;
- l'effet réel appelé après l'enforcer était `respondHermesApproval` vers le Hermes local ;
- la réponse distante était HTTP 200 ;
- le run final a de nouveau rapporté `BLOCKED: Command denied by user` ;
- `PROBE_PATH_EXISTS=0` après la décision.

Cette preuve démontre le branchement policy/adaptateur contre un Hermes réel et l'absence d'effet
terminal après refus. Elle ne vaut pas encore preuve du routeur `respondRunApproval` avec claim
PostgreSQL, ni P-E2E sur la VM 210 : celle-ci reste bloquée par l'absence de provider d'inférence,
comme documenté dans [le préflight PVE](2026-08-04-g1-004-hermes-runtime-preflight.md).
