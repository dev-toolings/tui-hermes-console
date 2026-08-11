#!/bin/sh
set -eu

VMID=${PVE_VMID:-210}
APPLY=0

usage() {
  cat <<'EOF'
Usage: cleanup-vm210-memory.sh [--apply]

Sans option, affiche uniquement ce qui serait nettoye dans la VM 210.
Avec --apply :
  - conserve la release Hermes active et une release de rollback ;
  - supprime les anciennes releases et les .staging-hermes-* ;
  - supprime les images et le cache de build Docker inutilises (jamais les volumes) ;
  - libere le page cache, les dentries et les inodes Linux apres sync.

La cible peut etre surchargee avec PVE_VMID=<vmid>.
EOF
}

case "${1:-}" in
  "") ;;
  --apply) APPLY=1 ;;
  -h|--help)
    usage
    exit 0
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac

if ! command -v pvecli >/dev/null 2>&1; then
  printf '%s\n' "Erreur: pvecli est introuvable." >&2
  exit 127
fi

REMOTE_SCRIPT=$(cat <<'EOF'
set -eu

NATIVE_ROOT=/opt/hermes-console
RELEASES_DIR=$NATIVE_ROOT/releases
CURRENT_LINK=$NATIVE_ROOT/current

if [ "$(id -u)" -ne 0 ]; then
  printf '%s\n' "Erreur: le QEMU guest agent doit executer ce nettoyage en root." >&2
  exit 1
fi

if [ ! -d "$RELEASES_DIR" ] || [ ! -L "$CURRENT_LINK" ]; then
  printf '%s\n' "Erreur: installation Hermes native introuvable sous $NATIVE_ROOT." >&2
  exit 1
fi

CURRENT_RELEASE=$(readlink -f "$CURRENT_LINK")
case "$CURRENT_RELEASE" in
  "$RELEASES_DIR"/*) ;;
  *)
    printf '%s\n' "Erreur: la release active sort de $RELEASES_DIR: $CURRENT_RELEASE" >&2
    exit 1
    ;;
esac

if [ ! -x "$CURRENT_RELEASE/venv/bin/hermes" ]; then
  printf '%s\n' "Erreur: la release active ne contient pas venv/bin/hermes." >&2
  exit 1
fi

remove_managed_dir() {
  target=$1
  base=${target##*/}

  case "$target" in
    "$RELEASES_DIR"/*) ;;
    *)
      printf '%s\n' "Refus de supprimer un chemin hors releases: $target" >&2
      exit 1
      ;;
  esac

  case "$base" in
    .staging-hermes-*) ;;
    *)
      if ! printf '%s\n' "$base" | grep -Eq '^[0-9a-f]{40}$'; then
        printf '%s\n' "Refus de supprimer un repertoire non gere: $target" >&2
        exit 1
      fi
      ;;
  esac

  if [ "$APPLY" -eq 1 ]; then
    printf 'Suppression: %s\n' "$target"
    rm -rf -- "$target"
  else
    printf '[dry-run] suppression: %s\n' "$target"
  fi
}

printf '%s\n' "=== Avant ==="
free -h
printf 'Release active: %s\n' "$CURRENT_RELEASE"
du -sh "$RELEASES_DIR" 2>/dev/null || true

find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d \
  -name '.staging-hermes-*' -print | sort | while IFS= read -r staging; do
    remove_managed_dir "$staging"
  done

kept_previous=0
find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d \
  -regextype posix-extended -regex '.*/[0-9a-f]{40}' -printf '%T@ %p\n' \
  | sort -nr | cut -d' ' -f2- | while IFS= read -r release; do
    release=$(readlink -f "$release")
    if [ "$release" = "$CURRENT_RELEASE" ]; then
      printf 'Conservee (active): %s\n' "$release"
    elif [ "$kept_previous" -eq 0 ]; then
      printf 'Conservee (rollback): %s\n' "$release"
      kept_previous=1
    else
      remove_managed_dir "$release"
    fi
  done

if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  if [ "$APPLY" -eq 1 ]; then
    printf '%s\n' "Nettoyage des images et du cache de build Docker inutilises..."
    docker image prune --all --force
    docker builder prune --all --force
  else
    printf '%s\n' "[dry-run] docker image prune --all --force"
    printf '%s\n' "[dry-run] docker builder prune --all --force"
  fi
else
  printf '%s\n' "Docker indisponible, nettoyage Docker ignore."
fi

printf '%s\n' "=== Stockage apres nettoyage ==="
du -sh "$RELEASES_DIR" 2>/dev/null || true

if [ "$APPLY" -eq 1 ]; then
  printf '%s\n' "Synchronisation disque puis liberation des caches Linux..."
  sync
  printf '3\n' > /proc/sys/vm/drop_caches
fi

printf '%s\n' "=== Memoire apres nettoyage ==="
free -h

if [ "$APPLY" -eq 0 ]; then
  printf '%s\n' "Dry-run termine. Relancer avec --apply pour effectuer le nettoyage."
fi
EOF
)

printf 'VM cible: %s (%s)\n' "$VMID" "$([ "$APPLY" -eq 1 ] && printf apply || printf dry-run)"
pvecli vm agent exec "$VMID" --shell "APPLY=$APPLY
$REMOTE_SCRIPT"
