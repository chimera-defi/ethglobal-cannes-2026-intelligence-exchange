#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
RPC_URL="${WORLDCHAIN_DEPLOY_RPC_URL:-${WORLDCHAIN_RPC_URL:-http://127.0.0.1:8545}}"

if [[ -z "${PRIVATE_KEY:-}" ]]; then
  echo "PRIVATE_KEY is required to deploy the Worldchain contracts." >&2
  exit 1
fi

cd "${PROJECT_DIR}"

echo "Deploying IdentityGate, AgentIdentityRegistry, and IdeaEscrow to ${RPC_URL}"
forge script script/Deploy.s.sol:Deploy --rpc-url "${RPC_URL}" --broadcast "$@"
