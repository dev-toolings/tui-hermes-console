# Recette locale — US-G1-004A — policy decision fail-closed

Ce slice implémente uniquement un contrat de décision signé et un enforcer de référence local. Il
ne branche pas le runner, `respond-approval` ou l'adaptateur Hermes.

## Contrat v1

L'enveloppe stricte contient `domain`, `version`, `policyVersion`, `algorithm`, `keyId`, `decisionId`,
`requestId`, `runId`, `siteId`, `correlationId`, `actionKind`, `scopeId`, `payloadSha256`, `outcome`,
`approverUserId`, `approverRole`, `issuedAtMs`, `expiresAtMs`, `nonce`, `publicKey` et `signature`.
La signature Ed25519 porte sur le tuple canonique préfixé par
`hermes-console/policy-decision/v1\0`; le `policyVersion` numérique `1` suit immédiatement `version`.
L'action du fixture est volontairement unique : `fixture.marker.write`.

Règles fail-closed :

- TTL strictement positif et inférieur ou égal à cinq minutes ; timestamps en millisecondes ;
- nonce base64url d'au moins 16 octets ; payload hashé sur les octets exacts ;
- domaine, algorithme, clé, signature, approbateur, portée et champs inconnus refusés ;
- policy absente/indisponible ou outcome `deny` refusent l'effet ;
- nonce consommé atomiquement avant le premier `await` de l'effet ; replay refusé, y compris après un
  effet qui échoue.

## Exécuter la preuve locale

```sh
bun run proof:g1-004
# alias équivalent : bun run proof:g1-004a
```

Le harness utilise une clé Ed25519 en mémoire et un compteur synthétique `fixture.marker.write`.
Il ne touche ni PostgreSQL, ni le filesystem métier, ni Hermes, ni une cible distante.

## Limite de décision

Cette recette produit seulement `P-CODE` et `P-INT` local. Elle ne fournit pas `P-SEC`, `P-E2E`, une
clé opérateur persistée, une policy store réelle, l'interception du runner avant tout effet ou une
preuve de non-contournement sur Hermes. La story G1-004 complète reste donc ouverte/bloquée.
