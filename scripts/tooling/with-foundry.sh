#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FOUNDRY_DIR="${FOUNDRY_DIR:-$HOME/.foundry}"
FOUNDRY_BIN_DIR="${FOUNDRY_BIN_DIR:-$FOUNDRY_DIR/bin}"

"${SCRIPT_DIR}/ensure-foundry.sh"
export PATH="${FOUNDRY_BIN_DIR}:${PATH}"

if [[ "$#" -eq 0 ]]; then
  echo "with-foundry.sh requires a command to run." >&2
  exit 1
fi

exec "$@"
