#!/usr/bin/env bash
set -euo pipefail

if [[ $# -eq 0 ]]; then
  echo "Usage: $0 <test command...>" >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE="${ROOT_DIR}/scripts/tooling/docker-compose.sh"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
REDIS_PORT="${REDIS_PORT:-6379}"

started_here=0

running_services="$(
  POSTGRES_PORT="${POSTGRES_PORT}" REDIS_PORT="${REDIS_PORT}" "${COMPOSE}" ps --status running --services 2>/dev/null || true
)"

cleanup() {
  if [[ "${started_here}" -eq 1 ]]; then
    POSTGRES_PORT="${POSTGRES_PORT}" REDIS_PORT="${REDIS_PORT}" "${COMPOSE}" down --remove-orphans >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT

if [[ -z "${running_services}" ]]; then
  POSTGRES_PORT="${POSTGRES_PORT}" REDIS_PORT="${REDIS_PORT}" "${COMPOSE}" up -d
  started_here=1
  sleep 3
fi

"$@"
