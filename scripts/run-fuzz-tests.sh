#!/bin/bash
# Fuzz testing script for Intelligence Exchange contracts
# Runs comprehensive fuzz tests on critical contracts

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTRACTS_DIR="$SCRIPT_DIR/../packages/intelligence-exchange-cannes-contracts"

cd "$CONTRACTS_DIR"

echo "🔬 Starting Fuzz Testing for Intelligence Exchange Contracts"
echo "============================================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to run fuzz tests
run_fuzz_test() {
    local contract=$1
    local test_file=$2
    local runs=${3:-256}

    echo "📝 Running fuzz tests for $contract..."
    echo "   Test file: $test_file"
    echo "   Fuzz runs: $runs"
    echo ""

    if forge test --match-path "$test_file" --fuzz-runs "$runs" -vv; then
        echo -e "${GREEN}✅ $contract fuzz tests passed${NC}"
        echo ""
        return 0
    else
        echo -e "${RED}❌ $contract fuzz tests failed${NC}"
        echo ""
        return 1
    fi
}

# Function to run invariant tests
run_invariant_test() {
    local contract=$1
    local test_file=$2
    local runs=${3:-256}

    echo "📝 Running invariant tests for $contract..."
    echo "   Test file: $test_file"
    echo "   Invariant runs: $runs"
    echo ""

    if forge test --match-path "$test_file" --fuzz-runs "$runs" -vv; then
        echo -e "${GREEN}✅ $contract invariant tests passed${NC}"
        echo ""
        return 0
    else
        echo -e "${RED}❌ $contract invariant tests failed${NC}"
        echo ""
        return 1
    fi
}

# Parse command line arguments
FUZZ_RUNS=${1:-256}
SKIP_QUICK=${2:-false}

echo "Configuration:"
echo "  Fuzz runs per test: $FUZZ_RUNS"
echo "  Skip quick tests: $SKIP_QUICK"
echo ""

# Quick tests (low fuzz runs for CI)
if [ "$SKIP_QUICK" = "false" ]; then
    echo "🚀 Running quick fuzz tests (256 runs each)..."
    echo ""

    run_fuzz_test "IntelToken" "test/IntelToken.fuzz.t.sol" 256 || exit 1
    run_fuzz_test "IntelStaking" "test/IntelStaking.fuzz.t.sol" 256 || exit 1

    echo -e "${GREEN}✅ All quick fuzz tests passed${NC}"
    echo ""
fi

# Comprehensive tests (high fuzz runs for thorough testing)
echo "🔬 Running comprehensive fuzz tests ($FUZZ_RUNS runs each)..."
echo ""

run_fuzz_test "IntelToken" "test/IntelToken.fuzz.t.sol" "$FUZZ_RUNS" || exit 1
run_fuzz_test "IntelStaking" "test/IntelStaking.fuzz.t.sol" "$FUZZ_RUNS" || exit 1

echo -e "${GREEN}✅ All comprehensive fuzz tests passed${NC}"
echo ""

# Gas snapshot
echo "⛽ Generating gas snapshot..."
forge snapshot --match-path "test/*.fuzz.t.sol"
echo ""

echo "============================================================"
echo -e "${GREEN}🎉 Fuzz testing complete! All tests passed.${NC}"
echo ""
echo "Summary:"
echo "  - IntelToken fuzz tests: ✅"
echo "  - IntelStaking fuzz tests: ✅"
echo "  - Fuzz runs per test: $FUZZ_RUNS"
echo ""