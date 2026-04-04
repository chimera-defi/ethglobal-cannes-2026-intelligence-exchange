# Intelligence Exchange - Development Commands
# Usage: make <command>

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
	docker compose up -d
	@echo "Waiting for Postgres and Redis to be ready..."
	@sleep 3
	@echo "Infrastructure ready!"

infra-down:
	docker compose down

infra-reset:
	docker compose down -v
	docker compose up -d
	@echo "Infrastructure reset (data wiped)"

# Development - Full stack
dev: infra-up
	@echo "Starting Intelligence Exchange full stack..."
	@echo "This will start: Broker (port 3001), Web (port 3000)"
	@echo ""
	@(trap 'kill %1 %2' INT; \
		DATABASE_URL=postgres://iex:iex@localhost:5432/iex_cannes \
		REDIS_URL=redis://localhost:6379 \
		corepack pnpm --filter intelligence-exchange-cannes-broker dev & \
		sleep 5 && \
		$(MAKE) seed && \
		corepack pnpm --filter intelligence-exchange-cannes-web dev & \
		wait)

# Development - Individual services
dev-broker: infra-up
	@echo "Starting broker on http://localhost:3001"
	@DATABASE_URL=postgres://iex:iex@localhost:5432/iex_cannes \
	REDIS_URL=redis://localhost:6379 \
	corepack pnpm --filter intelligence-exchange-cannes-broker dev

dev-web:
	@echo "Starting web on http://localhost:3000"
	@corepack pnpm --filter intelligence-exchange-cannes-web dev

# Database
seed:
	@echo "Seeding database..."
	@DATABASE_URL=postgres://iex:iex@localhost:5432/iex_cannes \
	REDIS_URL=redis://localhost:6379 \
	corepack pnpm --filter intelligence-exchange-cannes-broker seed
	@echo "Database seeded!"

db-reset: infra-reset
	@echo "Database reset complete"

# Testing
test:
	corepack pnpm test

test-acceptance: infra-up
	@echo "Running acceptance tests..."
	@DATABASE_URL=postgres://iex:iex@localhost:5432/iex_cannes \
	REDIS_URL=redis://localhost:6379 \
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
