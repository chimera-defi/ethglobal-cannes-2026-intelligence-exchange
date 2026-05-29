#!/bin/bash
set -e

# Get the repository root directory
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$REPO_ROOT"

echo "Stopping production services..."

# Stop the broker
if [ -f "infra/scripts/broker.pid" ]; then
	BROKER_PID=$(cat infra/scripts/broker.pid)
	echo "Stopping broker (PID: $BROKER_PID)..."
	kill $BROKER_PID 2>/dev/null || echo "Broker process already stopped"
	rm infra/scripts/broker.pid
	echo "Broker stopped"
else
	echo "Broker PID file not found, skipping..."
fi

# Stop Caddy
if [ -f "infra/scripts/caddy.pid" ]; then
	CADDY_PID=$(cat infra/scripts/caddy.pid)
	echo "Stopping Caddy (PID: $CADDY_PID)..."
	kill $CADDY_PID 2>/dev/null || echo "Caddy process already stopped"
	rm infra/scripts/caddy.pid
	echo "Caddy stopped"
else
	echo "Caddy PID file not found, skipping..."
fi

echo "Production services stopped successfully!"