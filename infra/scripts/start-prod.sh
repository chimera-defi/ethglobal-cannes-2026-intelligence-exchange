#!/bin/bash
set -e

# Get the repository root directory
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$REPO_ROOT"

# Check for --build flag
BUILD_FLAG=""
if [ "$1" = "--build" ]; then
    BUILD_FLAG="--build"
fi

echo "Starting production services..."

# Build the web app if dist/ is older than src/ or --build flag passed
WEB_APP_DIR="apps/intelligence-exchange-cannes-web"
if [ -d "$WEB_APP_DIR" ]; then
    echo "检查 web 应用构建状态..."
    if [ "$BUILD_FLAG" = "--build" ] || [ "$WEB_APP_DIR/dist" -ot "$WEB_APP_DIR/src" ] || [ ! -d "$WEB_APP_DIR/dist" ]; then
        echo "构建 web 应用..."
        cd "$WEB_APP_DIR"
        bun run build
        cd "$REPO_ROOT"
        echo "Web 应用构建完成"
    else
        echo "Web 应用已是最新构建，跳过"
    fi
fi

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

# Start health-watch daemon
echo "Starting health-watch daemon..."
nohup "$REPO_ROOT/infra/scripts/health-watch.sh" > /var/log/assay-health.log 2>&1 &
HEALTH_PID=$!
echo $HEALTH_PID > "$REPO_ROOT/infra/scripts/health-watch.pid"
echo "Health-watch daemon started with PID: $HEALTH_PID"

# Save all PIDs to /tmp/assay-pids.txt
echo "$BROKER_PID" > /tmp/assay-pids.txt
echo "$CADDY_PID" >> /tmp/assay-pids.txt
echo "$HEALTH_PID" >> /tmp/assay-pids.txt

echo "Production services started successfully!"
echo "Broker PID: $BROKER_PID"
echo "Caddy PID: $CADDY_PID"
echo "Health-watch PID: $HEALTH_PID"
echo "所有 PID 已保存到 /tmp/assay-pids.txt"