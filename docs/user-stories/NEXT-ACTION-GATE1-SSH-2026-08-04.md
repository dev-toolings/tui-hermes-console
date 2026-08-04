# Exécution immédiate (objectif: faire avancer Gate 1)

Date: 2026-08-04

> **CE DOCUMENT EST SUSPENDU DEPUIS LE 04-08-2026.** `US-G1-SSH-001` est gelée faute de VPS vierge,
> et `US-G1-SSH-002` à `US-G1-SSH-009` sont gelées par dépendance. Voir la
> [décision de gel](evidence/2026-08-04-ssh-001-gel-decision.md).
>
> La procédure ci-dessous reste correcte et sera reprise **telle quelle au dégel**. Elle ne doit pas
> être relancée avant : sans hôte vierge, elle produit des rapports `BLOQUÉ` qui n'apportent aucune
> preuve et coûtent un aller-retour à chaque fois. Le prérequis manquant n'est pas un paramètre de
> ligne de commande, c'est une machine à provisionner.

Ce document fige l’ordre d’exécution recommandé à partir des états actuels :
`US-G1-002`, `US-G1-004`, `US-G1-008` et `US-G1-SSH-001..009` restent bloquantes.

```text
╔══════════════╗      Bloquant         ╔════════════════╗      Preuve exigée      ╔══════════════╗
║ US-G1-002   ║ ───────────────▶ ║ SSH-001..009    ║ ────────────────────▶ ║ Revue Gate 1 ║
╚══════╤═══════╝                     ╚════╤═════════════╝                        ╚════╤════════╝
       │ dépendance                        │ dépendance                                 │
       ▼                                   ▼                                            ▼
┌──────┴───────┐                     ┌────┴───────────────────────┐            ┌───────┴───────────────┐
║ Revue +      ║                     ║ Preuves P-OPS/P-SEC/P-E2E   ║            ║ Verdict Accepté/NO-GO ║
║ Evidence     ║◀────────────────────╢ Réalités VPS vierge + cible   ║───────────▶ ║ + preuve traceabilité ║
╚──────────────┘                     ╚─────────────────────────────╝            ╚──────────────────────┘
```

## Règle de séquence (ne pas changer l’ordre)

1. **US-G1-SSH-001** (bootstrap VPS vierge)  
2. **US-G1-SSH-002** (empreinte hôte hors bande)  
3. **US-G1-SSH-003** (compte admin + compte service séparés)  
4. **US-G1-SSH-004** (key-only + refus inconnu/révoqué)  
5. **US-G1-SSH-005** (tunnel borné à `127.0.0.1:8642`)  
6. **US-G1-SSH-006** (SFTP workdir borné + intégrité)  
7. **US-G1-SSH-007** (reconnexion/concurrence/coupure)  
8. **US-G1-SSH-008** (rotation + révocation)  
9. **US-G1-SSH-009** (guide E2E par opérateur 2)  
10. **US-G1-SSH-010** (acceptation formelle, même si implémentation P-OPS locale existe déjà)

Le passage de `US-G1-008` dépend du succès complet de `SSH-001..009`.

## Ce qu’on fait maintenant (prochaine itération)

- **Objectif court-terme** : prouver `US-G1-SSH-001` et `US-G1-SSH-002` sur une vraie cible vierge.
- **Critère de sortie court** :
  - `BLOQUÉE` retirée sur `US-G1-SSH-001`
  - `BLOQUÉE` retirée sur `US-G1-SSH-002`
  - preuve datée déposée avec identifiants corrélables (dates, host alias expurgé, résultats `true/false`, artefacts inventaire)
  - traceability préservée dans `TRACEABILITY.md`

## Commandes de pré-exécution (avant connexion réelle)

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
