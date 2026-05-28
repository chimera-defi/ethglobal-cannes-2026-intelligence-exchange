#!/usr/bin/env bash
# Tear down the full IEX stack (broker + web, optionally Caddy).
# Usage: ./infra/scripts/server-down.sh [--caddy]
#   --caddy   Also stop Caddy reverse proxy
set -euo pipefail

BROKER_PID_FILE="/tmp/iex-broker.pid"
WEB_PID_FILE="/tmp/iex-web.pid"

STOP_CADDY=false
for arg in "$@"; do
  case "$arg" in
    --caddy) STOP_CADDY=true ;;
    *) echo "Unknown option: $arg"; exit 1 ;;
  esac
done

RED='\033[0;31m'; GREEN='\033[0;32m'; NC='\033[0m'
info()  { echo -e "${GREEN}[iex-down]${NC} $*"; }
error() { echo -e "${RED}[iex-down:error]${NC} $*" >&2; }

kill_pid_file() {
  local label="$1"
  local pidfile="$2"
  if [[ -f "$pidfile" ]]; then
    local pid
    pid="$(cat "$pidfile")"
    if kill -0 "$pid" 2>/dev/null; then
      info "Stopping $label (PID=$pid)..."
      kill "$pid" 2>/dev/null || true
      # Give it a moment; escalate to SIGKILL if needed
      sleep 1
      if kill -0 "$pid" 2>/dev/null; then
        info "Sending SIGKILL to $label (PID=$pid)..."
        kill -9 "$pid" 2>/dev/null || true
      fi
      info "$label stopped."
    else
      info "$label (PID=$pid) is not running — cleaning up stale PID file."
    fi
    rm -f "$pidfile"
  else
    info "No PID file for $label ($pidfile) — may already be down."
  fi
}

kill_pid_file "broker" "$BROKER_PID_FILE"
kill_pid_file "web" "$WEB_PID_FILE"

if [[ "$STOP_CADDY" == "true" ]]; then
  if command -v caddy &>/dev/null; then
    info "Stopping Caddy..."
    sudo caddy stop 2>/dev/null || true
    info "Caddy stopped."
  else
    error "Caddy not found on PATH."
  fi
fi

info "Stack down."
