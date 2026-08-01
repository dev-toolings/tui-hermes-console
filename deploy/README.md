# Production Compose

Create the untracked environment file, replace every placeholder, then always
pass it to Compose for variable interpolation:

```sh
cp deploy/production.env.example deploy/production.env
docker compose --env-file deploy/production.env -f compose.prod.yml config --quiet
docker compose --env-file deploy/production.env -f compose.prod.yml up -d --build
```

For the first deployment that introduces the split owner/runtime roles, stop
the old API (which still knows the owner credential) and its public entrypoint,
then force recreation of every service:

```sh
docker compose --env-file deploy/production.env -f compose.prod.yml stop console caddy
docker compose --env-file deploy/production.env -f compose.prod.yml up -d --build --force-recreate
```

Never use `--no-recreate` for this upgrade and never run `docker compose run
migrate` on its own. Either shortcut can leave the old owner-privileged API
alive while the database boundary is being changed.

PostgreSQL uses two identities:

- `POSTGRES_USER` / `DATABASE_OWNER_URL`: database owner, available only to
  PostgreSQL and the one-shot migration container;
- `POSTGRES_RUNTIME_USER` / `DATABASE_URL`: non-owner API identity, restricted
  to application DML plus the audited append function.

Keep `POSTGRES_USER=hermes` when upgrading an existing volume initialized with
that owner. Changing `POSTGRES_USER` does not rename a role in an existing
PostgreSQL data directory. The migration container creates or rotates the
runtime role idempotently, applies migrations as owner, then reconciles grants
before the API is allowed to start.

## External Hermes over SSH

When the runtime uses SSH, set `CONSOLE_SSH_DIR` to an operator-owned directory
containing only the verified `known_hosts` and the SSH configuration/identity
required by the `hermes-console` service account. Apply the opt-in overlay:

```sh
docker compose --env-file deploy/production.env \
  -f compose.prod.yml -f compose.prod.ssh.yml config --quiet
docker compose --env-file deploy/production.env \
  -f compose.prod.yml -f compose.prod.ssh.yml up -d --build
```

The overlay mounts that directory read-only at `/home/bun/.ssh`; no private key
belongs in Git. The SSH config must use a deterministic `IdentityFile` readable
by UID `bun` because the runtime enforces `BatchMode=yes`,
`StrictHostKeyChecking=yes` and `IdentitiesOnly=yes`. An agent socket requires
an additional deployment-specific read-only socket mount and a bun-readable
`SSH_AUTH_SOCK`. Repeat the overlay flags for every upgrade or restart that must
keep the SSH transport enabled.
