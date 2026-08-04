# Preuve — US-G1-002 — Docker et system-wide sur VM éphémère

- **Date :** 04-08-2026
- **Cible :** `hermes-ephemeral-01` (VM Proxmox éphémère, 2 vCPU, 8 Gio)
- **Hermes :** `0.19.0` / `v2026.7.20`, commit `3ef6bbd201263d354fd83ec55b3c306ded2eb72a`
- **Docker :** `sha256:f7b35053268f532f98955195c909f15a230470fbcbdacaa9fdecb95707dad04a`
- **Installateur natif :** SHA-256 `c5ba7e89627577fab914514736ecfb3359b66956ca00199bfef616ca35953cb9`
- **Identités :** admin de provisioning `hermes-admin`; service `hermes-console` (`1002:1003`)

## Sélection et qualification

La matrice `proof:g1-002c`, exécutée avec la sélection opérateur
`G1-002-P-OPS-2026-08-04`, le digest ci-dessus et le contrat cible
`1002:1003:/opt/data`, retourne :

```text
verdict=READY
exitCode=0
qualificationPassed=true
promotionAllowed=true
deploymentAllowed=true
```

La sélection reste déclarative (`authenticated=false`), mais le déploiement P-OPS ci-dessous prouve
séparément la cible et la séparation des rôles.

## Mode Docker

Le playbook `deploy/proxmox/ansible/deploy-hermes.yml` a déployé puis adopté le conteneur existant :

```text
health=200
uid_gid=1002:1003
image=v2026.7.20@sha256:f7b350...dad04a
contract=g1-002-docker-v1
cap_drop=ALL
cap_add=CHOWN,DAC_OVERRIDE,FOWNER,SETGID,SETUID
no_new_privileges=true
pids=256 memory=6GiB cpus=1.5
publish=127.0.0.1:8642:8642
second_run_changed=0
```

L’image officielle exige un bootstrap s6 root avec `HERMES_UID/HERMES_GID`. L’inspection du vrai
gateway après bootstrap donne `Uid=1002`, `Gid=1003`, `CapEff=0`. Le seul bind mount applicatif est
`/opt/data`; aucun socket Docker n’est monté. Le token API, accidentellement inclus dans une première
sortie d’inspection, a été immédiatement supprimé du manifeste et tourné avant la preuve finale.

## Mode system-wide

Le playbook `deploy/proxmox/ansible/deploy-hermes-native.yml` télécharge l’installateur à l’URL du
commit immuable, vérifie son SHA-256, installe une release versionnée, la scelle en `root:root`, puis
active un lien `current` avec rollback automatique autour du healthcheck.

```text
health=200
commit=3ef6bbd201263d354fd83ec55b3c306ded2eb72a
service_user=hermes-console
service_group=hermes-console
listen=127.0.0.1:8642
NoNewPrivileges=yes
ProtectSystem=full
second_run_changed=0
```

La bascule system-wide vers Docker a ensuite arrêté explicitement l’unité native, adopté le
conteneur arrêté et retrouvé `health=200`. La bascule inverse avait déjà produit la preuve native.
Les deux modes sont mutuellement exclusifs sur le port 8642 et exigent une autorisation explicite
pour arrêter le mode actif.

## Négatifs

```text
service_sudo=denied
service_docker=denied
admin_secret=denied
docker_socket_mounts=<empty>
service_loopback_health=ok
```

## Verdict

`US-G1-002` est `IMPLÉMENTÉE` et techniquement prouvée P-OPS/P-SEC sur la VM éphémère pour les deux
modes. Le statut `VÉRIFIÉE` et l’acceptation Gate 1 restent réservés à une revue indépendante et au
parcours P-E2E complet.
