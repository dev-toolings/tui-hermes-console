# Guide opérateur — Hermes distant Docker ou system-wide

Ce guide concerne la VM Proxmox `210`, `hermes-ephemeral-01` (`192.168.1.210`).
La VM reste déclarée par Terraform ; seuls le runtime Hermes et son service dans
l'invité sont gérés par Ansible.

## Invariants conservés dans les deux modes

- Données et credentials Hermes : `/srv/hermes-console/data`.
- Workspace hôte : `/srv/hermes-console/data/workspace`.
- API Hermes : `127.0.0.1:8642`, accessible par tunnel SSH uniquement.
- Compte de service : `hermes-console`, sans groupe `sudo` ni `docker`.
- Manager privilégié : `/usr/local/libexec/hermes-console-runtime-manager`.
- Politique CLI root-owned : `/usr/local/libexec/hermes-console-runtime-cli-policy`.
- La clé API du runtime n'est ni affichée ni passée dans les arguments des commandes.

Le reset change le mode d'exécution ; il ne supprime jamais le répertoire de données.
Il n'existe volontairement aucune option de purge des données.

## Architecture des commandes CLI

La connexion SSH et la CLI sont deux chemins distincts. Le tunnel transporte
l'API HTTP. Les opérations d'administration passent par un manager root borné :

```text
╔══════════════════╗  SSH exec / arguments bornés  ┌───────────────────────────────┐
║ Hermes Console   ║ ─────────────────────────────▶ │ Manager root + politique CLI │
╚══════════════════╝                                └───────────────┬───────────────┘
                                                                   │ mode sélectionné
                                                     ┌─────────────┴─────────────┐
                                                     │                           │
                                                     ▼ docker exec               ▼ runuser
                                           ┌──────────────────┐       ┌──────────────────┐
                                           │ Hermes Docker    │       │ Hermes systemd   │
                                           └────────┬─────────┘       └────────┬─────────┘
                                                    └──── API loopback :8642 ───┘
```

Légende : le manager choisit un seul runtime à partir de sa configuration
root-only. Composants : Console, manager/politique CLI, conteneur Hermes,
service systemd Hermes et API loopback commune.

Le compte `hermes-console` n'accède jamais au socket Docker. Le manager n'accepte
que les commandes utilisées par la Console : version, ajout/listing/suppression
de credentials, lecture de `terminal.cwd`, redémarrage gateway et arrêt dashboard.
Tout argument supplémentaire, provider mal formé, label non généré par la Console
ou tentative d'injection est refusé avant l'exécution privilégiée.
Une suppression de credential est sérialisée et n'est autorisée qu'après preuve
que l'index désigne un label `console-web-<12 hex>` de type `api_key manual`.

## Prérequis locaux

```sh
pvecli doctor
ssh hermes-ephemeral-01 'id && curl -fsS http://127.0.0.1:8642/health'
ssh hermes-ephemeral-01-admin 'sudo -n true'
ssh hermes-ephemeral-01-admin 'sudo docker version'
```

`pvecli doctor` doit afficher ses quatre contrôles verts. Ne jamais utiliser
`--insecure` et ne jamais ajouter `hermes-console` au groupe Docker.

Docker Engine doit déjà être installé sur la VM. Le playbook Docker démarre et
valide le moteur existant, mais ne remplace jamais Docker CE par `docker.io` ni
l'inverse. Le reset gère le conteneur Hermes, pas la famille de paquets de l'hôte.

## Script recommandé

Depuis la racine du dépôt :

```sh
# Voir la transition sans aucune mutation
./deploy/proxmox/scripts/reset-hermes-runtime.sh \
  --mode system-wide \
  --dry-run

# Recréer/sélectionner Docker distant
./deploy/proxmox/scripts/reset-hermes-runtime.sh \
  --mode docker \
  --yes

# Installer/sélectionner system-wide puis supprimer le conteneur après healthcheck
./deploy/proxmox/scripts/reset-hermes-runtime.sh \
  --mode system-wide \
  --yes
```

Par défaut, chaque mutation lance d'abord une sauvegarde PVE `snapshot` de la VM
210 vers le stockage `local`, attend son résultat terminal, génère l'inventaire
depuis l'agent QEMU, joue le playbook puis relit l'état réel par SSH.

