#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPOSITORY_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../../.." && pwd)

MODE=
HOST=hermes-ephemeral-01
ADMIN_HOST=hermes-ephemeral-01-admin
HOST_IP=192.168.1.210
VMID=210
VM_NAME=hermes-ephemeral-01
BACKUP=yes
DRY_RUN=no
CONFIRMED=no

usage() {
  cat <<'EOF'
Usage: reset-hermes-runtime.sh --mode docker|system-wide [options]

Options:
  --mode docker|system-wide  Mode distant à déployer sur la VM 210.
  --host ALIAS               Alias SSH du compte hermes-console.
  --admin-host ALIAS         Alias SSH administrateur pour les preuves.
  --host-ip IPV4             Adresse attendue de la VM (défaut: 192.168.1.210).
  --no-backup                Saute explicitement la sauvegarde PVE préalable.
  --dry-run                  Vérifie la cible et affiche la transition sans mutation.
  --yes                      Confirme la mutation et les arrêts de runtime.
  --help                     Affiche cette aide.

Le script conserve toujours /srv/hermes-console/data. En mode system-wide,
le conteneur hermes-console-runtime n'est supprimé qu'après healthcheck natif.
EOF
}

fail() {
  printf 'reset_error=%s\n' "$1" >&2
  exit 2
}

valid_alias() {
  case "$1" in ''|*[!A-Za-z0-9._-]*) return 1 ;; esac
}

valid_ipv4() {
  printf '%s\n' "$1" | awk -F. '
    NF != 4 { exit 1 }
    {
      for (i = 1; i <= 4; i++) {
        if ($i !~ /^[0-9]+$/ || $i < 0 || $i > 255) exit 1
      }
    }
  '
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --mode)
      [ "$#" -ge 2 ] || fail missing_mode
      MODE=$2
      shift 2
      ;;
    --host)
      [ "$#" -ge 2 ] || fail missing_host
      HOST=$2
      shift 2
      ;;
    --admin-host)
      [ "$#" -ge 2 ] || fail missing_admin_host
      ADMIN_HOST=$2
      shift 2
      ;;
    --host-ip)
      [ "$#" -ge 2 ] || fail missing_host_ip
      HOST_IP=$2
      shift 2
      ;;
    --no-backup)
      BACKUP=no
      shift
      ;;
    --dry-run)
      DRY_RUN=yes
      shift
      ;;
    --yes)
      CONFIRMED=yes
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *) fail unknown_argument ;;
  esac
done

case "$MODE" in docker|system-wide) ;; *) fail invalid_mode ;; esac
valid_alias "$HOST" || fail invalid_host_alias
valid_alias "$ADMIN_HOST" || fail invalid_admin_host_alias
valid_ipv4 "$HOST_IP" || fail invalid_host_ip
[ "$DRY_RUN" = yes ] || [ "$CONFIRMED" = yes ] || fail confirmation_requires_--yes

for command in pvecli ansible-inventory ansible-playbook ssh awk grep mktemp; do
  command -v "$command" >/dev/null 2>&1 || fail "missing_command_$command"
done

pvecli doctor
vm_state=$(pvecli vm show "$VMID" -o yaml)
printf '%s\n' "$vm_state" | grep -Fq "name: $VM_NAME" || fail vm_name_mismatch
printf '%s\n' "$vm_state" | grep -Eq 'status: (running|"running")' || fail vm_not_running
printf '%s\n' "$vm_state" | grep -Eq 'vmid: (210|"210")' || fail vmid_mismatch
printf '%s\n' "$vm_state" | grep -Fq managed || fail vm_not_managed

if [ "$MODE" = docker ]; then
  PLAYBOOK="$REPOSITORY_ROOT/deploy/proxmox/ansible/deploy-hermes.yml"
  EXTRA_VARS="allow_native_stop=true"
else
  PLAYBOOK="$REPOSITORY_ROOT/deploy/proxmox/ansible/deploy-hermes-native.yml"
  EXTRA_VARS="allow_managed_docker_stop=true remove_managed_docker_after_native_health=true"
fi

if [ "$DRY_RUN" = yes ]; then
  printf 'mode=%s\nvmid=%s\nvm_name=%s\nhost=%s\nhost_ip=%s\nplaybook=%s\nextra_vars=%s\n' \
    "$MODE" "$VMID" "$VM_NAME" "$HOST" "$HOST_IP" "$PLAYBOOK" "$EXTRA_VARS"
  exit 0
