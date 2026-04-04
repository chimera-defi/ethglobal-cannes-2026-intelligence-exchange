# Intelligence Exchange - Development Commands
# Usage: make <command>

POSTGRES_PORT ?= 5432
REDIS_PORT ?= 6379
BROKER_PORT ?= 3001
WEB_PORT ?= 3000
DATABASE_URL ?= postgres://iex:iex@localhost:$(POSTGRES_PORT)/iex_cannes
REDIS_URL ?= redis://localhost:$(REDIS_PORT)
BROKER_URL ?= http://localhost:$(BROKER_PORT)
VITE_DEV_PROXY_TARGET ?= $(BROKER_URL)
COMPOSE ?= ./scripts/tooling/docker-compose.sh

.PHONY: help install setup dev dev-broker dev-web seed stop clean test validate

# Default command
help:
	@echo "Intelligence Exchange - Available Commands"
	@echo ""
	@echo "Setup:"
	@echo "  make install         Install dependencies"
	@echo "  make setup           Full setup (install + tooling + infra)"
	@echo ""
	@echo "Development:"
	@echo "  make dev             Start full stack (broker + web + seed)"
	@echo "  make dev-broker      Start broker only"
	@echo "  make dev-web         Start web only"
	@echo "  make seed            Seed database with demo data"
	@echo ""
	@echo "Infrastructure:"
	@echo "  make infra-up        Start Docker infrastructure (Postgres + Redis)"
	@echo "  make infra-down      Stop Docker infrastructure"
	@echo "  make infra-reset     Reset Docker infrastructure (wipes data)"
	@echo ""
	@echo "Testing:"
	@echo "  make test            Run all tests"
	@echo "  make test-acceptance Run acceptance tests"
	@echo "  make validate        Full validation (typecheck + build + test)"
	@echo ""
	@echo "Utilities:"
	@echo "  make stop            Stop all running services"
	@echo "  make clean           Clean build artifacts and node_modules"
	@echo "  make screenshots     Update screenshots (requires running stack)"

# Setup commands
install:
	corepack pnpm install

setup: install
	corepack pnpm tooling:install
	$(MAKE) infra-up

# Infrastructure
infra-up:
	POSTGRES_PORT=$(POSTGRES_PORT) REDIS_PORT=$(REDIS_PORT) $(COMPOSE) up -d
	@echo "Waiting for Postgres and Redis to be ready..."
	@sleep 3
	@echo "Infrastructure ready!"

infra-down:
	POSTGRES_PORT=$(POSTGRES_PORT) REDIS_PORT=$(REDIS_PORT) $(COMPOSE) down

infra-reset:
	POSTGRES_PORT=$(POSTGRES_PORT) REDIS_PORT=$(REDIS_PORT) $(COMPOSE) down -v
	POSTGRES_PORT=$(POSTGRES_PORT) REDIS_PORT=$(REDIS_PORT) $(COMPOSE) up -d
	@echo "Infrastructure reset (data wiped)"

# Development - Full stack
dev:
	@./scripts/dev-start.sh

# Development - Individual services
dev-broker: infra-up
	@echo "Starting broker on $(BROKER_URL)"
	@PORT=$(BROKER_PORT) DATABASE_URL=$(DATABASE_URL) REDIS_URL=$(REDIS_URL) BROKER_URL=$(BROKER_URL) \
	corepack pnpm --filter intelligence-exchange-cannes-broker dev

dev-web:
	@echo "Starting web on http://localhost:$(WEB_PORT)"
	@BROKER_URL=$(BROKER_URL) VITE_DEV_PROXY_TARGET=$(VITE_DEV_PROXY_TARGET) \
	corepack pnpm --filter intelligence-exchange-cannes-web exec vite --host 127.0.0.1 --port $(WEB_PORT)

# Database
seed:
	@echo "Seeding database..."
	@DATABASE_URL=$(DATABASE_URL) REDIS_URL=$(REDIS_URL) BROKER_URL=$(BROKER_URL) \
	corepack pnpm --filter intelligence-exchange-cannes-broker seed
	@echo "Database seeded!"

db-reset: infra-reset
	@echo "Database reset complete"

# Testing
test:
	corepack pnpm test

test-acceptance: infra-up
	@echo "Running acceptance tests..."
	@DATABASE_URL=$(DATABASE_URL) REDIS_URL=$(REDIS_URL) BROKER_URL=$(BROKER_URL) \
	corepack pnpm test:acceptance

validate: infra-up
	corepack pnpm validate:all

# Screenshots
screenshots:
	@echo "Updating screenshots (requires running stack)..."
	@node scripts/take-screenshots.mjs

# Cleanup
stop:
	@echo "Stopping all services..."
	@-pkill -f "intelligence-exchange-cannes-broker" 2>/dev/null || true
	@-pkill -f "intelligence-exchange-cannes-web" 2>/dev/null || true
	@$(MAKE) infra-down
	@echo "All services stopped"

clean:
	@$(MAKE) stop
	@rm -rf node_modules apps/*/node_modules packages/*/node_modules
	@rm -rf apps/*/dist packages/*/dist
	@echo "Cleaned build artifacts"

# Quick start for demos
demo: setup
	@$(MAKE) dev
