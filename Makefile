# Hermes Console — task runner
# Run `make` (or `make help`) for the categorized target list.

SHELL := /bin/bash
.DEFAULT_GOAL := help
MAKEFLAGS += --no-print-directory

PKG      := bun
SERVER   := apps/server
WEB      := apps/web
SPIKE    := spike
ENV_FILE := $(SERVER)/.env.local
ENV_TPL  := $(SERVER)/.env.example
# Le serveur Hono sert l'API et le SPA compilé sur ce même port.
PORT     ?= 3170
# Port du dev server Vite (apps/web), lancé par `make dev` / `make web`.
WEB_PORT ?= 1420

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
env: ## Crée apps/server/.env.local s'il manque (clé de chiffrement générée)
	@if [ -f "$(ENV_FILE)" ]; then \
		printf "$(GREEN)✓$(RESET) %s\n" "$(ENV_FILE) already exists"; \
	elif [ ! -f "$(ENV_TPL)" ]; then \
		printf "$(RED)✗$(RESET) %s\n" "missing $(ENV_TPL)" >&2; exit 1; \
	else \
		key=$$(openssl rand -hex 32) || exit 1; \
		sed "s|^APP_ENCRYPTION_KEY=.*|APP_ENCRYPTION_KEY=$$key|" "$(ENV_TPL)" > "$(ENV_FILE)"; \
		printf "$(GREEN)✓$(RESET) %s\n" "$(ENV_FILE) created from $(ENV_TPL) (APP_ENCRYPTION_KEY generated)"; \
	fi
	@chmod 600 "$(ENV_FILE)"

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

