#!/usr/bin/env bash
set -euo pipefail

if [[ "${CHAIN_MODE:-local}" == "fork" && -n "${FORK_RPC_URL:-}" ]]; then
  exec /root/.foundry/bin/anvil --chain-id "${CHAIN_ID:-31337}" --port "${CHAIN_PORT:-8545}" --block-time 1 --fork-url "${FORK_RPC_URL}"
fi

exec /root/.foundry/bin/anvil --chain-id "${CHAIN_ID:-31337}" --port "${CHAIN_PORT:-8545}" --block-time 1
