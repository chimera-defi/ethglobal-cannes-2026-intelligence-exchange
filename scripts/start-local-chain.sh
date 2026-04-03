#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_DIR="$ROOT_DIR/.runtime"
PID_FILE="$RUNTIME_DIR/anvil.pid"
LOG_FILE="$RUNTIME_DIR/anvil.log"
ANVIL_BIN="${ANVIL_BIN:-/root/.foundry/bin/anvil}"
HOST="${ANVIL_HOST:-127.0.0.1}"
PORT="${ANVIL_PORT:-8545}"

mkdir -p "$RUNTIME_DIR"

if [[ -f "$PID_FILE" ]]; then
  EXISTING_PID="$(cat "$PID_FILE")"
  if kill -0 "$EXISTING_PID" >/dev/null 2>&1; then
    echo "anvil already running on pid $EXISTING_PID"
    exit 0
  fi
  rm -f "$PID_FILE"
fi

if ! command -v "$ANVIL_BIN" >/dev/null 2>&1 && [[ ! -x "$ANVIL_BIN" ]]; then
  echo "anvil not found at $ANVIL_BIN" >&2
  exit 127
fi

setsid "$ANVIL_BIN" --host "$HOST" --port "$PORT" >"$LOG_FILE" 2>&1 < /dev/null &
echo $! >"$PID_FILE"

for _ in {1..30}; do
  if curl -s -X POST "http://$HOST:$PORT" \
    -H 'content-type: application/json' \
    --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' >/dev/null 2>&1; then
    echo "anvil ready on http://$HOST:$PORT"
    exit 0
  fi
  sleep 1
done

echo "anvil failed to start; see $LOG_FILE" >&2
exit 1
