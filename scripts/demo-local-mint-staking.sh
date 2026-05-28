#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# demo-local-mint-staking.sh
# Demonstrates the full INTEL mint → staking → ETH yield → claim flow on a
# local Anvil node. Run `anvil` in another terminal first.
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTRACTS_DIR="$REPO_ROOT/packages/intelligence-exchange-cannes-contracts"
FORGE="${FORGE_BIN:-$HOME/.foundry/bin/forge}"
CAST="${CAST_BIN:-$HOME/.foundry/bin/cast}"

ANVIL_RPC="${ANVIL_RPC:-http://127.0.0.1:8545}"

# Anvil default account #0
PRIVATE_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
DEPLOYER="0xf39Fd6e51aad88F6f4ce6aB8827279cffFb92266"
# Anvil default account #1 (staker)
STAKER_KEY="0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
STAKER="0x70997970C51812dc3A010C7d01b50e0d17dc79C8"

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
RESET='\033[0m'

header() { echo -e "\n${BOLD}${CYAN}══ $* ══${RESET}"; }
ok()     { echo -e "  ${GREEN}✓${RESET} $*"; }
info()   { echo -e "  ${YELLOW}→${RESET} $*"; }

# ──────────────────────────────────────────────────────────────────────────────
# 0. Check Anvil is running
# ──────────────────────────────────────────────────────────────────────────────
header "Checking Anvil"
if ! $CAST chain-id --rpc-url "$ANVIL_RPC" &>/dev/null; then
  echo -e "\n  ${YELLOW}⚠  Anvil is not running on $ANVIL_RPC${RESET}"
  echo "  Start it in another terminal:"
  echo "    anvil"
  echo "  Or override: ANVIL_RPC=http://host:port $0"
  exit 1
fi
ok "Anvil reachable at $ANVIL_RPC (chain $(${CAST} chain-id --rpc-url "$ANVIL_RPC"))"

# ──────────────────────────────────────────────────────────────────────────────
# 1. Deploy contracts
# ──────────────────────────────────────────────────────────────────────────────
header "Deploying contracts"
cd "$CONTRACTS_DIR"

DEPLOY_OUT=$(PRIVATE_KEY="$PRIVATE_KEY" \
  PLATFORM_WALLET="$DEPLOYER" \
  STAKER_YIELD_RECEIVER="$DEPLOYER" \
  DISPUTE_RESOLVER="$DEPLOYER" \
  $FORGE script script/Deploy.s.sol \
    --rpc-url "$ANVIL_RPC" \
    --broadcast \
    --json \
    2>&1)

# Parse contract addresses from forge output (last JSON line)
DEPLOY_JSON=$(echo "$DEPLOY_OUT" | grep -E '^\{' | tail -1 || echo "")

if [ -z "$DEPLOY_JSON" ]; then
  # Fallback: grab from broadcast artefacts
  BROADCAST_FILE=$(ls -t broadcast/Deploy.s.sol/*/run-latest.json 2>/dev/null | head -1 || echo "")
  if [ -z "$BROADCAST_FILE" ]; then
    echo "  Deploy output:"
    echo "$DEPLOY_OUT" | tail -30
    echo -e "\n  ${YELLOW}Could not parse deploy output — run forge script manually:${RESET}"
    echo "  cd $CONTRACTS_DIR"
    echo "  PRIVATE_KEY=$PRIVATE_KEY forge script script/Deploy.s.sol --rpc-url $ANVIL_RPC --broadcast"
    exit 1
  fi
  # Read from broadcast artefact
  INTEL_ADDR=$(jq -r '.transactions[] | select(.contractName == "IntelToken") | .contractAddress' "$BROADCAST_FILE" | head -1)
  STAKING_ADDR=$(jq -r '.transactions[] | select(.contractName == "IntelStaking") | .contractAddress' "$BROADCAST_FILE" | head -1)
  CONTROLLER_ADDR=$(jq -r '.transactions[] | select(.contractName == "IntelMintController") | .contractAddress' "$BROADCAST_FILE" | head -1)
fi

# If addresses still empty, try parsing from stdout
if [ -z "${INTEL_ADDR:-}" ]; then
  INTEL_ADDR=$(echo "$DEPLOY_OUT" | grep -oE 'IntelToken.*0x[0-9a-fA-F]{40}' | grep -oE '0x[0-9a-fA-F]{40}' | head -1 || echo "")
fi

ok "IntelToken:          ${INTEL_ADDR:-<parse broadcast artefact>}"
ok "IntelStaking:        ${STAKING_ADDR:-<parse broadcast artefact>}"
ok "IntelMintController: ${CONTROLLER_ADDR:-<parse broadcast artefact>}"

if [ -z "${INTEL_ADDR:-}" ] || [ -z "${STAKING_ADDR:-}" ] || [ -z "${CONTROLLER_ADDR:-}" ]; then
  echo -e "\n  ${YELLOW}Could not auto-detect addresses. Reading from broadcast artefact…${RESET}"
  BROADCAST_FILE=$(ls -t broadcast/Deploy.s.sol/*/run-latest.json 2>/dev/null | head -1)
  INTEL_ADDR=$(jq -r '.transactions[] | select(.contractName == "IntelToken") | .contractAddress' "$BROADCAST_FILE" | head -1)
  STAKING_ADDR=$(jq -r '.transactions[] | select(.contractName == "IntelStaking") | .contractAddress' "$BROADCAST_FILE" | head -1)
  CONTROLLER_ADDR=$(jq -r '.transactions[] | select(.contractName == "IntelMintController") | .contractAddress' "$BROADCAST_FILE" | head -1)
  ok "IntelToken:          $INTEL_ADDR"
  ok "IntelStaking:        $STAKING_ADDR"
  ok "IntelMintController: $CONTROLLER_ADDR"
