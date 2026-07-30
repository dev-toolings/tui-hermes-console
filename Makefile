# Hermes Console — task runner
# Run `make` (or `make help`) for the categorized target list.

SHELL := /bin/bash
.DEFAULT_GOAL := help
MAKEFLAGS += --no-print-directory

PKG      := bun
WEB      := apps/web
SPIKE    := spike
ENV_FILE := $(WEB)/.env.local
ENV_TPL  := $(WEB)/.env.example
PORT     ?= 3000

# Postgres local — conteneur `infra-postgres` (~/Documents/infra/compose.yml)
PG_HOST ?= localhost
PG_PORT ?= 5432
PG_USER ?= test
PG_DB   ?= hermes_console
PG_CTR  ?= infra-postgres

# ── Colors ────────────────────────────────────────────────────────────────────
# Honors NO_COLOR (https://no-color.org): `NO_COLOR=1 make help`
BOLD   := \033[1m
DIM    := \033[2m
RED    := \033[31m
GREEN  := \033[32m
YELLOW := \033[33m
CYAN   := \033[36m
RESET  := \033[0m
ifdef NO_COLOR
BOLD   :=
DIM    :=
RED    :=
GREEN  :=
YELLOW :=
CYAN   :=
RESET  :=
endif

# Recipe log helpers: $(call say,...) / $(call ok,...) / $(call warn,...)
say  = @printf "$(CYAN)▸$(RESET) %s\n" "$(1)"
ok   = @printf "$(GREEN)✓$(RESET) %s\n" "$(1)"
warn = @printf "$(YELLOW)!$(RESET) %s\n" "$(1)"
die  = @printf "$(RED)✗$(RESET) %s\n" "$(1)" >&2; exit 1

##@ Aide

.PHONY: help
help: ## Affiche cette aide
	@awk -v bold="$(BOLD)" -v dim="$(DIM)" -v cyan="$(CYAN)" -v reset="$(RESET)" ' \
		BEGIN { FS = ":.*## "; \
			printf "\n%sHermes Console%s %s— make <target> [VAR=value]%s\n", bold, reset, dim, reset } \
		/^##@/ { printf "\n%s%s%s\n", bold, substr($$0, 5), reset } \
		/^[a-zA-Z0-9_.-]+:.*## / { printf "  %s%-16s%s %s\n", cyan, $$1, reset, $$2 } \
		END { printf "\n%sVariables:%s PORT=%s PG_DB=%s PG_PORT=%s\n\n", dim, reset, "$(PORT)", "$(PG_DB)", "$(PG_PORT)" } \
	' $(MAKEFILE_LIST)

##@ Setup

.PHONY: install
install: ## Installe les dépendances du workspace (bun)
	$(call say,Installing workspace dependencies)
	@$(PKG) install
	$(call ok,Dependencies installed)

.PHONY: env
env: ## Crée apps/web/.env.local s'il manque (clé de chiffrement générée)
	@if [ -f "$(ENV_FILE)" ]; then \
		printf "$(GREEN)✓$(RESET) %s\n" "$(ENV_FILE) already exists"; \
	elif [ ! -f "$(ENV_TPL)" ]; then \
		printf "$(RED)✗$(RESET) %s\n" "missing $(ENV_TPL)" >&2; exit 1; \
	else \
		key=$$(openssl rand -hex 32) || exit 1; \
		sed "s|^APP_ENCRYPTION_KEY=.*|APP_ENCRYPTION_KEY=$$key|" "$(ENV_TPL)" > "$(ENV_FILE)"; \
		printf "$(GREEN)✓$(RESET) %s\n" "$(ENV_FILE) created from $(ENV_TPL) (APP_ENCRYPTION_KEY generated)"; \
	fi

.PHONY: workdir
workdir: env ## Crée le volume partagé HERMES_SHARED_WORKDIR
	@dir=$$(sed -n 's|^HERMES_SHARED_WORKDIR=||p' "$(ENV_FILE)" | tail -1); \
	dir=$${dir:-/tmp/hermes-console-work}; \
	mkdir -p "$$dir/runs" || exit 1; \
	printf "$(GREEN)✓$(RESET) %s\n" "shared workdir $$dir"

.PHONY: setup
setup: install env workdir db-check db-migrate ## Setup complet (install + env + workdir + Postgres + migrations)
	$(call ok,Setup done — run 'make dev')

##@ Développement

.PHONY: dev
dev: ## Lance le serveur de dev Next.js (PORT=3000)
	$(call say,Starting dev server on http://localhost:$(PORT))
	@PORT=$(PORT) $(PKG) run dev

.PHONY: build
build: ## Build de production
	$(call say,Building web app)
	@$(PKG) run build

.PHONY: start
start: ## Démarre le build de production (PORT=3000)
	$(call say,Serving production build on http://localhost:$(PORT))
	@PORT=$(PORT) $(PKG) run --filter web start

##@ Qualité

.PHONY: lint
lint: ## ESLint
	$(call say,Linting)
	@$(PKG) run lint

.PHONY: lint-fix
lint-fix: ## ESLint --fix
	$(call say,Linting with autofix)
	@$(PKG) run --filter web lint -- --fix

.PHONY: typecheck
typecheck: ## tsc --noEmit
	$(call say,Typechecking)
	@$(PKG) run typecheck

.PHONY: test
test: ## Tests unitaires (bun test)
	$(call say,Running tests)
	@$(PKG) run test

.PHONY: test-watch
test-watch: ## Tests en mode watch
	@cd $(WEB) && $(PKG) test --watch

.PHONY: check
check: lint typecheck test ## Lint + typecheck + tests
	$(call ok,All checks passed)

##@ Base de données

.PHONY: db-check
db-check: ## Vérifie que Postgres écoute et que la base $(PG_DB) existe
	@if ! (exec 3<>/dev/tcp/$(PG_HOST)/$(PG_PORT)) 2>/dev/null; then \
		printf "$(RED)✗$(RESET) %s\n" "no Postgres on $(PG_HOST):$(PG_PORT)" >&2; \
		printf "    docker start $(PG_CTR)\n" >&2; \
		printf "    # ou: docker compose -f ~/Documents/infra/compose.yml up -d postgres\n" >&2; \
		exit 1; \
	fi
	@if docker exec $(PG_CTR) true >/dev/null 2>&1; then \
		psql="docker exec $(PG_CTR) psql"; \
	elif command -v psql >/dev/null 2>&1; then \
		psql="psql -h $(PG_HOST) -p $(PG_PORT)"; \
	else \
		printf "$(YELLOW)!$(RESET) %s\n" "Postgres up on $(PG_HOST):$(PG_PORT) — no psql, skipping $(PG_DB) check"; \
		exit 0; \
	fi; \
	found=$$($$psql -U $(PG_USER) -d postgres -tAc \
		"SELECT 1 FROM pg_database WHERE datname='$(PG_DB)'" 2>/dev/null); \
	if [ "$$found" != "1" ]; then \
		printf "$(RED)✗$(RESET) %s\n" "database $(PG_DB) does not exist on $(PG_HOST):$(PG_PORT)" >&2; \
		printf "    docker exec $(PG_CTR) createdb -U $(PG_USER) $(PG_DB)\n" >&2; \
		exit 1; \
	fi; \
	printf "$(GREEN)✓$(RESET) %s\n" "Postgres $(PG_HOST):$(PG_PORT) — database $(PG_DB) ready"

.PHONY: db-generate
db-generate: ## Génère une migration Drizzle depuis le schéma
	$(call say,Generating Drizzle migration)
	@$(PKG) run db:generate

.PHONY: db-migrate
db-migrate: ## Applique les migrations
	$(call say,Applying migrations)
	@$(PKG) run db:migrate

.PHONY: db-seed
db-seed: ## Seed l'agent miroir depuis le runtime Hermes
	$(call say,Seeding Hermes mirror agent)
	@$(PKG) run --filter web db:seed

.PHONY: db-studio
db-studio: ## Ouvre Drizzle Studio
	$(call say,Opening Drizzle Studio)
	@cd $(WEB) && bunx drizzle-kit studio

##@ Runtime Hermes

.PHONY: health
health: ## GET /api/healthz de la console
	@curl -fsS "http://localhost:$(PORT)/api/healthz" && printf "\n" \
		|| { printf "$(RED)✗$(RESET) %s\n" "console unreachable on :$(PORT)" >&2; exit 1; }

.PHONY: ready
ready: ## GET /api/readyz de la console
	@curl -fsS "http://localhost:$(PORT)/api/readyz" && printf "\n" \
		|| { printf "$(RED)✗$(RESET) %s\n" "console not ready on :$(PORT)" >&2; exit 1; }

.PHONY: spike-probe
spike-probe: ## Sonde le runtime Hermes (spike/probe.ts)
	$(call say,Probing Hermes runtime)
	@cd $(SPIKE) && $(PKG) run probe

.PHONY: fake-llm
fake-llm: ## Lance le faux LLM du spike
	$(call say,Starting fake LLM server)
	@cd $(SPIKE) && $(PKG) run fake-llm

##@ Maintenance

.PHONY: clean
clean: ## Supprime les artefacts de build (.next, tsbuildinfo)
	$(call say,Removing build artifacts)
	@rm -rf $(WEB)/.next $(WEB)/*.tsbuildinfo
	$(call ok,Build artifacts removed)

.PHONY: clean-all
clean-all: clean ## clean + node_modules (réinstall nécessaire)
	$(call warn,Removing all node_modules)
	@find . -name node_modules -type d -prune -not -path "./.git/*" -exec rm -rf {} +
	$(call ok,Workspace cleaned — run 'make install')
