#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
ENV_FILE=${HERMES_CONSOLE_ENV_FILE:-"$REPO_DIR/apps/server/.env.local"}

cd "$REPO_DIR"

if [ -f "$ENV_FILE" ]; then
  exec bun --env-file="$ENV_FILE" apps/server/scripts/sync-hermes-releases.ts
fi

exec bun apps/server/scripts/sync-hermes-releases.ts
