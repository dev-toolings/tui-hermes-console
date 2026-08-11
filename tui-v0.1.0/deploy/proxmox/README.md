# VM de preuve Proxmox

Cette recette crée la VM vierge qui sert à rejouer `US-G1-SSH-001..009`.
Terraform reste propriétaire du guest ; Ansible ne gère que l'OS invité.

## Déclarer et créer

Le scaffold Terraform est fourni par `pvecli` dans `~/.config/pvecli/terraform`.
Les valeurs de contexte passent par `TF_VAR_*`, et le token PVE reste fourni par
`pvecli` depuis sa commande de secret :

```sh
pvecli vm declare hermes-ephemeral-01 \
  --vmid 210 --cores 2 --memory 8192 --disk 20 \
  --ip 192.168.1.210/24 --gateway 192.168.1.1 \
  --template 9001 --user ops --with ''

export TF_VAR_proxmox_endpoint='https://pve.example.lan:8006'
export TF_VAR_node_name='pve'
export TF_VAR_template_vm_id='9001'
export TF_VAR_ssh_public_key="$(< ~/.ssh/id_ed25519.pub)"
pvecli iac plan
pvecli iac apply
```

Sur un PVE de lab auto-signé, fournir à Terraform un bundle PEM temporaire
obtenu après comparaison du fingerprint avec `pvecli config show` via
`SSL_CERT_FILE`. Ne pas utiliser `insecure=true` et ne jamais committer ce
fichier.

## Inventaire et bootstrap SSH

L'inventaire est dérivé de l'agent QEMU et n'est pas édité manuellement :

```sh
pvecli iac inventory --tag managed --group-by tag --user ops \
  --out /tmp/hermes-ephemeral-inventory.yml

export HERMES_EXPECTED_HOST_IP='192.168.1.210'
export HERMES_ADMIN_PUBLIC_KEY_FILE="$HOME/.ssh/iautos_deploy.pub"
export HERMES_SERVICE_PUBLIC_KEY_FILE="$HOME/.ssh/id_ed25519.pub"
ansible-playbook \
  -i /tmp/hermes-ephemeral-inventory.yml \
  deploy/proxmox/ansible/bootstrap-ssh.yml \
  --limit hermes-ephemeral-01
```

Le playbook refuse une adresse inattendue, crée les comptes `hermes-admin` et
`hermes-console`, installe des clés distinctes, interdit les privilèges sudo et
Docker au compte de service, puis borne son forward SSH à `127.0.0.1:8642`.

## Déployer le runtime confiné

Le playbook résout le canal officiel `latest` au moment du déploiement :

```sh
export HERMES_EXPECTED_HOST_IP='192.168.1.210'
ansible-playbook \
  -i /tmp/hermes-ephemeral-inventory.yml \
  deploy/proxmox/ansible/deploy-hermes.yml \
  --limit hermes-ephemeral-01
```

La recette installe Docker via Debian, prépare le bind mount sous l'identité
`hermes-console`, génère le token API sans l'afficher, tire `:latest`, enregistre le digest résolu puis
lance cette révision. L’image officielle amorce s6 en root avec cinq
capabilities minimales, remappe `HERMES_UID/HERMES_GID`, puis exécute le gateway
sans capability en `1002:1003`. Le port reste sur loopback et un conteneur
existant n’est adopté que si son contrat complet correspond.

## Déployer Hermes system-wide

```sh
export HERMES_EXPECTED_HOST_IP='192.168.1.210'
ansible-playbook \
  -i /tmp/hermes-ephemeral-inventory.yml \
  deploy/proxmox/ansible/deploy-hermes-native.yml \
  --limit hermes-ephemeral-01
```

Cette branche télécharge l’installateur officiel depuis `main`, enregistre son SHA-256 observé,
l’exécute sans `--commit`, puis nomme la release avec le commit effectivement résolu sous
`/opt/hermes-console/releases`. Elle la scelle en root et lance une unité systemd système avec
`User=hermes-console` sur loopback. Le lien `current` est restauré automatiquement si le healthcheck
échoue.

Docker et system-wide sont mutuellement exclusifs sur `:8642`. Pour une bascule
de recette volontaire, fournir respectivement `-e allow_managed_docker_stop=true`
ou `-e allow_native_stop=true`. Sans cette autorisation, le playbook échoue avant
d'arrêter le mode actif.

Le parcours opérateur recommandé, incluant sauvegarde PVE, reset multi-mode,
postconditions, rollback et diagnostic CLI, est documenté dans
[`HERMES-REMOTE-RUNTIME-MODES.md`](../../docs/user-stories/guides/HERMES-REMOTE-RUNTIME-MODES.md).
