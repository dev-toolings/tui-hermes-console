# Preuve — US-G1-SSH-003/005 — bootstrap et limites SSH

- **Date :** 04-08-2026
- **Cible :** `hermes-ephemeral-01` — `192.168.1.210`
- **Provisionnement :** VM Proxmox vierge via Terraform généré par `pvecli`, puis Ansible
- **Playbook :** [`deploy/proxmox/ansible/bootstrap-ssh.yml`](../../../deploy/proxmox/ansible/bootstrap-ssh.yml)
- **Known hosts :** `/home/kev/.ssh/hermes-ephemeral-01.known_hosts`, vérification stricte activée

## US-G1-SSH-003 — comptes séparés

- `hermes-admin` existe, appartient à `sudo`, et `sudo -n true` réussit avec sa clé dédiée.
- `hermes-console` existe, appartient à `hermes-work`, et n'appartient ni à `sudo` ni à `docker`.
- `hermes-console` utilise une clé différente, sans mot de passe, avec `umask 0002`.
- Le second passage Ansible est idempotent : `ok=14 changed=0 unreachable=0 failed=0 skipped=0`.

**Résultat :** positif vérifié sur la VM de preuve.

## US-G1-SSH-004 — key-only et refus

- clé de service correcte : connexion réussie ;
- clé cliente incorrecte : code SSH `255`, `Permission denied (publickey)` ;
- ancien compte `ops` : code SSH `255`, refusé par `AllowUsers` ;
- mot de passe et keyboard-interactive : désactivés ; root : interdit.

**Résultat :** positif et négatifs vérifiés sur la VM de preuve.

## US-G1-SSH-005 — forward borné

Configuration effective contrôlée par `sshd -T` :

```text
allowtcpforwarding local
permitopen 127.0.0.1:8642
gatewayports no
allowagentforwarding no
permittunnel no
```

Un forward vers `127.0.0.1:22` est refusé avec `administratively prohibited`.
Le positif vers `127.0.0.1:8642` n'est pas encore rejouable : aucun Hermes n'est lancé sur cette VM.

**Résultat :** négatif vérifié ; story complète encore bloquée jusqu'au runtime Hermes réel.

## Limites restantes

`US-G1-SSH-006` (SFTP + hashes), `007` (reconnexion/concurrence), `008` (rotation/révocation) et
`009` (revue opérateur 2) ne sont pas déclarées vérifiées par cette preuve. Pour SSH-002, l'ED25519
fourni hors bande concorde exactement (`SHA256:GZaWhVnELHA7S590n8FjL51XzlHVvBAStYCCpo2CjgA`) ;
les empreintes RSA/ECDSA restent à faire confirmer par le fournisseur si la story exige tous les
algorithmes.
