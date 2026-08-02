# syntax=docker/dockerfile:1.7

# Keep the build and runtime Bun versions identical. The manifest digest makes
# the production input immutable while the tag keeps it readable.
FROM oven/bun:1.3.13-alpine@sha256:4de475389889577f346c636f956b42a5c31501b654664e9ae5726f94d7bb5349 AS base
WORKDIR /app

FROM base AS manifests
COPY package.json bun.lock ./
COPY apps/web/package.json apps/web/package.json
COPY apps/server/package.json apps/server/package.json
COPY packages/console-core/package.json packages/console-core/package.json
COPY packages/ui/package.json packages/ui/package.json

FROM manifests AS build-deps
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile

FROM build-deps AS spa-build
COPY apps/web apps/web
COPY packages/console-core packages/console-core
COPY packages/ui packages/ui
RUN bun run --filter web build

# Migration tooling and the owner credential are deliberately isolated from
# the runtime image. Compose runs this target once before starting the API.
FROM build-deps AS migration
COPY --chown=bun:bun apps/server apps/server
COPY --chown=bun:bun packages/console-core packages/console-core
USER bun
CMD ["bun", "run", "--filter", "server", "db:migrate:production"]

# Install only the server workspace and its production dependency closure.
FROM manifests AS runtime-deps
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile --production --filter server

FROM base AS runtime
RUN apk add --no-cache ca-certificates openssh-client \
    && mkdir -p /data/files /data/work /data/ssh /home/bun/.ssh \
    && touch /data/ssh/known_hosts \
    && chmod 0700 /data/ssh \
    && chmod 0600 /data/ssh/known_hosts \
    && chown -R bun:bun /data /home/bun

ENV NODE_ENV=production \
    CONSOLE_SERVER_HOST=0.0.0.0 \
    CONSOLE_SERVER_PORT=3170 \
    WEB_DIST_DIR=/app/apps/web/dist \
    HERMES_CONSOLE_ARTIFACTS_DIR=/data/files \
    HERMES_SSH_KNOWN_HOSTS_FILE=/data/ssh/known_hosts \
    HERMES_SHARED_WORKDIR=/data/work

COPY --from=runtime-deps --chown=bun:bun /app/node_modules ./node_modules
COPY --from=runtime-deps --chown=bun:bun /app/package.json /app/bun.lock ./
COPY --from=runtime-deps --chown=bun:bun /app/apps/server/package.json apps/server/package.json
COPY --from=runtime-deps --chown=bun:bun /app/apps/server/node_modules apps/server/node_modules
COPY --from=runtime-deps --chown=bun:bun /app/packages/console-core/package.json packages/console-core/package.json
COPY --chown=bun:bun apps/server/tsconfig.json apps/server/tsconfig.json
COPY --chown=bun:bun apps/server/src apps/server/src
# Le garde-fou de dérive compare la base au journal des migrations : cette liste
# doit voyager avec le build qui l'attend. Seul `meta/` est nécessaire ici — les
# fichiers SQL restent confinés au stage `migration`.
COPY --chown=bun:bun apps/server/drizzle/meta apps/server/drizzle/meta
COPY --chown=bun:bun packages/console-core/src packages/console-core/src
COPY --from=spa-build --chown=bun:bun /app/apps/web/dist apps/web/dist

USER bun
EXPOSE 3170
VOLUME ["/data/files", "/data/work", "/data/ssh"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["bun", "-e", "const r=await fetch('http://127.0.0.1:3170/api/healthz');if(!r.ok)process.exit(1)"]
CMD ["bun", "apps/server/src/index.ts"]
