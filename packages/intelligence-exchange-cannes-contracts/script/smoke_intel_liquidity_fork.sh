#!/usr/bin/env bash
set -euo pipefail

HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-8545}"
RPC_URLS_CSV="${MAINNET_RPC_URLS:-${MAINNET_RPC_URL:-https://ethereum.publicnode.com,https://eth.merkle.io,https://eth.llamarpc.com}}"
FORK_BLOCK_NUMBER="${FORK_BLOCK_NUMBER:-}"
ANVIL_LOG="${ANVIL_LOG:-/tmp/intel-mainnet-fork-anvil.log}"
DEPLOY_LOG="${DEPLOY_LOG:-/tmp/intel-mainnet-fork-deploy.log}"
DEFAULT_ANVIL_PRIVATE_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
PRIVATE_KEY="${PRIVATE_KEY:-${DEFAULT_ANVIL_PRIVATE_KEY}}"

ANVIL_PID=""

cleanup() {
  if [[ -n "${ANVIL_PID}" ]] && kill -0 "${ANVIL_PID}" >/dev/null 2>&1; then
    kill "${ANVIL_PID}" >/dev/null 2>&1 || true
    wait "${ANVIL_PID}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

start_fork() {
  IFS=',' read -r -a rpc_candidates <<<"${RPC_URLS_CSV}"
  for rpc in "${rpc_candidates[@]}"; do
    rpc="$(echo "${rpc}" | xargs)"
    [[ -z "${rpc}" ]] && continue

    local cmd=(anvil --fork-url "${rpc}" --chain-id 1 --host "${HOST}" --port "${PORT}")
    if [[ -n "${FORK_BLOCK_NUMBER}" ]]; then
      cmd+=(--fork-block-number "${FORK_BLOCK_NUMBER}")
    fi

    echo "Starting Ethereum mainnet fork on http://${HOST}:${PORT} (upstream: ${rpc})"
    "${cmd[@]}" >"${ANVIL_LOG}" 2>&1 &
    ANVIL_PID=$!

    for _ in $(seq 1 20); do
      if cast chain-id --rpc-url "http://${HOST}:${PORT}" >/dev/null 2>&1; then
        return 0
      fi
      if ! kill -0 "${ANVIL_PID}" >/dev/null 2>&1; then
        break
      fi
      sleep 1
    done

    if kill -0 "${ANVIL_PID}" >/dev/null 2>&1; then
      kill "${ANVIL_PID}" >/dev/null 2>&1 || true
      wait "${ANVIL_PID}" >/dev/null 2>&1 || true
    fi
    ANVIL_PID=""
    echo "Upstream RPC failed: ${rpc}"
    cat "${ANVIL_LOG}"
  done

  echo "Failed to start anvil fork with all configured upstream RPCs."
  exit 1
}

deploy_liquidity() {
  local rpc_url="http://${HOST}:${PORT}"
  echo "Deploying INTEL and seeding Uniswap V2 WETH/INTEL liquidity..."
  MAINNET_FORK_RPC_URL="${rpc_url}" PRIVATE_KEY="${PRIVATE_KEY}" \
    forge script script/DeployIntelLiquidityOnFork.s.sol --rpc-url "${rpc_url}" --broadcast >"${DEPLOY_LOG}" 2>&1
  cat "${DEPLOY_LOG}"
}

verify_pool() {
  INTEL_TOKEN_ADDRESS="$(sed -n 's/.*INTEL_TOKEN_ADDRESS= *\(0x[0-9a-fA-F]\{40\}\).*/\1/p' "${DEPLOY_LOG}" | tail -n 1)"
  INTEL_WETH_PAIR_ADDRESS="$(sed -n 's/.*INTEL_WETH_PAIR_ADDRESS= *\(0x[0-9a-fA-F]\{40\}\).*/\1/p' "${DEPLOY_LOG}" | tail -n 1)"

  if [[ -z "${INTEL_WETH_PAIR_ADDRESS:-}" || "${INTEL_WETH_PAIR_ADDRESS}" == "0x0000000000000000000000000000000000000000" ]]; then
    echo "INTEL_WETH_PAIR_ADDRESS missing or zero."
    exit 1
  fi

  local reserves
  reserves="$(cast call "${INTEL_WETH_PAIR_ADDRESS}" "getReserves()(uint112,uint112,uint32)" --rpc-url "http://${HOST}:${PORT}")"
  echo "Pair reserves: ${reserves}"

  if grep -q " 0, 0" <<<"${reserves}" || grep -q "(0, 0" <<<"${reserves}"; then
    echo "Liquidity reserves are zero; expected non-zero reserves."
    exit 1
  fi

  echo "Fork liquidity smoke test passed."
  echo "INTEL token: ${INTEL_TOKEN_ADDRESS}"
  echo "INTEL/WETH pair: ${INTEL_WETH_PAIR_ADDRESS}"
}

start_fork
deploy_liquidity
verify_pool
