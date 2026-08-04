# Preuve — US-G1-SSH-001/002 (bootstrap VPS vierge + empreinte hôte hors-bande)

- Date/heure UTC : 
- Story : `US-G1-SSH-001`, `US-G1-SSH-002`
- Commit/build : 
- Environnement : VPS vierge / hébergement fournisseur / expurgé
- Opérateur : 
- Reviewer : 
- Cible : `<host_alias>`
- Versions Console/Hermes/PostgreSQL/OpenSSH : 

## Préconditions

- Cible déclarée vierge avant intervention.
- Méthode de bootstrap retenue (`cloud-init`, `console`, `rescue` ou `mot de passe temp`).
- Chemin de secours admin disponible.
- Clé privée `hermes-console` conservée hors Git et hors logs.

## US-G1-SSH-001 — Scénario positif

- Given : une cible vierge sans clé de l'opérateur déjà installée.
- When : création `hermes-admin` puis `hermes-console`, installation séparée des clés et deux connexions batch.
- Then attendu :
  - `hermes-admin` existe (non-root, chemin admin disponible, sudo/reprise testée selon politique).
  - `hermes-console` existe en non-root.
  - Les deux comptes possèdent une seule clé publique autorisée en lecture/écriture maîtrisée.
  - Deux connexions batch `ssh` fonctionnent avec `StrictHostKeyChecking` activé.
- Résultat observé :
  - Résultat : 
  - Code de sortie : 
  - IDs corrélation : 

## US-G1-SSH-001 — Scénario négatif

- Given : bootstrap sans fenêtre de secours/admin/compte non-root.
- When : tentative d'installation ou de durcissement direct.
- Then attendu : refus clair et aucune perte de chemin de retour.
- Résultat observé :

## US-G1-SSH-002 — Scénario positif

- Given : empreinte du host obtenue hors-bande via la console fournisseur.
- When : scan réel via `ssh-keyscan` + comparaison caractère par caractère + enregistrement dédié `known_hosts`.
- Then attendu :
  - Empreinte locale === empreinte fournisseur (même algorithme + `SHA256`).
  - `known_hosts` dédié écrit avec permissions `0600`.
- Résultat observé :
  - Résultat : 
  - Empreinte cible (SHA256) : 
  - Empreinte fournisseur (SHA256) : 

## US-G1-SSH-002 — Scénario négatif

- Given : hôte ou empreinte modifiée.
- When : tentative d'acceptation.
- Then attendu :
  - refus strict (`SSH_HOST_KEY_CHANGED` / `SSH_HOST_KEY_MISMATCH` / message équivalent),
  - aucun acceptation de known_hosts non conforme.
- Résultat observé : 

## Commandes et sorties expurgées

```text
# (coller ici les commandes autorisées avec sortie non sensible)
```

## Variables de contrôle (optionnelles)

- `HOST_ALIAS` : `<host_alias>`
- `HOST_IP` : `<host_ip>`
- `SSH_HOST_KEY_PORT` : `<port>`
- `SSH_PROVIDER_FINGERPRINT` : `SHA256:...` (attendu)

## Commandes de preuve API (optionnelles si Console opérationnelle)

- `POST /api/runtime/ssh/host-key/scan`
- `PUT /api/runtime/ssh/host-key`
- `POST /api/runtime/ssh/connect` (post-acceptation)

## Contrôles de confidentialité/secret

- Aucun secret en clair (clé privée, token, mot de passe) n’est inscrit dans le rapport.
- La ligne `known_hosts` (clé publique) n’est pas collée dans le rapport, uniquement des empreintes/hashes.
- `known_hosts` local écrit sur disque local à usage d’exécution uniquement (`$HOME/.ssh/${HOST_ALIAS}.known_hosts`).

## Inventaire/hash avant et après

- Avant bootstrap : 
- Après bootstrap : 

## Incidents, écarts et dérogations

- 

## Nettoyage

- 

## Verdict

- `VÉRIFIÉE` | `BLOQUÉE` | `REJETÉE`

## Acceptation reviewer

- Nom/identifiant : 
- Date : 
- Décision : `ACCEPTÉE` | `REFUSÉE`
