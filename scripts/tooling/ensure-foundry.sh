#!/usr/bin/env bash
set -euo pipefail

FOUNDRY_DIR="${FOUNDRY_DIR:-$HOME/.foundry}"
FOUNDRY_BIN_DIR="${FOUNDRY_BIN_DIR:-$FOUNDRY_DIR/bin}"

if [[ -x "${FOUNDRY_BIN_DIR}/forge" && -x "${FOUNDRY_BIN_DIR}/anvil" && -x "${FOUNDRY_BIN_DIR}/cast" ]]; then
  exit 0
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required to install Foundry." >&2
  exit 1
fi

mkdir -p "${FOUNDRY_BIN_DIR}"

if [[ ! -x "${FOUNDRY_BIN_DIR}/foundryup" ]]; then
  curl -L https://foundry.paradigm.xyz | bash
fi

"${FOUNDRY_BIN_DIR}/foundryup"

for tool in forge anvil cast; do
  if [[ ! -x "${FOUNDRY_BIN_DIR}/${tool}" ]]; then
    echo "Expected ${tool} in ${FOUNDRY_BIN_DIR} after Foundry install." >&2
    exit 1
  fi
done
