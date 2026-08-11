# RAF concret — Gate 1 après le rejeu runtime

Date: 2026-08-04

> **Actualisation du 04-08-2026 :** le prérequis VPS vierge est maintenant fourni par
> `hermes-ephemeral-01` (`192.168.1.210`), créé via Terraform/pvecli puis préparé par Ansible.
> La campagne runtime est maintenant rejouée : `US-G1-002` et `US-G1-002D` passent techniquement
> en local `~/.hermes` et sur la VM 210 en system-wide/Docker ; SSH-003/004/005 passent aussi
> techniquement. Le passage en `VÉRIFIÉE` reste interdit sans reviewer indépendant et opérateur 2.

Ce document fige le reste à faire, avec un propriétaire et une preuve de sortie. Aucun nouveau
développement n'est requis pour `US-G1-002D` tant qu'un rejeu indépendant ne révèle pas un échec.

╔════════════════════╗
║ Preuves déjà vertes║
║ local / PVE 210    ║
╚════════════════════╝
          │ revue indépendante des faits
          ▼
┌──────────────────────────┐
│ Rejeu opérateur 2         │
│ update + SSH-008          │
└──────────────────────────┘
          │ rapport daté + négatifs
          ▼
╔════════════════════╗
║ Revue Gate 1       ║
║ GO / NO-GO / PIVOT ║
╚════════════════════╝

Légende : les flèches indiquent la preuve nécessaire avant l'étape suivante. Composants : preuves
runtime, opérateur distinct, recette SSH, reviewer sécurité/exploitation et décision Gate 1.

## RAF priorisé et concret

| Rang | Action | Propriétaire | Dépendance | Preuve de sortie | État |
|---|---|---|---|---|---|
| R0 | Geler le code runtime et remettre le dossier de preuve au reviewer | Implémenteur | preuve actuelle | lien vers `2026-08-04-g1-002-latest-docker-native.md`, aucun commit/push dans ce passage | PRÊT |
| R1 | Revue indépendante de `US-G1-002` + `US-G1-002D` : code, playbooks, manager, privilèges, preuve PVE 210 | Reviewer sécurité/exploitation distinct | R0 | rapport signé, réserves classées, verdict technique | OUVERT |
| R2 | Rejouer le parcours `/updates` en local `~/.hermes`, system-wide PVE et Docker PVE | Opérateur 2 / QA | R1 | captures/IDs d'opération, version/health, second passage, état final exclusif | OUVERT |
| R3 | Exécuter SSH-008 : rotation/révocation de l'identité SSH et fermeture des sessions | Ops + reviewer | SSH-003/005 | [preuve SSH-008 VM 210](evidence/2026-08-04-ssh-008-hermes-ephemeral-01.md), ancienne clé inutilisable, sessions fermées, SLA ~315 ms | TECHNIQUEMENT PASSÉ |
| R4 | Retirer SSH-006/007/009 et le transfert distant de la décision Gate 1 | Produit + responsable Gate | décision produit | stories et code supprimés, aucun scénario de transfert dans le RAF actif | FAIT |
| R5 | Brancher et prouver la policy pré-effet Hermes de `US-G1-004` | Responsable sécurité + implémenteur policy | US-G1-002 | [G1-004D](guides/G1-004D-HERMES-PRE-EFFECT.md), [harness route Console réelle](evidence/2026-08-04-g1-004-real-console-local.md), refus avant POST, décision signée corrélée au run | TECHNIQUEMENT PASSÉ — local réel ; PVE 210 provider absent |
| R6 | Décider Gate 1, puis seulement ouvrir Gate 2 | Responsable sécurité/exploitation + produit | R1 à R5 | rapport `GO`, `NO-GO` ou `PIVOT` et traceability signée | BLOQUANT |

### Critères de sortie R1/R2

Le runtime update est accepté uniquement si le reviewer et l'opérateur 2 constatent tous les points
suivants :

- local `~/.hermes`, system-wide et Docker atteignent Hermes `0.20.0` avec `/health` HTTP 200 ;
- system-wide suit `main` sans `--commit`, Docker suit `latest` puis exécute le digest résolu ;
- le compte `hermes-console` ne peut ni faire `sudo` général ni utiliser Docker ;
- un échec de santé ou de transport est visible et ne laisse pas le nouveau runtime déclaré sain ;
- un second passage ne change rien et l'ancien mode reste arrêté selon l'exclusivité ;
- les deux opérations UI sont corrélées au rapport et aucune ressource temporaire ne subsiste.

### Décision actuelle

`US-G1-002` et `US-G1-002D` sont **IMPLÉMENTÉES techniquement**, mais pas `VÉRIFIÉES`. Le prochain
acte concret est R1, confié à une personne distincte de l'implémenteur ; R2 doit ensuite être rejoué
par un opérateur 2. Les vrais blocages Gate 1 restants sont `US-G1-004` et le sous-périmètre SSH
actif, notamment `US-G1-SSH-002/008`. Le transfert de fichiers distant n'est plus un blocage.

## Annexe — recette SSH détaillée

Les commandes ci-dessous restent le runbook historique des sous-stories SSH ; elles ne remplacent pas
le rapport daté ni la revue indépendante demandés par R3. Les anciennes sections de transfert ne sont plus à exécuter.

### Commandes de pré-exécution (avant connexion réelle)

- Vérifier la cible réellement neuve (aucune clé `hermes-console`, port/UID anormaux, SSH non durci).
- Exporter les variables de contexte (date, alias site expurgé, IP/host, opérateur).
- Mettre de côté la commande de sortie du tunnel et l’identité admin de secours.

