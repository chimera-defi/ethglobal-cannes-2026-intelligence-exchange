# Fuzz Testing Guide — Intelligence Exchange Contracts

## Overview

This guide covers the fuzz testing infrastructure for Intelligence Exchange smart contracts. Fuzz testing uses randomized inputs to discover edge cases and vulnerabilities that might be missed by traditional unit tests.

## What is Fuzz Testing?

Fuzz testing is a technique that provides random, unexpected, or invalid data as inputs to a program to find bugs and vulnerabilities. For smart contracts, this is particularly important because:

- **Edge cases**: Random inputs can uncover boundary conditions
- **Security vulnerabilities**: Malicious inputs can reveal attack vectors
- **State inconsistencies**: Random state transitions can find logic errors
- **Gas optimization**: Fuzzing can reveal gas inefficiencies

## Fuzz Test Coverage

### Currently Tested Contracts

1. **IntelToken** (`IntelToken.fuzz.t.sol`)
   - Transfer operations (transfer, transferFrom)
   - Mint operations (mint, max supply enforcement)
   - Burn operations (burn, balance checks)
   - Approval operations (approve, increaseAllowance, decreaseAllowance)
   - Edge cases (zero address, insufficient balance, pause functionality)

2. **IntelStaking** (`IntelStaking.fuzz.t.sol`)
   - Staking operations (stake, multiple stakes)
   - Unstaking operations (requestUnstake, cooldown enforcement)
   - Yield operations (depositYield, claimYield)
   - Epoch operations (epoch advancement)
   - Edge cases (zero amounts, insufficient balance, pause, multiple stakers)

### Test Categories

#### 1. Property-Based Testing
Tests that verify invariants must always hold true:
- Total supply never exceeds max supply
- Balances are conserved during transfers
- Allowances are properly consumed
- Staked amounts match contract balances

#### 2. Edge Case Testing
Tests boundary conditions:
- Zero amounts
- Maximum values
- Zero address handling
- Insufficient balances
- Cooldown periods

#### 3. State Transition Testing
Tests complex state changes:
- Multiple sequential operations
- Epoch transitions
- Multi-user scenarios
- Pause/unpause cycles

## Running Fuzz Tests

### Quick Fuzz Tests (CI/CD)

Run quick fuzz tests with low iteration count for fast feedback:

```bash
./scripts/run-fuzz-tests.sh
```

This runs 256 fuzz iterations per test (default).

### Comprehensive Fuzz Tests (Pre-deployment)

Run comprehensive fuzz tests with high iteration count for thorough analysis:

```bash
./scripts/run-fuzz-tests.sh 10000
```

This runs 10,000 fuzz iterations per test.

### Run Specific Contract Fuzz Tests

Test only IntelToken:

```bash
cd packages/intelligence-exchange-cannes-contracts
forge test --match-path test/IntelToken.fuzz.t.sol --fuzz-runs 1000 -vv
```

Test only IntelStaking:

```bash
cd packages/intelligence-exchange-cannes-contracts
forge test --match-path test/IntelStaking.fuzz.t.sol --fuzz-runs 1000 -vv
```

### Run Specific Fuzz Test Function

Test a specific function:

```bash
cd packages/intelligence-exchange-cannes-contracts
forge test --match-test testFuzz_transfer --fuzz-runs 1000 -vv
```

## Fuzz Test Configuration

### Foundry Fuzz Parameters

- `--fuzz-runs`: Number of random inputs to generate (default: 256)
- `--fuzz-seed`: Seed for random number generation (for reproducibility)
- `-vv`: Verbose output to see failing test cases

### Recommended Fuzz Run Counts

- **Development**: 256 runs (fast feedback)
- **CI/CD**: 1,000 runs (balanced speed/coverage)
- **Pre-deployment**: 10,000 runs (thorough coverage)
- **Security audit**: 100,000+ runs (maximum coverage)

## Writing New Fuzz Tests

### Template for Fuzz Tests

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {YourContract} from "../src/YourContract.sol";

