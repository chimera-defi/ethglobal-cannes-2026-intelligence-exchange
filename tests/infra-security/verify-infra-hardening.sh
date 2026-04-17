#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_BIN="${ROOT_DIR}/scripts/tooling/docker-compose.sh"
COMPOSE_FILE="${ROOT_DIR}/docker-compose.yml"
REQUIRE_DOCKER="${REQUIRE_DOCKER:-0}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-iex-infra-security-test}"

POSTGRES_PORT="${POSTGRES_PORT:-55432}"
REDIS_PORT="${REDIS_PORT:-56379}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-iex_local_dev_only_change_me}"
REDIS_PASSWORD="${REDIS_PASSWORD:-iex_redis_local_dev_only_change_me}"

cleanup() {
  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME}" \
    POSTGRES_PORT="${POSTGRES_PORT}" \
    REDIS_PORT="${REDIS_PORT}" \
    POSTGRES_PASSWORD="${POSTGRES_PASSWORD}" \
    REDIS_PASSWORD="${REDIS_PASSWORD}" \
    "${COMPOSE_BIN}" -f "${COMPOSE_FILE}" down -v >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT

compose() {
  COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME}" \
  POSTGRES_PORT="${POSTGRES_PORT}" \
  REDIS_PORT="${REDIS_PORT}" \
  POSTGRES_PASSWORD="${POSTGRES_PASSWORD}" \
  REDIS_PASSWORD="${REDIS_PASSWORD}" \
  "${COMPOSE_BIN}" -f "${COMPOSE_FILE}" "$@"
}

assert_contains() {
  local needle="$1"
  local label="$2"
  if grep -Fq "${needle}" "${COMPOSE_FILE}"; then
    echo "PASS: ${label}"
  else
    echo "FAIL: ${label}"
    echo "  Missing pattern: ${needle}"
    return 1
  fi
}

assert_not_contains() {
  local needle="$1"
  local label="$2"
  if grep -Fq "${needle}" "${COMPOSE_FILE}"; then
    echo "FAIL: ${label}"
    echo "  Unexpected pattern: ${needle}"
    return 1
  else
    echo "PASS: ${label}"
  fi
}

echo "Running compose hardening policy checks..."
assert_contains "127.0.0.1:\${POSTGRES_PORT:-5432}:5432" "Postgres published only on loopback in compose source"
assert_contains "127.0.0.1:\${REDIS_PORT:-6379}:6379" "Redis published only on loopback in compose source"
assert_contains "redis-server --requirepass" "Redis started with requirepass"
assert_contains "redis-cli -a \"\$\$REDIS_PASSWORD\" ping" "Redis healthcheck authenticates"
assert_not_contains "'\${POSTGRES_PORT:-5432}:5432'" "Postgres not published without host IP prefix"
assert_not_contains "'\${REDIS_PORT:-6379}:6379'" "Redis not published without host IP prefix"

if ! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
  if [[ "${REQUIRE_DOCKER}" == "1" ]]; then
    echo "FAIL: Docker daemon unavailable and REQUIRE_DOCKER=1"
    exit 1
  fi
  echo "SKIP: Docker daemon unavailable, runtime container auth checks skipped."
  exit 0
fi

echo "Running runtime container auth checks..."
compose up -d

redis_ready=0
for _ in {1..30}; do
  if compose exec -T redis sh -lc 'redis-cli -a "$REDIS_PASSWORD" ping' 2>/dev/null | grep -Fq "PONG"; then
    redis_ready=1
    break
  fi
  sleep 1
done

if [[ "${redis_ready}" != "1" ]]; then
  echo "FAIL: Redis did not become ready for authenticated health checks"
  exit 1
fi

postgres_ready=0
for _ in {1..30}; do
  if compose exec -T postgres sh -lc 'PGPASSWORD="$POSTGRES_PASSWORD" pg_isready -h 127.0.0.1 -U iex -d iex_cannes' 2>/dev/null | grep -Fq "accepting connections"; then
    postgres_ready=1
    break
  fi
  sleep 1
done

if [[ "${postgres_ready}" != "1" ]]; then
  echo "FAIL: Postgres did not become ready for authenticated checks"
  exit 1
fi

redis_noauth_output="$(compose exec -T redis sh -lc 'redis-cli ping' 2>&1 || true)"
if grep -Fq "NOAUTH" <<< "${redis_noauth_output}"; then
  echo "PASS: Redis rejects unauthenticated requests"
else
  echo "FAIL: Redis accepted unauthenticated request"
  echo "${redis_noauth_output}"
  exit 1
fi

redis_auth_output="$(compose exec -T redis sh -lc 'redis-cli -a "$REDIS_PASSWORD" ping' 2>&1 || true)"
if grep -Fq "PONG" <<< "${redis_auth_output}"; then
  echo "PASS: Redis accepts authenticated requests"
else
  echo "FAIL: Redis authenticated ping did not return PONG"
  echo "${redis_auth_output}"
  exit 1
fi

postgres_wrong_output="$(compose exec -T postgres sh -lc 'PGPASSWORD=wrong-password psql -h 127.0.0.1 -U iex -d iex_cannes -tAc \"select 1\"' 2>&1 || true)"
if grep -Fq "password authentication failed" <<< "${postgres_wrong_output}"; then
  echo "PASS: Postgres rejects incorrect password"
else
  echo "FAIL: Postgres did not reject incorrect password as expected"
  echo "${postgres_wrong_output}"
  exit 1
fi

postgres_ok_output="$(compose exec -T postgres sh -lc 'PGPASSWORD=\"$POSTGRES_PASSWORD\" psql -h 127.0.0.1 -U iex -d iex_cannes -tAc \"select 1\"' 2>&1 || true)"
if grep -Eq '(^|[[:space:]])1($|[[:space:]])' <<< "${postgres_ok_output}"; then
  echo "PASS: Postgres accepts correct password"
else
  echo "FAIL: Postgres correct-password query did not return 1"
  echo "${postgres_ok_output}"
  exit 1
fi

redis_port_binding="$(compose port redis 6379 | tail -n1)"
postgres_port_binding="$(compose port postgres 5432 | tail -n1)"

if [[ "${redis_port_binding}" == 127.0.0.1:* ]]; then
  echo "PASS: Redis runtime port binding is loopback"
else
  echo "FAIL: Redis runtime port binding is not loopback: ${redis_port_binding}"
  exit 1
fi

if [[ "${postgres_port_binding}" == 127.0.0.1:* ]]; then
  echo "PASS: Postgres runtime port binding is loopback"
else
  echo "FAIL: Postgres runtime port binding is not loopback: ${postgres_port_binding}"
  exit 1
fi

echo "All infra hardening checks passed."
