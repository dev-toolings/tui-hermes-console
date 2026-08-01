# Preuve — G1-007A post-setup local

- **Date :** 01-08-2026
- **Story :** `US-G1-007A-post-setup-local`, sous-slice de `US-G1-007`
- **Environnement :** Bun, serveur Hono inter-process, PostgreSQL Docker `17.6-alpine` épinglé
  par digest, racines de travail et d'artefacts scratch
- **Cible runtime :** faux Hermes HTTP/SSE local, sans secret ni donnée client
- **Commande :** `bun run proof:g1-007a`
- **Verdict :** `VÉRIFIÉE` pour ce slice local ; `US-G1-007` reste `PROPOSÉE` et Gate 1 n'est pas
  acceptée

## Résultat machine

```json
{
  "positive": {
    "setup": "completed",
    "agentThreadRun": "pass",
    "approvalRequestId": "pass",
    "casAuditRelay": "pass",
    "restartReconciliation": "pass",
    "artifactBytesAndHash": "pass"
  },
  "negative": {
    "runtimeUnavailable": "pass",
    "expiredSession": "pass",
    "invalidCsrf": "pass",
    "denyNoEffect": "pass",
    "missingOrCorruptArtifact": "pass"
  },
  "hermesApprovalPosts": 2,
  "dangerousEffectCount": 1
}
```

Le premier POST Hermes est `once` et produit exactement un effet/artefact. Le second est `deny` et
ne produit aucun effet. Le harness vérifie dans `audit_ledger_entries` que l'intention persistée
(`RUN_APPROVAL_INTENT`) précède le POST observé par le faux Hermes et l'outcome
`RUN_APPROVAL_ALLOWED`, avec le même `approvalRequestId`.

## Couverture

- health/capabilities Hermes synthétiques, cookie de session, CSRF et consentement IA seedés dans
  PostgreSQL ;
- agent → thread/run → SSE `approval.request` → identité → CAS/audit → POST Hermes ;
- arrêt/reprise pendant `awaiting_approval`, puis second remplacement après completion ; artefact
  output, taille/octets/SHA-256 et lecture depuis les mêmes racines ;
- refus runtime, session expirée, CSRF invalide, refus humain sans effet et stockage absent/corrompu.

## Écarts ouverts

Cette preuve ne couvre pas une installation vierge, Google OIDC, un navigateur réel, Hermes
upstream, la policy OS, P-SEC/P-OPS ou une acceptation Gate. Le premier remplacement intervient
pendant `awaiting_approval` ; la fixture conserve un curseur d'événement pour que la réconciliation
ne réémette pas artificiellement `approval.request`. Un second remplacement après completion vérifie
la durabilité DB/racines. Cela ne constitue toujours pas une preuve Hermes upstream ou d'une reprise
sur cible de production.

## Nettoyage

Le harness supprime explicitement son conteneur PostgreSQL, son processus Console et ses deux
répertoires temporaires, y compris en cas d'échec.
