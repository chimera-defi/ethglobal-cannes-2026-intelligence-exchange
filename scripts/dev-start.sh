#!/usr/bin/env bash
#
# Development Startup Script
# Starts the full Intelligence Exchange stack for local development
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_BIN="${SCRIPT_DIR}/tooling/docker-compose.sh"
PICK_PORT_BIN="${SCRIPT_DIR}/tooling/pick-port.sh"

# Load root .env if it exists (allows per-machine port overrides)
if [[ -f "${ROOT_DIR}/.env" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "${ROOT_DIR}/.env"
    set +a
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     Intelligence Exchange - Development Environment        ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check prerequisites
check_command() {
    if ! command -v "$1" &> /dev/null; then
        echo -e "${RED}Error: $1 is not installed${NC}"
        return 1
    fi
}

echo -e "${YELLOW}Checking prerequisites...${NC}"
check_command docker || exit 1
check_command pnpm || { echo -e "${RED}pnpm not found. Run: corepack enable${NC}"; exit 1; }
check_command node || exit 1
"${COMPOSE_BIN}" version >/dev/null
echo -e "${GREEN}✓ Prerequisites OK${NC}"
echo ""

# Environment setup — respects values loaded from .env above
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
REDIS_PORT="${REDIS_PORT:-6379}"
# PORT from .env is the broker port; fall back to auto-pick
BROKER_PORT="${PORT:-${BROKER_PORT:-$("${PICK_PORT_BIN}" 3001 3101 3201)}}"
WEB_PORT="${WEB_PORT:-$("${PICK_PORT_BIN}" 3000 3100 3200)}"
CLEANED_UP=0
INTERRUPTED=0

export DATABASE_URL="${DATABASE_URL:-postgres://iex:iex@localhost:${POSTGRES_PORT}/iex_cannes}"
export REDIS_URL="${REDIS_URL:-redis://localhost:${REDIS_PORT}}"
export BROKER_URL="${BROKER_URL:-http://localhost:${BROKER_PORT}}"
export VITE_DEV_PROXY_TARGET="${VITE_DEV_PROXY_TARGET:-${BROKER_URL}}"

if [[ "${BROKER_PORT}" != "3001" ]]; then
    echo -e "${YELLOW}Broker port 3001 is busy; using ${BROKER_PORT}.${NC}"
fi

if [[ "${WEB_PORT}" != "3000" ]]; then
    echo -e "${YELLOW}Web port 3000 is busy; using ${WEB_PORT}.${NC}"
fi

# Function to cleanup processes on exit
cleanup() {
    if [[ "${CLEANED_UP}" == "1" ]]; then
        return
    fi

    CLEANED_UP=1
    trap - EXIT INT SIGTERM

    echo ""
    echo -e "${YELLOW}Shutting down services...${NC}"
    
    if [ -n "$BROKER_PID" ]; then
        kill $BROKER_PID 2>/dev/null || true
        echo "  ✓ Broker stopped"
    fi
    
    if [ -n "$WEB_PID" ]; then
        kill $WEB_PID 2>/dev/null || true
        echo "  ✓ Web stopped"
    fi
    
    echo -e "${YELLOW}Infrastructure still running. Run 'make infra-down' to stop.${NC}"
}

handle_interrupt() {
    INTERRUPTED=1
    cleanup
}

trap cleanup EXIT
trap handle_interrupt INT SIGTERM

# Start infrastructure
echo -e "${YELLOW}Starting Docker infrastructure...${NC}"
POSTGRES_PORT="${POSTGRES_PORT}" REDIS_PORT="${REDIS_PORT}" "${COMPOSE_BIN}" up -d

# Wait for services to be ready
echo -e "${YELLOW}Waiting for Postgres and Redis...${NC}"
sleep 3

# Check if services are healthy
if ! "${COMPOSE_BIN}" ps | grep -q "healthy\|Up"; then
    echo -e "${RED}Warning: Docker services may not be fully ready yet${NC}"
fi

echo -e "${GREEN}✓ Infrastructure ready${NC}"
echo ""

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing dependencies...${NC}"
    corepack pnpm install
    echo -e "${GREEN}✓ Dependencies installed${NC}"
    echo ""
fi

# Ensure broker can auto-load the root .env via Bun's dotenv
BROKER_ENV_LINK="${ROOT_DIR}/apps/intelligence-exchange-cannes-broker/.env"
if [[ ! -e "${BROKER_ENV_LINK}" ]]; then
    ln -sf ../../.env "${BROKER_ENV_LINK}"
    echo -e "${GREEN}✓ Linked broker .env → root .env${NC}"
fi

# Start broker
echo -e "${YELLOW}Starting Broker API...${NC}"
echo -e "  ${BLUE}→ ${BROKER_URL}${NC}"
PORT="${BROKER_PORT}" DATABASE_URL="${DATABASE_URL}" REDIS_URL="${REDIS_URL}" BROKER_URL="${BROKER_URL}" \
    corepack pnpm --filter intelligence-exchange-cannes-broker dev &
BROKER_PID=$!

# Wait for broker to be ready
echo -e "${YELLOW}Waiting for broker to start...${NC}"
sleep 5

# Seed database
echo -e "${YELLOW}Seeding database...${NC}"
if DATABASE_URL="${DATABASE_URL}" REDIS_URL="${REDIS_URL}" BROKER_URL="${BROKER_URL}" \
    corepack pnpm --filter intelligence-exchange-cannes-broker seed 2>/dev/null; then
    echo -e "${GREEN}✓ Database seeded${NC}"
else
    echo -e "${YELLOW}Warning: Database seed may have already run${NC}"
fi
echo ""

# Start web
echo -e "${YELLOW}Starting Web App...${NC}"
echo -e "  ${BLUE}→ http://localhost:${WEB_PORT}${NC}"
BROKER_URL="${BROKER_URL}" VITE_DEV_PROXY_TARGET="${VITE_DEV_PROXY_TARGET}" \
    corepack pnpm --filter intelligence-exchange-cannes-web exec vite --host 0.0.0.0 --port "${WEB_PORT}" &
WEB_PID=$!

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                   All Services Running!                    ║${NC}"
echo -e "${GREEN}╠════════════════════════════════════════════════════════════╣${NC}"
printf "${GREEN}║  Web App:    %-44s║${NC}\n" "http://localhost:${WEB_PORT}"
printf "${GREEN}║  Broker API: %-44s║${NC}\n" "${BROKER_URL}"
printf "${GREEN}║  API Docs:   %-44s║${NC}\n" "${BROKER_URL}/docs"
echo -e "${GREEN}╠════════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║  Cloudflare tunnel (public HTTPS URL):                     ║${NC}"
printf "${GREEN}║    %-55s║${NC}\n" "make tunnel   (in a separate terminal)"
echo -e "${GREEN}╠════════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║  Press Ctrl+C to stop all services                        ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Keep script running
wait_status=0
wait || wait_status=$?

if [[ "${INTERRUPTED}" == "1" ]]; then
    exit 0
fi

exit "${wait_status}"
