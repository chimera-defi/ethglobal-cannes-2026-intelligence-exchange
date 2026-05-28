# Pass 6 — Final Adversarial Audit (2026-05-28)

**Auditor:** devin-delegate (claude-sonnet-4-6)  
**Scope:** All 11 contracts in packages/intelligence-exchange-cannes-contracts/src/  
**Test baseline:** 356 tests passing  
**Methodology:** Fresh adversarial pass focusing on reentrancy, access control, arithmetic precision, and deployment verification

---

## CRITICAL findings

None.

---

## HIGH findings

None.

---

## MEDIUM findings

**P6-A1 — MEDIUM — RESOLVED: Missing nonReentrant guard on AdvancedArcEscrow release functions**

> **Resolution (2026-05-28):** Added reentrancy guard implementation to AdvancedArcEscrow.sol with nonReentrant modifier applied to `releaseMilestone()`, `autoReleaseMilestone()`, `resolveDispute()`, and `refundMilestone()`. Reentrancy status initialized in constructor. All 356 tests pass after fix.

**Contract:** `AdvancedArcEscrow.sol`  
**Functions:** `releaseMilestone()` (line 529), `autoReleaseMilestone()` (line 592), `_resolveDispute()` (line 696)  
**Severity:** MEDIUM

**Description:**
While these functions follow the Checks-Effects-Interactions (CEI) pattern with state updates before external transfers, they lack explicit `nonReentrant` guards. If the `paymentToken` (configurable ERC-20) implements malicious transfer hooks (e.g., a custom token with `onTransfer` callbacks), an attacker could potentially re-enter these functions during the transfer phase.

**Attack scenario:**
1. Attacker deploys malicious ERC-20 token with reentrant transfer hook
2. Attacker funds an idea with the malicious token
3. Attacker calls `releaseMilestone()` or triggers dispute resolution
4. During token transfer, malicious hook re-enters the contract
5. While CEI provides some protection, the lack of explicit mutex leaves edge cases

**Evidence:**
```solidity
function releaseMilestone(bytes32 milestoneId) external {
    _releaseMilestone(milestoneId);  // ← No nonReentrant guard
}

function autoReleaseMilestone(bytes32 milestoneId) external {
    // State updates before transfers (CEI), but no mutex
    MilestoneFund storage m = milestones[milestoneId];
    // ...
    bool ok = IERC20(paymentToken).transfer(m.worker, workerAmount);
}
```

**Recommended fix:**
Add `nonReentrant` modifier to the following functions:
- `releaseMilestone()`
- `autoReleaseMilestone()`
- `_resolveDispute()`
- `refundMilestone()`

Implement the same reentrancy guard pattern used in `IntelMintController` and `IntelStaking`:

```solidity
uint256 private _reentrancyStatus;
uint256 private constant _NOT_ENTERED = 1;
uint256 private constant _ENTERED = 2;

modifier nonReentrant() {
    require(_reentrancyStatus != _ENTERED, "AdvancedArcEscrow: reentrant call");
    _reentrancyStatus = _ENTERED;
    _;
    _reentrancyStatus = _NOT_ENTERED;
}
```

---

## LOW findings

**P6-A2 — LOW — RESOLVED: Missing zero address validation in setDisputeResolver**

> **Resolution (2026-05-28):** Added `if (_disputeResolver == address(0)) revert ZeroAddress();` guard to `setDisputeResolver()` function. Added `ZeroAddress()` error to AdvancedArcEscrow error declarations. All 356 tests pass after fix.

**Contract:** `AdvancedArcEscrow.sol`  
**Function:** `setDisputeResolver()` (line 923)  
**Severity:** LOW

**Description:**
The `setDisputeResolver` function does not validate that the new address is non-zero. Setting the dispute resolver to `address(0)` would break dispute resolution functionality, as `onlyResolver` checks `msg.sender != disputeResolver && msg.sender != owner`, and zero address would fail legitimate resolver calls.

**Evidence:**
```solidity
function setDisputeResolver(address _disputeResolver) external onlyOwner {
    disputeResolver = _disputeResolver;  // ← No zero address check
    emit DisputeResolverSet(_disputeResolver);
}
```

**Recommended fix:**
```solidity
function setDisputeResolver(address _disputeResolver) external onlyOwner {
    if (_disputeResolver == address(0)) revert ZeroAddress();
    disputeResolver = _disputeResolver;
    emit DisputeResolverSet(_disputeResolver);
}
```

---

**P6-A3 — LOW — OPEN: Permissionless TWAP oracle manipulation risk**

**Contract:** `IntelMintController.sol`  
**Function:** `pullTWAP()` (lines 291-314)  
**Severity:** LOW

**Description:**
The `pullTWAP` function is permissionless — anyone can call it to update the stored TWAP from a Uniswap V3 pool. While Uniswap V3 TWAP is generally resistant to short-term manipulation, flash loan attacks could temporarily skew the oracle. An attacker could:
1. Take a flash loan to manipulate the pool price
2. Call `pullTWAP()` to update the stored price
3. Exploit the manipulated price for minting advantage
4. Repay flash loan

