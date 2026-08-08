#!/bin/sh
set -eu

PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export PATH

CONFIG=/etc/hermes-console/runtime-manager.conf
NATIVE_ROOT=/opt/hermes-console
NATIVE_SERVICE=hermes-gateway.service
INSTALLER_URL=https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh
REPOSITORY=https://github.com/NousResearch/hermes-agent.git

fail() {
  printf 'manager_error=%s\n' "$1" >&2
  exit "${2:-1}"
}

config_value() {
  key=$1
  sed -n "s/^${key}=//p" "$CONFIG" | tail -n 1
}

validate_config() {
  [ "$(id -u)" -eq 0 ] || fail root_required
  [ -f "$CONFIG" ] || fail config_missing
  [ "$(stat -c %u "$CONFIG")" = 0 ] || fail config_owner
  [ "$(stat -c %a "$CONFIG")" = 600 ] || fail config_mode

  mode=$(config_value mode)
  runtime_root=$(config_value runtime_root)
  service_user=$(config_value service_user)
  service_uid=$(config_value service_uid)
  service_gid=$(config_value service_gid)
  docker_contract=$(config_value docker_contract)
  docker_contract_label=$(config_value docker_contract_label)
  docker_container=$(config_value docker_container)
  docker_source=$(config_value docker_source)

  case "$mode" in native|docker) ;; *) fail invalid_mode ;; esac
  case "$runtime_root" in /*) ;; *) fail invalid_runtime_root ;; esac
  case "$runtime_root" in *..*|*"'"*|*' '*|*'\t'*) fail invalid_runtime_root ;; esac
  case "$service_user" in ''|*[!a-zA-Z0-9_-]*) fail invalid_service_user ;; esac
  case "$service_uid:$service_gid" in *[!0-9:]*) fail invalid_service_identity ;; esac
  [ "$(id -u "$service_user")" = "$service_uid" ] || fail service_uid_mismatch
  [ "$(id -g "$service_user")" = "$service_gid" ] || fail service_gid_mismatch
  [ "$docker_contract" = g1-002-docker-v1 ] || fail invalid_docker_contract
  [ "$docker_contract_label" = hermes.console.contract ] || fail invalid_docker_contract_label
  [ "$docker_container" = hermes-console-runtime ] || fail invalid_docker_container
  [ "$docker_source" = nousresearch/hermes-agent:latest ] || fail invalid_docker_source
}

healthcheck() {
  count=0
  while [ "$count" -lt 60 ]; do
    if curl --connect-timeout 2 --max-time 4 -fsS http://127.0.0.1:8642/health >/dev/null 2>&1; then
      return 0
    fi
    count=$((count + 1))
    sleep 2
  done
  return 1
}

native_current_commit() {
  current=$(readlink -f "$NATIVE_ROOT/current" 2>/dev/null || true)
  case "$current" in "$NATIVE_ROOT"/releases/*) ;; *) return 1 ;; esac
  [ -x "$current/venv/bin/hermes" ] || return 1
  git -c safe.directory="$current" -C "$current" rev-parse HEAD 2>/dev/null
}

valid_hex() {
  value=$1
  length=$2
  case "$value" in ''|*[!0-9a-f]*) return 1 ;; esac
  [ "${#value}" -eq "$length" ]
}

inspect_native() {
  systemctl cat "$NATIVE_SERVICE" >/dev/null 2>&1 || fail native_service_missing
  commit=$(native_current_commit) || fail native_release_invalid
  active=false
  systemctl is-active --quiet "$NATIVE_SERVICE" && active=true
  printf 'mode=native\nmanaged=true\nactive=%s\ncurrent_revision=%s\n' "$active" "$commit"
}

docker_shape() {
  docker inspect -f '{{index .Config.Labels "hermes.console.managed"}}|{{index .Config.Labels "hermes.console.contract"}}|{{index .Config.Labels "hermes.console.source"}}|{{index .Config.Labels "hermes.console.resolved"}}|{{index .Config.Labels "hermes.console.uid"}}|{{index .Config.Labels "hermes.console.gid"}}|{{.Config.User}}|{{range .Mounts}}{{if eq .Destination "/opt/data"}}{{.Source}}{{end}}{{end}}' "$docker_container"
}

validate_docker() {
  command -v docker >/dev/null 2>&1 || fail docker_missing
  docker inspect "$docker_container" >/dev/null 2>&1 || fail docker_container_missing
  expected="true|$docker_contract|$docker_source|"
  shape=$(docker_shape)
  case "$shape" in "$expected"*) ;; *) fail docker_contract_mismatch ;; esac
  resolved=$(printf '%s' "$shape" | cut -d '|' -f4)
  uid=$(printf '%s' "$shape" | cut -d '|' -f5)
  gid=$(printf '%s' "$shape" | cut -d '|' -f6)
  user=$(printf '%s' "$shape" | cut -d '|' -f7)
  mount=$(printf '%s' "$shape" | cut -d '|' -f8)
  digest=${resolved#nousresearch/hermes-agent@sha256:}
  [ "$digest" != "$resolved" ] && valid_hex "$digest" 64 || fail docker_digest_invalid
  [ "$uid" = "$service_uid" ] || fail docker_uid_mismatch
  [ "$gid" = "$service_gid" ] || fail docker_gid_mismatch
  [ "$user" = root ] || fail docker_user_mismatch
  [ "$mount" = "$runtime_root" ] || fail docker_mount_mismatch
  [ -f "$runtime_root/runtime.env" ] || fail docker_env_missing
}

inspect_docker() {
  validate_docker
  running=$(docker inspect -f '{{.State.Running}}' "$docker_container")
  image=$(docker inspect -f '{{.Config.Image}}' "$docker_container")
  terminal_cwd=$(docker exec "$docker_container" hermes config get terminal.cwd 2>/dev/null | tail -n 1 || true)
  [ -n "$terminal_cwd" ] || terminal_cwd=.
  validate_workspace_path "$terminal_cwd"
  if [ "$terminal_cwd" = . ]; then resolved_cwd=/opt/data; else resolved_cwd=$terminal_cwd; fi
  printf 'mode=docker\nworkspace_inspection=true\ndocker_ambiguous=no\nmanaged=true\nactive=%s\nimage_ref=%s\n' "$running" "$image"
  printf 'container_name=%s\nhermes_home=/opt/data\nterminal_cwd=%s\nresolved_cwd=%s\n' "$docker_container" "$terminal_cwd" "$resolved_cwd"
  docker inspect -f '{{range .Mounts}}{{if eq .Destination "/opt/data"}}{{printf "mount_type=%s\nmount_source=%s\nmount_destination=%s\nmount_name=%s\nmount_driver=%s\n" .Type .Source .Destination .Name .Driver}}{{end}}{{end}}' "$docker_container"
  if docker compose version >/dev/null 2>&1; then printf 'docker_compose=available\n'; else printf 'docker_compose=missing\n'; fi
}

validate_workspace_path() {
  case "$1" in .|/opt/data/workspace|/opt/data/workspace/*) ;; *) fail invalid_workspace_path ;; esac
  case "$1" in *..*) fail invalid_workspace_path ;; esac
  case "$1" in *[!A-Za-z0-9_./-]*) fail invalid_workspace_path ;; esac
}

workspace_get() {
  validate_docker
  value=$(docker exec "$docker_container" hermes config get terminal.cwd 2>/dev/null | tail -n 1 || true)
  [ -n "$value" ] || value=.
  validate_workspace_path "$value"
  printf '%s\n' "$value"
}

workspace_set() {
  validate_docker
  validate_workspace_path "$1"
  docker exec "$docker_container" hermes config set terminal.cwd "$1"
}

workspace_probe() {
  validate_docker
  validate_workspace_path "$1"
  docker exec "$docker_container" sh -c 'set -eu; marker="$1/.hermes-runtime-probe-$$"; : > "$marker"; rm -f -- "$marker"' sh "$1"
}

run_as_service() {
  service_home=$(getent passwd "$service_user" | cut -d: -f6)
  [ -n "$service_home" ] || fail service_home_missing
  runuser -u "$service_user" -- env HOME="$service_home" HERMES_HOME="$runtime_root" "$@"
}

update_native() {
  inspect_native >/dev/null
  previous=$(native_current_commit) || fail native_release_invalid
  target=$(git ls-remote "$REPOSITORY" refs/heads/main | cut -f1)
  valid_hex "$target" 40 || fail native_target_invalid
  if [ "$target" = "$previous" ]; then
    printf 'mode=native\nupdated=false\nprevious_revision=%s\ncurrent_revision=%s\n' "$previous" "$target"
    return
  fi

  release="$NATIVE_ROOT/releases/$target"
  installer=$(mktemp)
  trap 'rm -f -- "$installer"' EXIT HUP INT TERM
  curl -fsSL --retry 3 -o "$installer" "$INSTALLER_URL"
  chmod 0755 "$installer"
  if [ -e "$release" ]; then
    observed=$(git -c safe.directory="$release" -C "$release" rev-parse HEAD 2>/dev/null || true)
    [ "$observed" = "$target" ] && [ -x "$release/venv/bin/hermes" ] || fail native_release_collision
  else
    run_as_service bash "$installer" --branch main --dir "$release" --hermes-home "$runtime_root" --skip-setup --skip-browser --non-interactive
  fi
  observed=$(git -c safe.directory="$release" -C "$release" rev-parse HEAD 2>/dev/null || true)
  [ "$observed" = "$target" ] || fail native_revision_mismatch
  chown -R 0:0 "$release"
  ln -sfn "$release" "$NATIVE_ROOT/current"
  if ! systemctl restart "$NATIVE_SERVICE" || ! healthcheck; then
    ln -sfn "$NATIVE_ROOT/releases/$previous" "$NATIVE_ROOT/current"
    if systemctl restart "$NATIVE_SERVICE" && healthcheck; then
      printf 'mode=native\nupdated=false\nrolled_back=true\nprevious_revision=%s\ncurrent_revision=%s\n' "$previous" "$previous"
      exit 75
    fi
    printf 'mode=native\nupdated=false\nrecovery_required=true\nprevious_revision=%s\n' "$previous"
    exit 76
  fi
  printf 'mode=native\nupdated=true\nprevious_revision=%s\ncurrent_revision=%s\n' "$previous" "$target"
}

start_docker_runtime() {
  image=$1
  docker run -d --name "$docker_container" \
    --label hermes.console.managed=true \
    --label hermes.console.contract="$docker_contract" \
    --label hermes.console.source="$docker_source" \
    --label hermes.console.resolved="$image" \
    --label hermes.console.uid="$service_uid" \
    --label hermes.console.gid="$service_gid" \
    --restart unless-stopped \
    --cap-drop ALL --cap-add CHOWN --cap-add DAC_OVERRIDE --cap-add FOWNER \
    --cap-add SETGID --cap-add SETUID \
    --security-opt no-new-privileges:true \
    --pids-limit 256 --cpus 1.5 --memory 6g \
    --env HERMES_UID="$service_uid" --env HERMES_GID="$service_gid" \
    --workdir /opt/data \
    --tmpfs /tmp:size=512m,mode=1777 \
    --tmpfs /var/tmp:size=256m,mode=1777 \
    --tmpfs /run:rw,exec,nosuid,nodev,size=64m,mode=0755,uid=0,gid=0 \
    --mount "type=bind,src=$runtime_root,dst=/opt/data" \
    -p 127.0.0.1:8642:8642 \
    --env-file "$runtime_root/runtime.env" \
    "$image" gateway run >/dev/null
}

update_docker() {
  validate_docker
  previous=$(docker inspect -f '{{.Config.Image}}' "$docker_container")
  docker pull "$docker_source" >/dev/null
  target=$(docker image inspect -f '{{range .RepoDigests}}{{println .}}{{end}}' "$docker_source" | sed -n '/^nousresearch\/hermes-agent@sha256:[a-f0-9]\{64\}$/ { p; q; }')
  target_digest=${target#nousresearch/hermes-agent@sha256:}
  [ "$target_digest" != "$target" ] && valid_hex "$target_digest" 64 || fail docker_target_invalid
  if [ "$target" = "$previous" ]; then
    docker start "$docker_container" >/dev/null 2>&1 || true
    healthcheck || fail docker_health_failed
    printf 'mode=docker\nupdated=false\nprevious_revision=%s\ncurrent_revision=%s\n' "$previous" "$target"
    return
  fi

  rollback_name="${docker_container}.rollback.$(date +%s).$$"
  docker stop "$docker_container" >/dev/null
  docker rename "$docker_container" "$rollback_name"
  if start_docker_runtime "$target" && healthcheck; then
    docker rm -f "$rollback_name" >/dev/null
    printf 'mode=docker\nupdated=true\nprevious_revision=%s\ncurrent_revision=%s\n' "$previous" "$target"
    return
  fi

  docker rm -f "$docker_container" >/dev/null 2>&1 || true
  if docker rename "$rollback_name" "$docker_container" && docker start "$docker_container" >/dev/null && healthcheck; then
    printf 'mode=docker\nupdated=false\nrolled_back=true\nprevious_revision=%s\ncurrent_revision=%s\n' "$previous" "$previous"
    exit 75
  fi
  printf 'mode=docker\nupdated=false\nrecovery_required=true\nprevious_revision=%s\n' "$previous"
  exit 76
}

validate_config
case "${1:-}" in
  inspect)
    [ "$#" -eq 1 ] || fail invalid_arguments
    if [ "$mode" = native ]; then inspect_native; else inspect_docker; fi
    ;;
  update)
    [ "$#" -eq 1 ] || fail invalid_arguments
    if [ "$mode" = native ]; then update_native; else update_docker; fi
    ;;
  workspace-get)
    [ "$#" -eq 1 ] || fail invalid_arguments
    [ "$mode" = docker ] || fail invalid_mode
    workspace_get
    ;;
  workspace-set)
    [ "$#" -eq 2 ] || fail invalid_arguments
    [ "$mode" = docker ] || fail invalid_mode
    workspace_set "$2"
    ;;
  workspace-probe)
    [ "$#" -eq 2 ] || fail invalid_arguments
    [ "$mode" = docker ] || fail invalid_mode
    workspace_probe "$2"
    ;;
  *) fail invalid_operation ;;
esac