contract YourContractFuzzTest is Test {
    YourContract public contract;

    function setUp() public {
        // Setup test state
    }

    /// @notice Fuzz test description
    /// @param param1 Description of parameter
    function testFuzz_functionName(uint256 param1) public {
        // Assume valid inputs
        vm.assume(param1 > 0 && param1 < SOME_LIMIT);

        // Test logic
        // ...

        // Assertions
        assertEq(expected, actual);
    }
}
```

### Fuzz Test Best Practices

1. **Use `vm.assume()` to constrain inputs**
   ```solidity
   vm.assume(amount > 0 && amount <= MAX_SUPPLY);
   ```

2. **Test invariants, not just specific values**
   ```solidity
   assertEq(totalSupplyBefore, totalSupplyAfter); // Invariant
   ```

3. **Include edge cases explicitly**
   ```solidity
   function testFuzz_zeroAmount() public {
       vm.expectRevert();
       contract.function(0);
   }
   ```

4. **Test state transitions**
   ```solidity
   function testFuzz_multipleOperations(uint256[10] calldata amounts) public {
       for (uint256 i = 0; i < 10; i++) {
           contract.function(amounts[i]);
       }
   }
   ```

5. **Document what each test validates**
   ```solidity
   /// @notice Fuzz test for transfer function with random amounts
   /// @param amount Random transfer amount
   ```

## Adding Fuzz Tests for New Contracts

### Step 1: Create Fuzz Test File

Create `test/ContractName.fuzz.t.sol` in the contracts package.

### Step 2: Identify Critical Functions

Focus on functions that:
- Handle user funds
- Modify state
- Have access control
- Perform calculations

### Step 3: Write Fuzz Tests

For each critical function:
- Write fuzz tests with random inputs
- Test edge cases (zero, max, invalid)
- Test invariants
- Test state transitions

### Step 4: Update Test Script

Add the new contract to `scripts/run-fuzz-tests.sh`:

```bash
run_fuzz_test "ContractName" "test/ContractName.fuzz.t.sol" "$FUZZ_RUNS" || exit 1
```

### Step 5: Run and Validate

Run the fuzz tests and fix any issues found:

```bash
./scripts/run-fuzz-tests.sh 1000
```

## Interpreting Fuzz Test Results

### Passing Tests

If all tests pass, it means:
- No obvious edge cases were found with the given number of iterations
- The invariants hold for the tested inputs
- The contract is likely robust against random inputs

**Note**: Passing fuzz tests don't guarantee security, but they significantly increase confidence.

### Failing Tests

If a test fails, Foundry will:
1. Show the failing input values
2. Show the execution trace
3. Show the assertion that failed

**Steps to fix**:
1. Examine the failing input
2. Understand why the invariant was violated
3. Fix the contract logic or add proper input validation
4. Re-run the test to verify the fix

### Common Fuzz Test Failures

1. **Overflow/Underflow**: Use Solidity 0.8+ or SafeMath
2. **Reentrancy**: Use ReentrancyGuard
3. **Access Control**: Check modifiers and role assignments
4. **Logic Errors**: Review business logic for edge cases
5. **Gas Issues**: Optimize gas-intensive operations

## Continuous Integration

### GitHub Actions

Add fuzz tests to CI workflow:

```yaml
- name: Run Fuzz Tests
  run: |
    cd packages/intelligence-exchange-cannes-contracts
    forge test --match-path test/*.fuzz.t.sol --fuzz-runs 1000
```

### Pre-commit Hooks

Add fuzz test check to pre-commit:

```bash
#!/bin/bash
# .git/hooks/pre-commit
cd packages/intelligence-exchange-cannes-contracts
forge test --match-path test/*.fuzz.t.sol --fuzz-runs 256
```

## Advanced Fuzz Testing

### Invariant Testing

Use Foundry's invariant testing for state-based invariants:

```solidity
contract InvariantTest is Test {
    using stdStorage for StdStorage;

    function invariant_totalSupplyNeverExceedsMax() public {
        assertLe(token.totalSupply(), token.maxSupply());
    }
}
```

Run with:
```bash
forge test --match-test invariant_ --fuzz-runs 10000
```

### Stateful Fuzzing

Use Foundry's stateful fuzzing for complex state machines:

```solidity
contract StatefulFuzzTest is Test {
    function setUp() public {
        targetContract(new YourContract());
    }

    function fuzz_send(uint256 calldata data) public {
        targetContract.execute(data);
    }
}
```

## Fuzz Testing vs Other Testing Methods

| Method | Pros | Cons | Use Case |
|--------|------|------|----------|
| **Unit Tests** | Fast, specific | Limited coverage | Basic functionality |
| **Integration Tests** | Realistic interactions | Slower | Contract interactions |
| **Fuzz Tests** | Finds edge cases | Can be slow | Security, robustness |
| **Formal Verification** | Mathematical proof | Complex, expensive | Critical security |

## Troubleshooting

### Fuzz Tests Too Slow

- Reduce `--fuzz-runs` count
- Use `--match-test` to run specific tests
- Run in parallel with `forge test --fork`

### Non-deterministic Failures

- Use `--fuzz-seed` for reproducibility
- Check for external dependencies (block.timestamp, block.number)
- Ensure proper state isolation between tests

### Gas Issues

- Use `forge snapshot` to identify gas-heavy operations
- Optimize loops and storage operations
- Consider batch operations

## Resources

- [Foundry Fuzz Testing Documentation](https://book.getfoundry.sh/forge/fuzz-testing)
- [Ethereum Smart Contract Best Practices](https://consensys.github.io/smart-contract-best-practices/)
- [Solidity by Example - Fuzzing](https://solidity-by-example.org/app/fuzzing/)

## Contributing

When adding new fuzz tests:
1. Follow the naming convention: `ContractName.fuzz.t.sol`
2. Document what each test validates
3. Include edge cases and invariants
4. Update this documentation
5. Add tests to the CI/CD pipeline

## Security Considerations

- Fuzz tests should be run before every deployment
- Increase fuzz run counts for high-value contracts
- Combine with other security measures (audits, formal verification)
- Keep fuzz tests updated with contract changes
- Monitor fuzz test results for regressions

## License

MIT