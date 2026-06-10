#!/bin/bash
set -e

# Get the repository root directory
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$REPO_ROOT"

echo "Starting production services..."

# Start the broker
echo "Starting broker on port 3100..."
if systemctl is-active assay-broker 2>/dev/null; then
    echo "Using systemd to start broker..."
    sudo systemctl start assay-broker
    BROKER_PID="systemd"
else
    echo "Starting broker directly..."
    cd apps/intelligence-exchange-cannes-broker
    PORT=3100 bun src/index.ts &
    BROKER_PID=$!
    echo $BROKER_PID > "$REPO_ROOT/infra/scripts/broker.pid"
    echo "Broker started with PID: $BROKER_PID"
fi

# Start Caddy
echo "Starting Caddy..."
if systemctl is-active assay-caddy 2>/dev/null; then
    echo "Using systemd to start Caddy..."
    sudo systemctl start assay-caddy
    CADDY_PID="systemd"
else
    echo "Starting Caddy directly..."
    cd "$REPO_ROOT"
    caddy run --config infra/caddy/Caddyfile &
    CADDY_PID=$!
    echo $CADDY_PID > "$REPO_ROOT/infra/scripts/caddy.pid"
    echo "Caddy started with PID: $CADDY_PID"
fi

# Start health-watch daemon
echo "Starting health-watch daemon..."
nohup "$REPO_ROOT/infra/scripts/health-watch.sh" > /var/log/assay-health.log 2>&1 &
HEALTH_PID=$!
echo $HEALTH_PID > "$REPO_ROOT/infra/scripts/health-watch.pid"
echo "Health-watch daemon started with PID: $HEALTH_PID"

# Save all PIDs to /tmp/assay-pids.txt (only if not systemd)
if [ "$BROKER_PID" != "systemd" ] && [ "$CADDY_PID" != "systemd" ]; then
    echo "$BROKER_PID" > /tmp/assay-pids.txt
    echo "$CADDY_PID" >> /tmp/assay-pids.txt
    echo "$HEALTH_PID" >> /tmp/assay-pids.txt
fi

echo "Production services started successfully!"
if [ "$BROKER_PID" = "systemd" ]; then
    echo "Broker: managed by systemd"
else
    echo "Broker PID: $BROKER_PID"
fi

if [ "$CADDY_PID" = "systemd" ]; then
    echo "Caddy: managed by systemd"
else
    echo "Caddy PID: $CADDY_PID"
fi

echo "Health-watch PID: $HEALTH_PID"
if [ "$BROKER_PID" != "systemd" ] && [ "$CADDY_PID" != "systemd" ]; then
    echo "所有 PID 已保存到 /tmp/assay-pids.txt"
fi