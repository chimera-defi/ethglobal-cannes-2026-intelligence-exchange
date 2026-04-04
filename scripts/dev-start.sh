#!/bin/bash
#
# Development Startup Script
# Starts the full Intelligence Exchange stack for local development
#

set -e

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
echo -e "${GREEN}✓ Prerequisites OK${NC}"
echo ""

# Environment setup
export DATABASE_URL="${DATABASE_URL:-postgres://iex:iex@localhost:5432/iex_cannes}"
export REDIS_URL="${REDIS_URL:-redis://localhost:6379}"
export BROKER_URL="${BROKER_URL:-http://localhost:3001}"

# Function to cleanup processes on exit
cleanup() {
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
    exit 0
}

trap cleanup SIGINT SIGTERM EXIT

# Start infrastructure
echo -e "${YELLOW}Starting Docker infrastructure...${NC}"
docker compose up -d

# Wait for services to be ready
echo -e "${YELLOW}Waiting for Postgres and Redis...${NC}"
sleep 3

# Check if services are healthy
if ! docker compose ps | grep -q "healthy\|Up"; then
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

# Start broker
echo -e "${YELLOW}Starting Broker API...${NC}"
echo -e "  ${BLUE}→ http://localhost:3001${NC}"
corepack pnpm --filter intelligence-exchange-cannes-broker dev &
BROKER_PID=$!

# Wait for broker to be ready
echo -e "${YELLOW}Waiting for broker to start...${NC}"
sleep 5

# Seed database
echo -e "${YELLOW}Seeding database...${NC}"
if corepack pnpm --filter intelligence-exchange-cannes-broker seed 2>/dev/null; then
    echo -e "${GREEN}✓ Database seeded${NC}"
else
    echo -e "${YELLOW}Warning: Database seed may have already run${NC}"
fi
echo ""

# Start web
echo -e "${YELLOW}Starting Web App...${NC}"
echo -e "  ${BLUE}→ http://localhost:3000${NC}"
corepack pnpm --filter intelligence-exchange-cannes-web dev &
WEB_PID=$!

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                   All Services Running!                    ║${NC}"
echo -e "${GREEN}╠════════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║  Web App:    http://localhost:3000                        ║${NC}"
echo -e "${GREEN}║  Broker API: http://localhost:3001                        ║${NC}"
echo -e "${GREEN}║  API Docs:   http://localhost:3001/docs                   ║${NC}"
echo -e "${GREEN}╠════════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║  Press Ctrl+C to stop all services                        ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Keep script running
wait
