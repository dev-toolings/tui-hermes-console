# Preuve — US-G1-SSH-008 — rotation et révocation

- **Date :** 04-08-2026
- **Cible :** `hermes-ephemeral-01` — `192.168.1.210`
- **PVE :** 9.2.6, VMID 210
- **Known hosts :** `/home/kev/.ssh/hermes-ephemeral-01.known_hosts`, vérification stricte
- **Accès recovery :** `hermes-admin` avec `sudo -n true` confirmé avant et après

## Identités et prérequis

- ancienne clé service : `SHA256:ulFMotAyoSmw5pmgyAe/hVfopyaNaDhTloBCjWfn5eA` ;
- nouvelle clé service : `SHA256:2r2elN1H30l+FiEHBwKzu39Hv89vfrlR6sCfps3P+os` ;
- l'ancienne clé a d'abord ouvert un ControlMaster avec un forward local vers
  `127.0.0.1:8642` ; le healthcheck via tunnel répondait HTTP 200 ;
- la nouvelle clé a été ajoutée puis testée avant le retrait de l'ancienne : UID `1002`, GID `1003`.

## Rejeu positif et négatif

1. Le ControlMaster et le tunnel de l'ancienne identité étaient actifs avant révocation.
2. L'ancienne ligne a été retirée exactement de `/home/hermes-console/.ssh/authorized_keys` ; après
   retrait, le ControlMaster existant a encore répondu (`OLD_CONTROL_STILL_ACTIVE`).
3. Une nouvelle connexion avec l'ancienne clé a échoué en code SSH `255`.
4. Les sessions `sshd-session: hermes-console` ont été fermées côté serveur (`PID 47175`).
5. Le ControlMaster est alors devenu indisponible ; le healthcheck local a répondu `000` avec code
   curl `7`.
6. Une nouvelle connexion avec la clé tournée a réussi après révocation : `hermes-console`, UID
   `1002`, GID `1003`, `umask 0002`.
7. L'inventaire final `authorized_keys` contient une seule clé, la nouvelle fingerprintée ci-dessus.
8. Le runtime Hermes est resté en écoute sur `127.0.0.1:8642` et aucun tunnel temporaire ne subsiste.

Le délai mesuré entre le lancement de la fermeture et la perte du ControlMaster est d'environ
`315 ms` (horloge monotone de la recette, arrondie).

## Limites

Cette preuve établit le comportement technique P-OPS de SSH-008 sur la VM éphémère. La revue
indépendante, la signature d'un reviewer distinct et le rejeu par un opérateur 2 restent requis pour
la décision Gate 1. La clé privée tournée reste hors dépôt et n'est pas reproduite ici.
