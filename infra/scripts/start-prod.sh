#!/bin/bash
set -e

# Get the repository root directory
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$REPO_ROOT"

echo "Starting production services..."

# Start the broker
echo "Starting broker on port 3100..."
cd apps/intelligence-exchange-cannes-broker
PORT=3100 bun src/index.ts &
BROKER_PID=$!
echo $BROKER_PID > "$REPO_ROOT/infra/scripts/broker.pid"
echo "Broker started with PID: $BROKER_PID"

# Start Caddy
echo "Starting Caddy..."
cd "$REPO_ROOT"
caddy run --config infra/caddy/Caddyfile &
CADDY_PID=$!
echo $CADDY_PID > "$REPO_ROOT/infra/scripts/caddy.pid"
echo "Caddy started with PID: $CADDY_PID"

echo "Production services started successfully!"
echo "Broker PID: $BROKER_PID"
echo "Caddy PID: $CADDY_PID"