#!/bin/bash
set -e

echo "=== 紧急停止脚本 ==="
echo "时间: $(date '+%Y-%m-%d %H:%M:%S')"

# Kill broker
echo "停止 broker..."
BROKER_PIDS=$(pgrep -f "bun src/index.ts" || true)
if [ -n "$BROKER_PIDS" ]; then
    echo "杀死的 broker PID: $BROKER_PIDS"
    pkill -f "bun src/index.ts" || true
else
    echo "没有运行中的 broker 进程"
fi

# Kill Caddy
echo "停止 Caddy..."
CADDY_PIDS=$(pgrep -f caddy || true)
if [ -n "$CADDY_PIDS" ]; then
    echo "杀死的 Caddy PID: $CADDY_PIDS"
    pkill -f caddy || true
else
    echo "没有运行中的 Caddy 进程"
fi

# Kill Vite dev servers
echo "停止 Vite 开发服务器..."
VITE_PIDS=$(pgrep -f "vite" || true)
if [ -n "$VITE_PIDS" ]; then
    echo "杀死的 Vite PID: $VITE_PIDS"
    pkill -f vite || true
else
    echo "没有运行中的 Vite 进程"
fi

# Kill health-watch daemon
echo "停止健康监控守护进程..."
HEALTH_PIDS=$(pgrep -f "health-watch.sh" || true)
if [ -n "$HEALTH_PIDS" ]; then
    echo "杀死的 health-watch PID: $HEALTH_PIDS"
    pkill -f "health-watch.sh" || true
else
    echo "没有运行中的 health-watch 进程"
fi

echo "=== 紧急停止完成 ==="
echo "时间: $(date '+%Y-%m-%d %H:%M:%S')"