fi

# ──────────────────────────────────────────────────────────────────────────────
# Helper: call a view function via cast call
# ──────────────────────────────────────────────────────────────────────────────
intel_balance() {
  $CAST call "$INTEL_ADDR" "balanceOf(address)(uint256)" "$1" --rpc-url "$ANVIL_RPC"
}
eth_balance() {
  $CAST balance "$1" --rpc-url "$ANVIL_RPC"
}
pending_eth_yield() {
  $CAST call "$STAKING_ADDR" "pendingEthYield(address)(uint256)" "$1" --rpc-url "$ANVIL_RPC"
}
pending_intel_yield() {
  $CAST call "$STAKING_ADDR" "pendingYield(address)(uint256)" "$1" --rpc-url "$ANVIL_RPC"
}

# ──────────────────────────────────────────────────────────────────────────────
# 2. Mint initial INTEL supply to staker (deployer owns the token until seeded)
#    MintController owns IntelToken after deploy — use deployer to seed staker
# ──────────────────────────────────────────────────────────────────────────────
header "Seeding staker with INTEL"
STAKE_AMOUNT="1000000000000000000000"  # 1000 INTEL

# Transfer INTEL initial supply from deployer to staker
# (Deploy.s.sol mints INTEL_INITIAL_SUPPLY=10M to deployer; controller owns mint rights)
$CAST send "$INTEL_ADDR" "transfer(address,uint256)(bool)" \
  "$STAKER" "$STAKE_AMOUNT" \
  --private-key "$PRIVATE_KEY" \
  --rpc-url "$ANVIL_RPC" \
  --quiet

ok "Transferred 1000 INTEL to staker"
info "Staker INTEL balance: $($CAST to-dec $(intel_balance $STAKER)) wei ($(python3 -c "print($(intel_balance $STAKER)/1e18)" 2>/dev/null || echo '~1000') INTEL)"

# ──────────────────────────────────────────────────────────────────────────────
# 3. Staker approves + stakes INTEL
# ──────────────────────────────────────────────────────────────────────────────
header "Staking INTEL"

$CAST send "$INTEL_ADDR" "approve(address,uint256)(bool)" \
  "$STAKING_ADDR" "$STAKE_AMOUNT" \
  --private-key "$STAKER_KEY" \
  --rpc-url "$ANVIL_RPC" \
  --quiet

$CAST send "$STAKING_ADDR" "stake(uint256)" \
  "$STAKE_AMOUNT" \
  --private-key "$STAKER_KEY" \
  --rpc-url "$ANVIL_RPC" \
  --quiet

TOTAL_STAKED=$($CAST call "$STAKING_ADDR" "totalStaked()(uint256)" --rpc-url "$ANVIL_RPC")
ok "Staked 1000 INTEL — totalStaked: $TOTAL_STAKED"

# ──────────────────────────────────────────────────────────────────────────────
# 4. Mint INTEL via executeMint (ETH path)
#    Deployer is an operator (Deploy.s.sol sets controller as operator of itself
#    and the deployer is the owner, so owner acts as operator too).
#    Price: floor = 0.001 ETH/INTEL, minting 10 INTEL = 0.01 ETH
# ──────────────────────────────────────────────────────────────────────────────
header "Minting INTEL (ETH path — triggers ETH yield deposit)"

MINT_AMOUNT="10000000000000000000"   # 10 INTEL
# Get quote
MINT_COST=$($CAST call "$CONTROLLER_ADDR" "quoteMint(uint256)(uint256)" "$MINT_AMOUNT" --rpc-url "$ANVIL_RPC")
info "Mint quote for 10 INTEL: $MINT_COST wei ($(python3 -c "print($MINT_COST/1e18)" 2>/dev/null || echo 'N/A') ETH)"

