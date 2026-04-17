#!/usr/bin/env bash
set -euo pipefail

if [[ "$#" -eq 0 ]]; then
  echo "Usage: $0 <command> [args...]"
  exit 64
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_BIN="${ROOT_DIR}/scripts/tooling/docker-compose.sh"
COMPOSE_FILE="${ROOT_DIR}/docker-compose.yml"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-iex-test-run}"

POSTGRES_PORT="${POSTGRES_PORT:-5432}"
REDIS_PORT="${REDIS_PORT:-6379}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-iex_local_dev_only_change_me}"
REDIS_PASSWORD="${REDIS_PASSWORD:-iex_redis_local_dev_only_change_me}"

compose() {
  COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME}" \
  POSTGRES_PORT="${POSTGRES_PORT}" \
  REDIS_PORT="${REDIS_PORT}" \
  POSTGRES_PASSWORD="${POSTGRES_PASSWORD}" \
  REDIS_PASSWORD="${REDIS_PASSWORD}" \
  "${COMPOSE_BIN}" -f "${COMPOSE_FILE}" "$@"
}

cleanup() {
  if [[ "${TEST_INFRA_KEEP_RUNNING:-0}" == "1" ]]; then
    echo "Skipping infra teardown because TEST_INFRA_KEEP_RUNNING=1"
    return
  fi

  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    compose down --remove-orphans >/dev/null 2>&1 || true
    echo "Infra teardown complete."
  fi
}

trap cleanup EXIT INT TERM

echo "Starting test infra (${COMPOSE_PROJECT_NAME})..."
compose up -d

echo "Waiting for containers to initialize..."
sleep 3

"$@"
