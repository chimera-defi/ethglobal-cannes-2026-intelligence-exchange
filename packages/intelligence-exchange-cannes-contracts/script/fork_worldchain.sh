#!/usr/bin/env bash
set -euo pipefail

RPC_URL="${WORLDCHAIN_RPC_URL:-https://worldchain-mainnet.g.alchemy.com/public}"
CHAIN_ID="${WORLDCHAIN_CHAIN_ID:-480}"
PORT="${PORT:-8545}"
HOST="${HOST:-127.0.0.1}"

echo "Starting Worldchain fork on ${HOST}:${PORT} from ${RPC_URL}"
anvil --fork-url "${RPC_URL}" --chain-id "${CHAIN_ID}" --host "${HOST}" --port "${PORT}"