# Le sidecar Tauri (`make tauri-dev`) écoute lui aussi sur $(PORT), et il
# survit à l'app qui l'a lancé. Tant qu'il traîne, `bun --watch` meurt en
# EADDRINUSE — mais l'erreur défile au milieu des logs de Vite, et le SPA
# continue de parler à l'ANCIEN binaire compilé sans que rien ne le signale.
#
# On récupère donc le port, mais seulement quand c'est sans risque :
#   - processus de ce dépôt ET orphelin (PPID 1) -> on l'arrête, il ne sert
#     plus personne ;
#   - processus de ce dépôt avec un parent vivant -> l'app desktop tourne
#     vraiment, on ne la casse pas dans son dos ;
#   - tout le reste -> on n'a pas lancé ce processus, on n'y touche pas.
.PHONY: port-free
port-free:
	@pid=$$(lsof -nP -iTCP:$(PORT) -sTCP:LISTEN -t 2>/dev/null | head -1); \
	[ -n "$$pid" ] || exit 0; \
	cmd=$$(ps -o command= -p "$$pid" 2>/dev/null); \
	ppid=$$(ps -o ppid= -p "$$pid" 2>/dev/null | tr -d ' '); \
	cwd=$$(lsof -a -p "$$pid" -d cwd -Fn 2>/dev/null | sed -n 's|^n||p' | head -1); \
	ours=no; \
	case "$$cmd" in $(CURDIR)/*) ours=yes;; esac; \
	case "$$cwd" in $(CURDIR)|$(CURDIR)/*) ours=yes;; esac; \
	if [ "$$ours" != yes ]; then \
	  printf "$(RED)✗$(RESET) %s\n" "port $(PORT) occupé par un processus étranger (PID $$pid) :" >&2; \
	  printf "    %s\n" "$$cmd" >&2; \
	  printf "    %s\n" "il n'a pas été lancé depuis ce dépôt — à toi de trancher : kill $$pid" >&2; \
	  exit 1; \
	fi; \
	if [ "$$ppid" != "1" ]; then \
	  printf "$(RED)✗$(RESET) %s\n" "port $(PORT) tenu par un processus VIVANT de ce dépôt (PID $$pid, parent $$ppid) :" >&2; \
	  printf "    %s\n" "$$cmd" >&2; \
	  printf "    %s\n" "app desktop ou autre 'make dev' en cours — 'make stop', ou : make dev PORT=3171" >&2; \
	  exit 1; \
	fi; \
	printf "$(YELLOW)!$(RESET) %s\n" "port $(PORT) tenu par un processus orphelin de ce dépôt (PID $$pid) — arrêt"; \
	printf "    %s\n" "$$cmd"; \
	kill "$$pid" 2>/dev/null || true; \
	for _ in 1 2 3 4 5 6 7 8 9 10; do \
	  lsof -nP -iTCP:$(PORT) -sTCP:LISTEN -t >/dev/null 2>&1 || break; sleep 0.3; \
	done; \
	if lsof -nP -iTCP:$(PORT) -sTCP:LISTEN -t >/dev/null 2>&1; then kill -9 "$$pid" 2>/dev/null || true; sleep 0.5; fi; \
	if lsof -nP -iTCP:$(PORT) -sTCP:LISTEN -t >/dev/null 2>&1; then \
	  printf "$(RED)✗$(RESET) %s\n" "port $(PORT) toujours occupé" >&2; exit 1; \
	fi; \
	printf "$(GREEN)✓$(RESET) %s\n" "port $(PORT) libéré"

.PHONY: dev
dev: port-free ## Lance l'API (3170) et le SPA Vite (1420)
	$(call say,Starting API on :$(PORT) and web app on http://127.0.0.1:1420)
	@CONSOLE_SERVER_PORT=$(PORT) $(PKG) run dev

.PHONY: api
api: port-free ## Lance l'API seule (3170), sans le SPA
	$(call say,Starting API on :$(PORT))
	@CONSOLE_SERVER_PORT=$(PORT) $(PKG) run dev:server

.PHONY: web
web: ## Lance l'app web Vite seule (1420), proxie /api vers l'API
	$(call say,Starting web app on http://127.0.0.1:1420 — API expected on :$(PORT))
	@CONSOLE_SERVER_PORT=$(PORT) $(PKG) run dev:web

# `port-free` refuse de tuer un processus vivant : c'est un garde-fou pour `dev`,
# pas pour un arrêt demandé explicitement. `stop` est l'ordre explicite : il tue
# tout ce que CE dépôt écoute (API + Vite), orphelin ou non. Il ne touche jamais
# un processus étranger — il le signale et sort en erreur.
.PHONY: stop
stop: ## Arrête tout ce que ce dépôt a lancé (API + SPA Vite)
	@owned=""; foreign=0; \
	for port in $(PORT) $(WEB_PORT); do \
	  for pid in $$(lsof -nP -iTCP:$$port -sTCP:LISTEN -t 2>/dev/null); do \
	    cmd=$$(ps -o command= -p "$$pid" 2>/dev/null); \
	    cwd=$$(lsof -a -p "$$pid" -d cwd -Fn 2>/dev/null | sed -n 's|^n||p' | head -1); \
	    ours=no; \
	    case "$$cmd" in $(CURDIR)/*) ours=yes;; esac; \
	    case "$$cwd" in $(CURDIR)|$(CURDIR)/*) ours=yes;; esac; \
	    if [ "$$ours" != yes ]; then \
	      printf "$(RED)✗$(RESET) %s\n" "port $$port occupé par un processus étranger (PID $$pid) — pas touché :" >&2; \
	      printf "    %s\n" "$$cmd" >&2; \
	      foreign=1; continue; \
	    fi; \
	    printf "$(CYAN)▸$(RESET) %s\n" "arrêt du PID $$pid (port $$port)"; \
	    printf "    $(DIM)%s$(RESET)\n" "$$cmd"; \
	    kill "$$pid" 2>/dev/null || true; \
	    owned="$$owned $$pid"; \
	  done; \
	done; \
	if [ -z "$$owned" ]; then \
	  [ "$$foreign" = 0 ] && printf "$(GREEN)✓$(RESET) %s\n" "rien à arrêter (ports $(PORT) et $(WEB_PORT) libres)"; \
	  exit $$foreign; \
	fi; \
	alive=""; \
	for _ in 1 2 3 4 5 6 7 8 9 10; do \
	  alive=""; \
	  for pid in $$owned; do kill -0 "$$pid" 2>/dev/null && alive="$$alive $$pid"; done; \
	  [ -n "$$alive" ] || break; \
	  sleep 0.3; \
	done; \
	for pid in $$alive; do \
	  printf "$(YELLOW)!$(RESET) %s\n" "PID $$pid ne répond pas à SIGTERM — kill -9"; \
	  kill -9 "$$pid" 2>/dev/null || true; \
	done; \
	printf "$(GREEN)✓$(RESET) %s\n" "arrêté :$$owned"; \
	exit $$foreign

.PHONY: build
build: ## Build de production du SPA
	$(call say,Building the SPA)
	@$(PKG) run build

.PHONY: start
start: build ## Sert l'API et le SPA compilé sur un seul port
	$(call say,Serving the console on http://localhost:$(PORT))
	@CONSOLE_SERVER_PORT=$(PORT) $(PKG) run start

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
	@cd $(SERVER) && $(PKG) test --watch

.PHONY: check
check: lint typecheck test ## Lint + typecheck + tests
	$(call ok,All checks passed)

##@ Base de données

.PHONY: db-check
db-check: ## Vérifie Postgres et crée la base $(PG_DB) si elle manque
	@if ! (exec 3<>/dev/tcp/$(PG_HOST)/$(PG_PORT)) 2>/dev/null; then \
		printf "$(RED)✗$(RESET) %s\n" "no Postgres on $(PG_HOST):$(PG_PORT)" >&2; \
		printf "    docker start $(PG_CTR)\n" >&2; \
		printf "    # ou: docker compose -f ~/Documents/infra/compose.yml up -d postgres\n" >&2; \
		exit 1; \
	fi
	@if docker exec $(PG_CTR) true >/dev/null 2>&1; then \
		psql="docker exec $(PG_CTR) psql"; \
		createdb="docker exec $(PG_CTR) createdb"; \
	elif command -v psql >/dev/null 2>&1; then \
		psql="psql -h $(PG_HOST) -p $(PG_PORT)"; \
		createdb="createdb -h $(PG_HOST) -p $(PG_PORT)"; \
	else \
		printf "$(YELLOW)!$(RESET) %s\n" "Postgres up on $(PG_HOST):$(PG_PORT) — no psql, skipping $(PG_DB) check"; \
		exit 0; \
	fi; \
	found=$$($$psql -U $(PG_USER) -d postgres -tAc \
		"SELECT 1 FROM pg_database WHERE datname='$(PG_DB)'" 2>/dev/null); \
	if [ "$$found" != "1" ]; then \
		printf "$(CYAN)▸$(RESET) %s\n" "creating database $(PG_DB)"; \
		$$createdb -U $(PG_USER) $(PG_DB) || exit 1; \
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

.PHONY: db-studio
db-studio: ## Ouvre Drizzle Studio
	$(call say,Opening Drizzle Studio)
	@cd $(SERVER) && bunx drizzle-kit studio

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
clean: ## Supprime les artefacts de build (dist, tsbuildinfo)
	$(call say,Removing build artifacts)
	@rm -rf $(WEB)/dist $(WEB)/*.tsbuildinfo $(SERVER)/*.tsbuildinfo
	$(call ok,Build artifacts removed)

.PHONY: clean-all
clean-all: clean ## clean + node_modules (réinstall nécessaire)
	$(call warn,Removing all node_modules)
	@find . -name node_modules -type d -prune -not -path "./.git/*" -exec rm -rf {} +
	$(call ok,Workspace cleaned — run 'make install')