## Commandes opérationnelles immédiates

### Préambule (console locale)

```sh
export SSH_TRACE_DATE_UTC="$(date -u +%FT%TZ)"
export SSH_TRACE_DATE_LOCAL="$(date -Iseconds)"
export HOST_ALIAS="hermes-ephemeral-01"   # expurgé, non secret
export HOST_IP="198.51.100.55"            # expurgé si IP sensible
export SSH_HOST_KEY_PORT="22"
export SSH_IDENTITY="$HOME/.ssh/hermes-console"
```

### US-G1-SSH-001 (bootstrap cible vierge)

```sh
# 0) Préparer le répertoire SSH local
mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh"

# Option 2: exécution semi-automatisée (optionnel, non remplaçable par preuve manuelle)
# sh docs/user-stories/scripts/run-ssh-001-002.sh
# (écrit un rapport horodaté sous evidence/ ; ou renseigner explicitement EVIDENCE_FILE=...)

### Exemple concret prêt à exécuter
```sh
HOST_ALIAS="hermes-ephemeral-01" \
HOST_IP="203.0.113.12" \
SSH_HOST_KEY_PORT="22" \
SSH_IDENTITY="$HOME/.ssh/hermes-console" \
SSH_PROVIDER_FINGERPRINT="SHA256:zzzz..." \
EVIDENCE_FILE="docs/user-stories/evidence/2026-08-04-ssh-001-002-hermes-ephemeral-01.md" \
sh docs/user-stories/scripts/run-ssh-001-002.sh
```

# 1) Vérification hors production: inventaire avant intervention (à vide sur VPS vierge)
ssh-keyscan -T 5 -p "$SSH_HOST_KEY_PORT" "$HOST_IP" | tee "/tmp/${HOST_ALIAS}.hostkey-before"
ssh-keygen -l -f "/tmp/${HOST_ALIAS}.hostkey-before"

# 2) Depuis console fournisseur ou shell temporaire: création admin + service + clés publiques
#    (exécuter sur la cible avec un accès hors-Console)
adduser --disabled-password --gecos '' hermes-admin
adduser --disabled-password --gecos '' hermes-console
```

### US-G1-SSH-002 (empreinte d’hôte vérifiée hors bande)

```sh
# 3) Empreinte officielle lue une seule fois (hors clé)
ssh-keyscan -T 5 -p "$SSH_HOST_KEY_PORT" "$HOST_IP" > "$HOME/.ssh/${HOST_ALIAS}.known_hosts.pending"
ssh-keygen -lf "$HOME/.ssh/${HOST_ALIAS}.known_hosts.pending"

# 4) Comparer l’empreinte avec la source fournisseur hors-bande avant acceptation
#    (doit être 100 % identique, caractère par caractère)
ssh-keygen -lf "$HOME/.ssh/${HOST_ALIAS}.known_hosts.pending"

# 5) Acceptation stricte si correspondance exacte
mv "$HOME/.ssh/${HOST_ALIAS}.known_hosts.pending" "$HOME/.ssh/${HOST_ALIAS}.known_hosts"
chmod 600 "$HOME/.ssh/${HOST_ALIAS}.known_hosts"
```

### Exécution semi-automatisée recommandée

```sh
HOST_ALIAS="hermes-ephemeral-01" \
HOST_IP="198.51.100.55" \
SSH_HOST_KEY_PORT="22" \
SSH_IDENTITY="$HOME/.ssh/hermes-console" \
SSH_PROVIDER_FINGERPRINT="SHA256:AA..." \
EVIDENCE_FILE="docs/user-stories/evidence/2026-08-04-ssh-001-002-gate-1-prep-real.md" \
sh docs/user-stories/scripts/run-ssh-001-002.sh
```

### Vérif rapide de santé tunnel (bloque la suite si échec)

```sh
# 6) Connexion batch hermes-console sans shell interactif
ssh -F /dev/null \
  -o BatchMode=yes \
  -o IdentitiesOnly=yes \
  -o StrictHostKeyChecking=yes \
  -o UserKnownHostsFile="$HOME/.ssh/${HOST_ALIAS}.known_hosts" \
  -i "$SSH_IDENTITY" \
  -p "$SSH_HOST_KEY_PORT" \
  hermes-console@"$HOST_IP" "id -un && id -g && umask"
```

## Références opérationnelles à suivre

- `docs/user-stories/guides/SSH-VPS-VIERGE.md`
- `docs/user-stories/SSH-STORIES.md`
- `docs/user-stories/TRACEABILITY.md`
- `docs/user-stories/guides/G1-004C-PRE-EFFECT-APPROVAL.md` (pour pattern d'état/corrélation)
- `docs/user-stories/evidence/2026-08-02-gate-1-ssh-storage-migration.md` (seulement en complément pour US-G1-SSH-010)

## Format de preuve minimal attendu par story

Pour chaque story SSH-001..009 :

- Rapport daté (UTC + local), `story`, `opérateur`, `objectif`, `résultat`.
- Preuves machine/livraison (logs commandés, codes retour, inventaire, hash/sha256 si nécessaire).
- Scénario négatif correspondant (ou commentaire explicite de non-réalisable avec raison).
- Sortie de vérification **distincte** de la config manuelle (corrélable).
- Revue sécurité/exploitation distincte de l’implémenteur.

## Décision d’enchaînement après exécution

- Si une story échoue : arrêter, corriger uniquement les dépendances de cette story, re-rerun, puis reprendre.
- Si toutes les stories 001..009 sont prouvées : déclencher la revue Gate 1 et ne passer à Gate 2 qu’après verdict.