The `floorPrice` provides some protection (price cannot drop below floor), but the ceiling is unbounded.

**Evidence:**
```solidity
function pullTWAP(address pool, uint32 twapPeriod, bool intelIsToken0) external {
    // ← Permissionless - anyone can call
    if (pool == address(0)) revert ZeroAddress();
    if (twapPeriod < 60) revert InvalidParam();
    // ...
    twap = price;  // Stored without deviation check
    twapUpdatedAt = block.timestamp;
}
```

**Recommended fix:**
1. Make `pullTWAP` operator-only, OR
2. Add a deviation threshold (e.g., reject if new TWAP differs from stored by >10%):
```solidity
uint256 public maxTwapDeviationBps = 1000; // 10%

function pullTWAP(address pool, uint32 twapPeriod, bool intelIsToken0) external onlyOperator {
    // ... existing validation ...
    uint256 newPrice = _tickToPrice(avgTick, intelIsToken0);
    if (newPrice < floorPrice) newPrice = floorPrice;
    
    // Deviation check
    if (twap > 0) {
        uint256 deviation = newPrice > twap 
            ? ((newPrice - twap) * BPS) / twap
            : ((twap - newPrice) * BPS) / twap;
        if (deviation > maxTwapDeviationBps) revert InvalidParam();
    }
    
    twap = newPrice;
    twapUpdatedAt = block.timestamp;
}
```

---

**P6-A4 — LOW — CARRYOVER: MINIMUM_DELAY too short for mainnet (from pass4)**

**Contract:** `IntelTimelockController.sol`  
**Constant:** `MINIMUM_DELAY = 15 minutes` (line 58)  
**Severity:** LOW

**Description:**
Carried forward from pass4 audit (P4-T8). The 15-minute minimum delay is appropriate for testnets but insufficient for mainnet governance. A compromised proposer could execute malicious actions before the community can react.

**Recommended fix:**
Before mainnet deployment, redeploy `IntelTimelockController` with `MINIMUM_DELAY = 24 hours` (or 48 hours). The `Deploy.s.sol` script already uses `DEFAULT_TIMELOCK_DELAY = 48 hours` for the constructor parameter, but the constant floor must also be raised to prevent governance bypass.

---

## Anvil Deploy Result

**Status:** ✅ SUCCESS

All 11 contracts deployed and wired correctly on local Anvil (chain ID 31337):

| Contract | Address |
|----------|---------|
| IdentityGate | 0x5FbDB2315678afecb367f032d93F642f64180aa3 |
| AgentIdentityRegistry | 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512 |
| IdeaEscrow (legacy) | 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0 |
| AdvancedArcEscrow | 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9 |
| IntelToken | 0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9 |
| IntelStaking | 0x5FC8d32690cc91D4c39d9d3abcBD16989F875707 |
| IntelTimelockController | 0x0165878A594ca255338adfa4d48449f69242Eb8F |
| IntelPOLManager | 0xa513E6E4b8f2a923D98304ec87F64353C4D5C853 |
| IntelMintController | 0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6 |
| WorkReceipt1155 | 0x8A791620dd6260079BF849Dc5567aDC3F2FdC318 |
| IntelVesting (team) | 0x610178dA211FEF7D417bC0e6FeD39F05609AD788 |

**Wiring verification:**
- ✅ IntelToken.minter set to IntelMintController
- ✅ IntelStaking operator set to IntelMintController
- ✅ IntelMintController operator set to deployer (bootstrap)
- ✅ WorkReceipt1155 operator set to attestor
- ✅ Token distribution: 10M INTEL initial supply distributed correctly
- ✅ No revert errors during deployment
- ✅ All contract addresses valid and non-zero

---

## Verdict

**READY FOR TESTNET DEPLOY**

**Resolved in pass6:**
1. ✅ **FIXED:** Added nonReentrant guard to AdvancedArcEscrow release functions (P6-A1)
2. ✅ **FIXED:** Added zero address validation to setDisputeResolver (P6-A2)

**Recommended before mainnet:**
1. **SHOULD FIX:** Restrict pullTWAP to operator-only or add deviation threshold (P6-A3)
2. **MANDATORY:** Raise IntelTimelockController.MINIMUM_DELAY to ≥24 hours (P6-A4)

**Test verification:**
- ✅ All 356 tests passing after fixes
- ✅ Anvil deployment successful - all 11 contracts deployed and wired correctly
- ✅ No CRITICAL or HIGH severity findings

**No CRITICAL or HIGH severity findings.** The codebase demonstrates strong security posture with:
- Comprehensive access control via modifiers
- CEI pattern consistently applied with reentrancy guards on critical functions
- Solidity 0.8.24 built-in overflow protection
- No token approval frontrunning vectors (no approve/permit patterns)
- No flash loan vectors in core contracts (only oracle manipulation risk in pullTWAP)
- BPS calculations use proper 10000 denominator with dust handling
- Input validation comprehensive (all identified gaps now resolved)

The contracts are suitable for testnet deployment. The remaining LOW findings (P6-A3, P6-A4) should be resolved before mainnet launch.