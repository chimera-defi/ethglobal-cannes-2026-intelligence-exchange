#!/usr/bin/env bash
set -euo pipefail

for _ in $(seq 1 30); do
  if docker-compose exec -T postgres pg_isready -U iex -d iex_cannes >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

docker-compose exec -T postgres pg_isready -U iex -d iex_cannes >/dev/null

for _ in $(seq 1 30); do
  if docker-compose exec -T redis redis-cli ping >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

docker-compose exec -T redis redis-cli ping >/dev/null
