# Décision — Gel de `US-G1-SSH-001` et de sa chaîne de dépendances

- **Date :** 04-08-2026
- **Story concernée :** `US-G1-SSH-001` (et par cascade `US-G1-SSH-002` à `US-G1-SSH-009`)
- **Nature :** décision de séquencement, pas une preuve et pas une dérogation
- **Décideur :** commanditaire du projet
- **État résultant :** `BLOQUÉE` maintenu, avec obstacle et propriétaire documentés

## Ce qui est décidé

`US-G1-SSH-001` est gelée. Aucune campagne de preuve n'est relancée sur elle ni sur les stories qui
en dépendent tant que le critère de dégel n'est pas satisfait.

Ce document n'est pas une dérogation au sens de `CONVENTIONS.md`. Aucune exigence n'est levée, aucun
contrôle non fail-closed n'est revendiqué comme contrôle de sécurité. La story reste due.

## Pourquoi

Le scénario négatif de `US-G1-SSH-001` disqualifie explicitement un hôte déjà occupé. La seule cible
disponible, `187.55.227.55`, est occupée. Le
[diagnostic read-only du 01-08-2026](2026-08-01-gate-1-ssh-vps-18755-diagnostic.md) établit :

- Docker Swarm `active`, stacks `caddy`, `ghostsearch`, `pulsevault`, `qualiopi-audit-tracker` ;
- ports publics `80` et `443` servis ;
- `permitrootlogin yes`, `permitopen any`, `forcecommand none` ;
- aucun utilisateur `hermes-console`, aucun processus Hermes.

Le run automatisé du 04-08-2026 confirme la conséquence directe côté transport :
[`2026-08-04-ssh-001-002-18755-diagnostic.md`](2026-08-04-ssh-001-002-18755-diagnostic.md) sort en
`BLOQUÉ (255)` sur `hermes-console@187.55.227.55: Permission denied (publickey)`, ce qui est le
comportement attendu sur un hôte où le compte de service n'a jamais été créé.

## Portée du gel

```text
╔═══════════════════════════╗
║  US-G1-SSH-001  (GELÉE)   ║
╚═════════════╤═════════════╝
              │ dépendance directe
              ▼
╔═══════════════════════════╗     ╔═══════════════════════════╗
║  US-G1-SSH-002            ║────▶║  US-G1-SSH-003            ║
╚═══════════════════════════╝     ╚═════════════╤═════════════╝
                                                │
              ┌─────────────────┬───────────────┼───────────────┐
              ▼                 ▼               ▼               ▼
        ┌───────────┐     ┌───────────┐   ┌───────────┐   ┌───────────┐
        │  SSH-004  │     │  SSH-005  │   │  SSH-006  │   │  SSH-008  │
        └───────────┘     └─────┬─────┘   └─────┬─────┘   └───────────┘
                                └────────┬──────┘
                                         ▼
                                   ┌───────────┐
                                   │  SSH-007  │
                                   └─────┬─────┘
                                         ▼
                                   ┌───────────┐
                                   │  SSH-009  │
                                   └───────────┘

  Hors périmètre du gel :  US-G1-SSH-010  →  déjà `VÉRIFIÉE` sur cible réelle
```

Légende : toute flèche est une dépendance déclarée dans `SSH-STORIES.md`. Le gel de la racine
interdit l'acceptation de tout nœud aval, indépendamment des preuves partielles déjà produites.

## Conséquence sur l'epic parente

`US-G1-008` dépend de la recette SSH complète. Elle reste `BLOQUÉE` et le restera pendant toute la
durée du gel. Gate 1 ne peut donc pas être acceptée sur son volet SSH.

## Critère de dégel

Un hôte satisfaisant les quatre conditions suivantes, simultanément :

1. fraîchement provisionné, aucun workload applicatif ;
2. aucun compte `hermes-admin` ni `hermes-console` préexistant ;
3. empreinte d'hôte lisible hors bande (panel fournisseur ou console KVM) ;
4. dédié à la recette, donc destructible sans impact.

## Ce qui reste valide malgré le gel

- `docs/user-stories/scripts/run-ssh-001-002.sh` est fonctionnel et corrigé (voir ci-dessous).
- La procédure de `NEXT-ACTION-GATE1-SSH-2026-08-04.md` reste applicable telle quelle au dégel.
- `US-G1-SSH-010` conserve son état `VÉRIFIÉE`.

## Correctif embarqué dans la même décision

`run-ssh-001-002.sh` comparait l'empreinte fournisseur à la **première** ligne de `ssh-keyscan`
(`head -n 1`). Or `ssh-keyscan` scanne les types de clés en parallèle et renvoie un ordre non
déterministe : les deux runs du 04-08-2026 le démontrent, la RSA sort en tête à 08:47 et l'ED25519 à
08:44 pour le même hôte.

Une empreinte fournisseur valide pouvait donc être rejetée en `Refus strict`, indistinguable d'une
véritable substitution d'hôte. Le script compare désormais l'empreinte attendue à **toutes** les clés
scannées et journalise explicitement celles qui restent non vérifiées hors bande.

Ce correctif est indépendant du gel et bénéficiera au dégel.
