#!/bin/bash

# Security Monitor Script
# Monitors circuit breakers and broker health, alerts on anomalies

set -e

# Configuration
BROKER_URL="${BROKER_URL:-http://localhost:3100}"
ADMIN_API_KEY="${ADMIN_API_KEY:-}"
CHECK_INTERVAL="${CHECK_INTERVAL:-30}" # seconds

# Colors for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_alert() {
    echo -e "${RED}[SECURITY ALERT]${NC} $(date -Iseconds) - $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $(date -Iseconds) - $1"
}

log_info() {
    echo "[INFO] $(date -Iseconds) - $1"
}

check_broker_health() {
    local health_url="${BROKER_URL}/health"
    local response
    response=$(curl -s -o /dev/null -w "%{http_code}" "$health_url" || echo "000")
    
    if [ "$response" != "200" ]; then
        log_alert "Broker health check failed: HTTP $response"
        return 1
    fi
    return 0
}

check_circuit_breakers() {
    if [ -z "$ADMIN_API_KEY" ]; then
        log_warning "ADMIN_API_KEY not set, skipping circuit breaker check"
        return 0
    fi

    local breakers_url="${BROKER_URL}/v1/cannes/admin/circuit-breakers"
    local response
    response=$(curl -s -H "Authorization: Bearer $ADMIN_API_KEY" "$breakers_url" 2>/dev/null || echo "{}")
    
    # Check if any breaker is open
    local open_breakers
    open_breakers=$(echo "$response" | jq -r '.breakers | to_entries[] | select(.value.isOpen == true) | .key' 2>/dev/null || echo "")
    
    if [ -n "$open_breakers" ]; then
        log_alert "Circuit breaker(s) tripped: $open_breakers"
        echo "$response" | jq '.'
        return 1
    fi
    
    # Check accept rate for anomalies
    local accept_rate
    accept_rate=$(echo "$response" | jq -r '.breakers.accept.acceptCount // 0' 2>/dev/null || echo "0")
    local error_rate
    error_rate=$(echo "$response" | jq -r '.breakers.accept | (.errorCount / .requestCount * 100) // 0' 2>/dev/null || echo "0")
    
    if [ "$accept_rate" -gt 15 ]; then
        log_warning "High accept rate detected: $accept_rate/min (threshold: 20/min)"
    fi
    
    if (( $(echo "$error_rate > 30" | bc -l 2>/dev/null || echo "0") )); then
        log_warning "Elevated error rate detected: $error_rate% (threshold: 50%)"
    fi
    
    return 0
}

main() {
    log_info "Starting security monitor for broker at $BROKER_URL"
    log_info "Check interval: ${CHECK_INTERVAL}s"
    
    if [ -z "$ADMIN_API_KEY" ]; then
        log_warning "ADMIN_API_KEY not set - circuit breaker monitoring disabled"
    fi
    
    while true; do
        check_broker_health || true
        check_circuit_breakers || true
        sleep "$CHECK_INTERVAL"
    done
}

# Run main function
main "$@"