Pour un rejeu rapide après une sauvegarde déjà validée :

```sh
./deploy/proxmox/scripts/reset-hermes-runtime.sh \
  --mode docker \
  --no-backup \
  --yes
```

`--no-backup` est explicite et ne doit pas devenir l'usage habituel.

## Ce que vérifie le script

Avant mutation :

1. `pvecli doctor` ;
2. VMID `210`, nom `hermes-ephemeral-01`, état `running`, tag `managed` ;
3. adresse `192.168.1.210` dans l'inventaire dynamique ;
4. inventaire réellement accepté par `ansible-inventory` depuis un fichier `.yml` ;
5. confirmation `--yes` ;
6. sauvegarde terminée, sauf `--no-backup`.

Après mutation :

| Mode demandé | Manager | Docker Hermes | systemd Hermes | API |
| --- | --- | --- | --- | --- |
| `docker` | `mode=docker` | `running` | `inactive` | `status=ok` |
| `system-wide` | `mode=native` | `absent` | `active` | `status=ok` |

Le script vérifie également la CLI depuis le compte non privilégié :

```sh
ssh hermes-ephemeral-01 \
  'sudo -n /usr/local/libexec/hermes-console-runtime-manager cli --version'
```

## Exécution manuelle Ansible

Générer l'inventaire sans le maintenir à la main :

```sh
inventory=$(mktemp --suffix=.yml)
pvecli iac inventory \
  --tag managed \
  --group-by tag \
  --user ops \
  --out "$inventory"
ansible-inventory -i "$inventory" --host hermes-ephemeral-01
export HERMES_EXPECTED_HOST_IP=192.168.1.210
```

Docker :

```sh
ansible-playbook \
  -i "$inventory" \
  deploy/proxmox/ansible/deploy-hermes.yml \
  --limit hermes-ephemeral-01 \
  -e allow_native_stop=true
```

System-wide avec suppression contrôlée du conteneur :

```sh
ansible-playbook \
  -i "$inventory" \
  deploy/proxmox/ansible/deploy-hermes-native.yml \
  --limit hermes-ephemeral-01 \
  -e 'allow_managed_docker_stop=true remove_managed_docker_after_native_health=true'
```

Sans les variables d'autorisation, les playbooks refusent d'arrêter le mode actif.

## Ordre de la bascule system-wide

1. Résoudre `main`, installer la release dans `/opt/hermes-console/releases/<commit>`.
2. Sceller la release en `root:root` et installer l'unité systemd.
3. Arrêter Docker au dernier moment.
4. Promouvoir le lien `/opt/hermes-console/current`.
5. Démarrer le gateway sous `hermes-console`.
6. Exiger `status=ok` et `platform=hermes-agent` sur `127.0.0.1:8642`.
7. Prouver que le `MainPID` systemd sous `hermes-console` écoute réellement le port.
8. Supprimer `hermes-console-runtime` uniquement après toutes ces preuves.
9. Refuser la bascule si un ancien processus `/opt/hermes/.venv/bin/*` subsiste ;
   aucun scope ou processus hors des deux conteneurs au contrat validé n'est tué.

Si Docker servait avant la promotion et que le natif échoue, le playbook arrête
toujours le service incomplet, restaure le `runtime.env` Docker, rétablit le
manager en mode Docker, redémarre le conteneur conservé et exige l'identité JSON
Hermes avant de rendre l'échec. L'existence d'une ancienne release native ne
change jamais ce choix : le rollback suit le mode actif avant mutation.

Lors d'une mise à jour d'un mode natif déjà actif, le manager restaure la release
précédente et ne valide la nouvelle qu'après `status=ok`, `platform=hermes-agent`,
systemd actif et listener `:8642` détenu par le `MainPID` sous `hermes-console`.

## Vérification manuelle

```sh
# Frontière CLI du compte de service
ssh hermes-ephemeral-01 \
  'sudo -n /usr/local/libexec/hermes-console-runtime-manager inspect'
ssh hermes-ephemeral-01 \
  'sudo -n /usr/local/libexec/hermes-console-runtime-manager cli auth list openai-codex'

# État privilégié expurgé
ssh hermes-ephemeral-01-admin \
  'systemctl is-active hermes-gateway.service; \
   sudo docker ps -a --filter name=hermes-console-runtime --format "{{.Names}}|{{.Status}}"; \
   curl -fsS http://127.0.0.1:8642/health'
```