fi

if [ "$BACKUP" = yes ]; then
  pvecli backup run "$VMID" --storage local --mode snapshot --compress zstd \
    --notes "Hermes runtime switch to $MODE" --yes
fi

INVENTORY=$(mktemp --suffix=.yml)
POSTCHECK=$(mktemp)
trap 'rm -f -- "$INVENTORY" "$POSTCHECK"' EXIT HUP INT TERM

pvecli iac inventory --tag managed --group-by tag --user ops --out "$INVENTORY"
grep -Fq "$HOST" "$INVENTORY" || fail inventory_host_missing
grep -Fq "$HOST_IP" "$INVENTORY" || fail inventory_ip_mismatch
inventory_host=$(ansible-inventory -i "$INVENTORY" --host "$HOST")
printf '%s\n' "$inventory_host" | grep -Fq "$HOST_IP" || fail ansible_inventory_target_mismatch

HERMES_EXPECTED_HOST_IP=$HOST_IP ansible-playbook \
  -i "$INVENTORY" \
  "$PLAYBOOK" \
  --limit "$HOST" \
  -e "$EXTRA_VARS"

# Le compte de service doit réellement pouvoir piloter la même CLI sans Docker direct.
ssh "$HOST" \
  'sudo -n /usr/local/libexec/hermes-console-runtime-manager cli --version >/dev/null'

ssh "$ADMIN_HOST" 'set -eu
body=$(curl -fsS --max-time 5 http://127.0.0.1:8642/health)
printf "%s\n" "$body" | grep -Eq "\"status\"[[:space:]]*:[[:space:]]*\"ok\""
printf "%s\n" "$body" | grep -Eq "\"platform\"[[:space:]]*:[[:space:]]*\"hermes-agent\""
version=$(printf "%s\n" "$body" | sed -n "s/.*\"version\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p")
manager_mode=$(sudo -n /usr/local/libexec/hermes-console-runtime-manager inspect | sed -n "s/^mode=//p" | head -1)
if sudo docker inspect hermes-console-runtime >/dev/null 2>&1; then
  docker_state=$(sudo docker inspect -f "{{.State.Running}}" hermes-console-runtime)
  if [ "$docker_state" = true ]; then docker=running; else docker=stopped; fi
else
  docker=absent
fi
if sudo docker inspect hermes-console-dashboard >/dev/null 2>&1; then
  dashboard_state=$(sudo docker inspect -f "{{.State.Running}}" hermes-console-dashboard)
  if [ "$dashboard_state" = true ]; then dashboard=running; else dashboard=stopped; fi
else
  dashboard=absent
fi
native=$(systemctl is-active hermes-gateway.service 2>/dev/null || true)
[ -n "$native" ] || native=inactive
if pgrep -u hermes-console -f "^/opt/hermes/.venv/bin/" >/dev/null 2>&1; then
  legacy_docker_process=present
else
  legacy_docker_process=absent
fi
printf "health=ok\nplatform=hermes-agent\nversion=%s\nmanager_mode=%s\ndocker=%s\ndashboard=%s\nnative=%s\nlegacy_docker_process=%s\n" \
  "$version" "$manager_mode" "$docker" "$dashboard" "$native" "$legacy_docker_process"' > "$POSTCHECK"

cat "$POSTCHECK"
grep -Fxq 'health=ok' "$POSTCHECK" || fail health_postcheck_failed
grep -Fxq 'platform=hermes-agent' "$POSTCHECK" || fail platform_postcheck_failed
grep -Fxq "manager_mode=$( [ "$MODE" = docker ] && printf docker || printf native )" "$POSTCHECK" || fail manager_mode_mismatch

if [ "$MODE" = docker ]; then
  grep -Fxq 'docker=running' "$POSTCHECK" || fail docker_not_running
  grep -Fxq 'native=inactive' "$POSTCHECK" || fail native_not_inactive
else
  grep -Fxq 'docker=absent' "$POSTCHECK" || fail docker_not_removed
  grep -Fxq 'dashboard=absent' "$POSTCHECK" || fail dashboard_not_removed
  grep -Fxq 'native=active' "$POSTCHECK" || fail native_not_active
  grep -Fxq 'legacy_docker_process=absent' "$POSTCHECK" || fail legacy_docker_process_still_running
fi

printf 'reset_status=verified\nmode=%s\n' "$MODE"
