#!/usr/bin/env bash
# Bring up the full IEX stack (broker + web) for demo/dev/testing.
# Usage: ./infra/scripts/server-up.sh [--caddy] [--build]
#   --caddy   Also start Caddy reverse proxy (requires Caddy installed)
#   --build   Run `bun build` for the broker before starting
#
# PID files: /tmp/iex-broker.pid, /tmp/iex-web.pid
# Logs:      /tmp/iex-broker.log, /tmp/iex-web.log
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BROKER_DIR="$REPO_ROOT/apps/intelligence-exchange-cannes-broker"
WEB_DIR="$REPO_ROOT/apps/intelligence-exchange-cannes-web"

BROKER_PID_FILE="/tmp/iex-broker.pid"
WEB_PID_FILE="/tmp/iex-web.pid"
BROKER_LOG="/tmp/iex-broker.log"
WEB_LOG="/tmp/iex-web.log"

START_CADDY=false
DO_BUILD=false

for arg in "$@"; do
  case "$arg" in
    --caddy) START_CADDY=true ;;
    --build) DO_BUILD=true ;;
    *) echo "Unknown option: $arg"; exit 1 ;;
  esac
done

RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'; NC='\033[0m'
info()    { echo -e "${GREEN}[iex-up]${NC} $*"; }
warn()    { echo -e "${YELLOW}[iex-up:warn]${NC} $*"; }
error()   { echo -e "${RED}[iex-up:error]${NC} $*" >&2; }

# ── 1. Prerequisite checks ──────────────────────────────────────────────────
info "Checking prerequisites..."

check_cmd() {
  if ! command -v "$1" &>/dev/null; then
    error "Required command not found: $1 — install it and retry."
    exit 1
  fi
}

check_cmd node
check_cmd bun

# Postgres
if ! pg_isready -q 2>/dev/null; then
  warn "pg_isready check failed — Postgres may not be running."
  warn "  Start with: sudo systemctl start postgresql"
  warn "  Or: sudo service postgresql start"
fi

# Redis
if ! redis-cli ping &>/dev/null 2>&1; then
  warn "redis-cli ping failed — Redis may not be running."
  warn "  Start with: sudo systemctl start redis"
  warn "  Or: sudo service redis-server start"
fi

# ── 2. Environment setup ────────────────────────────────────────────────────
if [[ ! -f "$BROKER_DIR/.env" ]]; then
  if [[ -f "$BROKER_DIR/.env.example" ]]; then
    warn ".env not found — copying from .env.example"
    cp "$BROKER_DIR/.env.example" "$BROKER_DIR/.env"
    warn "Edit $BROKER_DIR/.env and fill in secrets before running in production."
  else
    error ".env.example not found in $BROKER_DIR — cannot create .env automatically."
    exit 1
  fi
fi

# ── 3. Build broker (optional) ──────────────────────────────────────────────
if [[ "$DO_BUILD" == "true" ]]; then
  info "Building broker..."
  cd "$BROKER_DIR"
  bun build src/index.ts --outdir dist --target bun
  cd "$REPO_ROOT"
fi

# ── 4. Kill any existing processes ─────────────────────────────────────────
kill_pid_file() {
  local pidfile="$1"
  if [[ -f "$pidfile" ]]; then
    local pid
    pid="$(cat "$pidfile")"
    if kill -0 "$pid" 2>/dev/null; then
      info "Stopping existing process PID=$pid..."
      kill "$pid" 2>/dev/null || true
      sleep 1
    fi
    rm -f "$pidfile"
  fi
}
kill_pid_file "$BROKER_PID_FILE"
kill_pid_file "$WEB_PID_FILE"

# ── 5. Run database migrations ──────────────────────────────────────────────
info "Running database migrations..."
cd "$BROKER_DIR"
bun run src/db/migrate.ts
cd "$REPO_ROOT"

# ── 6. Start broker ──────────────────────────────────────────────────────────
info "Starting broker..."
cd "$BROKER_DIR"
# shellcheck disable=SC2094
nohup bun run src/index.ts > "$BROKER_LOG" 2>&1 &
BROKER_PID=$!
echo "$BROKER_PID" > "$BROKER_PID_FILE"
info "Broker PID=$BROKER_PID → log: $BROKER_LOG"
cd "$REPO_ROOT"

# ── 7. Start web dev server ──────────────────────────────────────────────────
info "Starting web dev server..."
cd "$WEB_DIR"
# shellcheck disable=SC2094
nohup bun run dev > "$WEB_LOG" 2>&1 &
WEB_PID=$!
echo "$WEB_PID" > "$WEB_PID_FILE"
info "Web PID=$WEB_PID → log: $WEB_LOG"
cd "$REPO_ROOT"

# ── 8. Optionally start Caddy ────────────────────────────────────────────────
if [[ "$START_CADDY" == "true" ]]; then
  if ! command -v caddy &>/dev/null; then
    error "Caddy not found. Install with: sudo apt-get install caddy"
    error "See also: infra/scripts/deploy-caddy.sh"
    exit 1
  fi
  CADDYFILE="$REPO_ROOT/infra/caddy/Caddyfile"
  info "Starting Caddy with $CADDYFILE..."
  sudo caddy start --config "$CADDYFILE" || sudo caddy reload --config "$CADDYFILE"
  info "Caddy running."
fi

# ── 9. Summary ───────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN} Stack up${NC}"
echo "  Broker → http://localhost:3001"
echo "  Web    → http://localhost:3100"
if [[ "$START_CADDY" == "true" ]]; then
  echo "  Caddy  → http://$(hostname -I | awk '{print $1}')"
fi
echo ""
echo "  Logs:  tail -f $BROKER_LOG $WEB_LOG"
echo "  Stop:  ./infra/scripts/server-down.sh"
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
