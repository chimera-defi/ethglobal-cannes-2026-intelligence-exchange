#!/usr/bin/env bash
set -euo pipefail

if [[ "$#" -lt 1 ]]; then
  echo "pick-port.sh requires at least one candidate port." >&2
  exit 1
fi

port_in_use() {
  local port="$1"

  if command -v ss >/dev/null 2>&1; then
    ss -H -ltn "sport = :${port}" | grep -q .
    return
  fi

  if command -v lsof >/dev/null 2>&1; then
    lsof -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1
    return
  fi

  return 1
}

for port in "$@"; do
  if ! port_in_use "${port}"; then
    echo "${port}"
    exit 0
  fi
done

echo "No free port found in candidate set: $*" >&2
exit 1
