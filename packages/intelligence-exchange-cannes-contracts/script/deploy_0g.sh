#!/usr/bin/env bash
# Deploy Intelligence Exchange contracts to 0G testnet
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# Load environment variables more safely
if [ -f "$PROJECT_ROOT/.env" ]; then
  export $(grep -v '^#' "$PROJECT_ROOT/.env" | grep -v '^$' | xargs)
fi

# 0G Testnet Configuration
ZERO_G_RPC_URL="${ZERO_G_RPC_URL:-https://evmrpc-testnet.0g.ai}"
ZERO_G_CHAIN_ID="${ZERO_G_CHAIN_ID:-16602}"
ZERO_G_PRIVATE_KEY="${ZERO_G_PRIVATE_KEY:-$PRIVATE_KEY}"

echo "=== Deploying to 0G Testnet ==="
echo "RPC: $ZERO_G_RPC_URL"
echo "Chain ID: $ZERO_G_CHAIN_ID"
echo ""

# Deploy using Foundry
forge script script/Deploy.s.sol \
  --rpc-url "$ZERO_G_RPC_URL" \
  --private-key "$ZERO_G_PRIVATE_KEY" \
  --broadcast \
  --legacy \
  -vvv

echo ""
echo "=== Deployment Complete ==="
echo "Check broadcast/Deploy.s.sol/$ZERO_G_CHAIN_ID/ for deployment details"