Ne jamais afficher `/srv/hermes-console/data/runtime.env` : il contient la clé
du serveur API.

## Retour à Docker

Le mode Docker peut être recréé depuis l'image officielle sans toucher aux données :

```sh
./deploy/proxmox/scripts/reset-hermes-runtime.sh --mode docker --yes
```

Le playbook prépare l'image avant la coupure, sauvegarde `runtime.env`, désactive
le service system-wide au dernier moment, adapte le bind API pour le conteneur,
monte `/srv/hermes-console/data` sur `/opt/data`, puis attend l'identité JSON de
l'API. En cas d'échec, il arrête le candidat Docker, restaure atomiquement
`runtime.env`, redémarre le service natif et rattache la preuve au `MainPID`.

Lors d'une mise à jour Docker, l'ancien conteneur est renommé en rollback et
n'est supprimé qu'après healthcheck du nouveau digest. Un conteneur homonyme hors
contrat n'est jamais adopté ni supprimé automatiquement.

## Diagnostic des alertes Console

- `CLI Hermes introuvable sur l'hôte SSH` : manager/politique non installés ou
  ancienne version du playbook ; rejouer le mode actif avec le script.
- `Commande Hermes en échec` : arguments refusés, topologie non conforme ou
  erreur Hermes ; exécuter `manager inspect`, puis la commande `auth list`.
- HTTP `412` : l'API Hermes répond mais refuse une précondition ; ce n'est pas
  une panne du tunnel SSH.
- `manager_error=invalid_cli_arguments` : la politique a correctement refusé une
  commande hors contrat ; ne pas élargir le sudoers pour la contourner.
- `manager_error=docker_contract_mismatch` : le conteneur n'appartient pas au
  contrat géré ; arrêter et auditer avant toute adoption.
- `native=failed` après une bascule réussie vers Docker : exécuter
  `sudo systemctl reset-failed hermes-gateway.service`, puis rejouer le script ;
  le playbook courant effectue désormais lui-même ce nettoyage.
- erreur `dpkg` autour de `docker-buildx` : ne pas installer `docker.io` par-dessus
  Docker CE. Réparer la famille déjà sélectionnée, vérifier `dpkg --audit`, puis
  seulement rejouer le reset.

## Preuves de la validation réelle du 9 août 2026

- PVE `9.2.6`, VM `210` en état `running` et taguée `managed`.
- Sauvegardes créées avant mutation : une archive de 3,0 Gio puis une archive
  stable de 4,2 Gio sur `local`.
- Docker : digest `sha256:22f43201cff423c494158ed4068c46aa9bb0ee16dd30082a25887834b20e89b8`,
  Hermes `0.20.0`, second passage `changed=0`.
- System-wide : commit `e7d01dd021096d26a697531fd2aa400f2533bf25`,
  Hermes `0.20.0`, second passage `changed=0`.
- Aller-retour réel validé : Docker → system-wide → Docker → system-wide.
- État laissé en production de preuve : manager `native`, systemd `active`,
  conteneurs `hermes-console-runtime` et `hermes-console-dashboard` absents,
  aucun processus Docker Hermes résiduel et données conservées.
- UI `/settings/models` : le démarrage OAuth atteint le code OpenAI sans alerte
  CLI, puis l'opération d'essai est annulée.
- Suite complète : `706 pass`, `3 skip`, `0 fail`; typecheck et build verts,
  lint sans erreur.

## Tests du dépôt

```sh
bun test apps/server/src/modules/runtime/ssh/remote-update-manager.test.ts \
  apps/server/src/modules/runtime/ssh/runtime-mode-playbooks.test.ts \
  apps/server/src/modules/runtime/ssh/reset-hermes-runtime-script.test.ts \
  apps/server/src/modules/runtime/local-management.test.ts

sh -n deploy/proxmox/scripts/reset-hermes-runtime.sh
ansible-playbook --syntax-check -i 'localhost,' \
  deploy/proxmox/ansible/deploy-hermes.yml
ansible-playbook --syntax-check -i 'localhost,' \
  deploy/proxmox/ansible/deploy-hermes-native.yml

# Validation globale avec marge pour les scénarios PostgreSQL réels
bun test --timeout 10000
```
