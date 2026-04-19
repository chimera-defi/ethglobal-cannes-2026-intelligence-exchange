#!/usr/bin/env bash
set -euo pipefail

RPC_URL="${MAINNET_RPC_URL:-https://ethereum.publicnode.com}"
CHAIN_ID="${CHAIN_ID:-1}"
PORT="${PORT:-8545}"
HOST="${HOST:-127.0.0.1}"
FORK_BLOCK_NUMBER="${FORK_BLOCK_NUMBER:-}"

echo "Starting Ethereum mainnet fork on ${HOST}:${PORT} from ${RPC_URL}"
if [[ -n "${FORK_BLOCK_NUMBER}" ]]; then
  echo "Pinning fork block: ${FORK_BLOCK_NUMBER}"
  anvil --fork-url "${RPC_URL}" --fork-block-number "${FORK_BLOCK_NUMBER}" --chain-id "${CHAIN_ID}" --host "${HOST}" --port "${PORT}"
else
  anvil --fork-url "${RPC_URL}" --chain-id "${CHAIN_ID}" --host "${HOST}" --port "${PORT}"
fi