# executeMint(to, intelAmount, maxPrice) payable — deployer is owner/operator
$CAST send "$CONTROLLER_ADDR" "executeMint(address,uint256,uint256)" \
  "$STAKER" "$MINT_AMOUNT" "$MINT_COST" \
  --value "$MINT_COST" \
  --private-key "$PRIVATE_KEY" \
  --rpc-url "$ANVIL_RPC" \
  --quiet

ok "Minted 10 INTEL to staker via ETH payment"

# Show ETH yield deposited into staking
ETH_STAKER_SHARE=$((MINT_COST * 4500 / 10000))
STAKING_ETH_BALANCE=$($CAST balance "$STAKING_ADDR" --rpc-url "$ANVIL_RPC")
ok "IntelStaking ETH balance: $STAKING_ETH_BALANCE wei (45% of mint proceeds)"
ok "Pending ETH yield for staker: $(pending_eth_yield $STAKER) wei"

# ──────────────────────────────────────────────────────────────────────────────
# 5. Claim ETH yield
# ──────────────────────────────────────────────────────────────────────────────
header "Claiming ETH yield"

ETH_BEFORE=$(eth_balance "$STAKER")
$CAST send "$STAKING_ADDR" "claimEthYield()(uint256)" \
  --private-key "$STAKER_KEY" \
  --rpc-url "$ANVIL_RPC" \
  --quiet
ETH_AFTER=$(eth_balance "$STAKER")

ok "ETH yield claimed!"
info "Staker ETH before claim: $ETH_BEFORE"
info "Staker ETH after claim:  $ETH_AFTER"
info "Pending ETH yield after claim: $(pending_eth_yield $STAKER) wei (should be 0)"

# ──────────────────────────────────────────────────────────────────────────────
# 6. Also deposit INTEL yield directly (simulating settlement contract)
# ──────────────────────────────────────────────────────────────────────────────
header "Depositing INTEL yield (simulating 9% task settlement)"

YIELD_AMOUNT="90000000000000000000"  # 90 INTEL (9% of 1000 INTEL task)
intel_balance_deployer=$(intel_balance "$DEPLOYER")
info "Deployer INTEL balance: $intel_balance_deployer"

if [ "$(python3 -c "print(1 if $intel_balance_deployer >= $YIELD_AMOUNT else 0)" 2>/dev/null || echo 0)" = "1" ]; then
  $CAST send "$INTEL_ADDR" "approve(address,uint256)(bool)" \
    "$STAKING_ADDR" "$YIELD_AMOUNT" \
    --private-key "$PRIVATE_KEY" \
    --rpc-url "$ANVIL_RPC" \
    --quiet

  $CAST send "$STAKING_ADDR" "depositYield(uint256)" \
    "$YIELD_AMOUNT" \
    --private-key "$PRIVATE_KEY" \
    --rpc-url "$ANVIL_RPC" \
    --quiet

  ok "Deposited 90 INTEL yield"
  ok "Pending INTEL yield for staker: $(pending_intel_yield $STAKER) wei"
else
  info "Deployer INTEL balance too low to demo INTEL yield deposit (deployer supply already transferred)"
fi

# ──────────────────────────────────────────────────────────────────────────────
# Summary
# ──────────────────────────────────────────────────────────────────────────────
header "Demo complete — Summary"
echo ""
echo -e "  Contracts on local Anvil ($ANVIL_RPC):"
echo -e "    INTEL Token:          ${BOLD}$INTEL_ADDR${RESET}"
echo -e "    IntelStaking:         ${BOLD}$STAKING_ADDR${RESET}"
echo -e "    IntelMintController:  ${BOLD}$CONTROLLER_ADDR${RESET}"
echo ""
echo -e "  Final staker state:"
echo -e "    INTEL balance:    $(intel_balance $STAKER) wei"
echo -e "    ETH balance:      $(eth_balance $STAKER)"
echo -e "    Pending ETH yield: $(pending_eth_yield $STAKER)"
echo -e "    Pending INTEL yield: $(pending_intel_yield $STAKER)"
echo ""
echo -e "  ${GREEN}${BOLD}✓ Full flow: stake → mint(ETH) → ETH yield deposit → claim verified${RESET}"
echo ""
echo -e "  Next steps:"
echo -e "  • Copy these addresses to apps/intelligence-exchange-cannes-web/.env.local"
echo -e "    VITE_INTEL_TOKEN_ADDRESS=$INTEL_ADDR"
echo -e "    VITE_INTEL_STAKING_ADDRESS=$STAKING_ADDR"
echo -e "    VITE_INTEL_MINT_CONTROLLER_ADDRESS=$CONTROLLER_ADDR"
echo -e "    VITE_ARC_RPC_URL=$ANVIL_RPC"
echo -e "    VITE_ARC_CHAIN_ID=31337"
echo -e "  • Run: pnpm dev:cannes   (web app at localhost:3100)"
echo ""
