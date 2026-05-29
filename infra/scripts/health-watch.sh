#!/bin/bash
set -e

LOG_FILE="/var/log/assay-health.log"
BROKER_URL="http://localhost:3100/health"
BROKER_FAILURE_COUNT=0
MAX_BROKER_FAILURES=3

# Ensure log directory exists
mkdir -p "$(dirname "$LOG_FILE")"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

check_broker() {
    if curl -sf "$BROKER_URL" > /dev/null 2>&1; then
        BROKER_FAILURE_COUNT=0
        return 0
    else
        BROKER_FAILURE_COUNT=$((BROKER_FAILURE_COUNT + 1))
        log "BROKER健康检查失败 (失败次数: $BROKER_FAILURE_COUNT/$MAX_BROKER_FAILURES)"
        return 1
    fi
}

check_postgres() {
    if pg_isready -h 127.0.0.1 -p 5432 > /dev/null 2>&1; then
        return 0
    else
        log "POSTGRES健康检查失败"
        return 1
    fi
}

check_redis() {
    if redis-cli ping > /dev/null 2>&1; then
        return 0
    else
        log "REDIS健康检查失败"
        return 1
    fi
}

log "健康监控守护进程启动"

while true; do
    check_broker || true
    check_postgres || true
    check_redis || true

    # If broker fails 3 times in a row, kill Caddy to take front-door offline
    if [ "$BROKER_FAILURE_COUNT" -ge "$MAX_BROKER_FAILURES" ]; then
        log " broker连续失败 $MAX_BROKER_FAILURES 次，关闭前端入口 (Caddy)"
        pkill -f caddy || true
        BROKER_FAILURE_COUNT=0
    fi

    sleep 30
done