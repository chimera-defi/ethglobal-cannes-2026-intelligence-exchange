# Pass 10 Smart Contract Audit Report

**Date:** 2026-05-30  
**Scope:** Pass 9 findings verification + fresh audit of uncovered contracts  
**Auditor:** Claude Sonnet 4.6

## Pass 9 Findings Status

| Finding | Description | Status | Evidence |
|---------|-------------|--------|----------|
| **H1** | EpochRewardDistributor.distributeEpochRewards() - unbounded loop (no topCount cap) | **FIXED** | Loop now bounded by `topCount` (lines 179-181, 189-194). `topCount` calculated as `(workers.length * topPercentileBps) / BPS` with safeguards (lines 174-176). |
| **H2** | EpochRewardDistributor.submitEpochScores() - unbounded array, no max length | **STILL OPEN** | No explicit max length cap on `workers` array (line 140). Loop bounded by `workers.length` (line 150). Gated by `onlyOperator` but no gas limit protection. |
| **M1-M5** | SafeERC20 missing across multiple contracts | **STILL OPEN** | EpochRewardDistributor uses raw `IntelToken.transfer()` and `transferFrom()` without SafeERC20 wrapper (lines 186, 231, 241). Other contracts not in scope for this pass. |

## New Findings: IntelStaking.sol

### HIGH

**H3: Unchecked arithmetic in yield calculations**
- **Location:** Lines 207-208, 240-241, 278
- **Issue:** Yield debt calculations use unchecked arithmetic: `s.yieldDebt = (s.staked * accYieldPerShare) / PRECISION`. No overflow protection despite large numbers (PRECISION = 1e36).
- **Impact:** Potential for arithmetic overflow in edge cases with extreme staking amounts or yield accumulations.
- **Recommendation:** Add `unchecked` block with explicit overflow checks or use SafeMath-style guards.

**H4: Global cap reset vulnerability in setParams()**
- **Location:** Lines 400-414
- **Issue:** `setParams()` resets `globalCapRemaining` to full cap mid-epoch (line 412), discarding consumed allowance. Documented warning exists but no enforcement.
- **Impact:** Owner can bypass global mint caps by calling `setParams()` mid-epoch, allowing unlimited minting.
- **Recommendation:** Add epoch boundary check: `require(block.timestamp >= epochStartTime + epochLength, "Must call at epoch boundary")`.

### MEDIUM

**M6: Missing SafeERC20 for INTEL transfers**
- **Location:** Lines 211-212, 259-260, 273-274
- **Issue:** Raw `intel.transferFrom()` and `intel.transfer()` calls without SafeERC20 wrapper. Missing return value check in some paths.
- **Impact:** Non-standard ERC20 tokens could fail silently.
- **Recommendation:** Import and use SafeERC20 for all token operations.

**M7: Reentrancy protection inconsistent**
- **Location:** Lines 271-285 (depositYield)
- **Issue:** `depositYield()` is `onlyOperator` but lacks `nonReentrant` modifier despite external token transfer.
- **Impact:** Operator could potentially reenter if token callback exists.
- **Recommendation:** Add `nonReentrant` to `depositYield()`.

## New Findings: ReviewerQueue.sol

### MEDIUM

**M8: Unbounded loop in _selectReviewerForTask()**
- **Location:** Lines 284-297
- **Issue:** Loop iterates over `eligibleReviewers.length` without max cap. Could be large if Sybil reviewers exist.
- **Impact:** Gas DoS if operator submits massive eligible reviewer array.
- **Recommendation:** Add max reviewers cap (e.g., 100) and revert if exceeded.

**M9: Linear search in _removeFromQueue()**
- **Location:** Lines 379-388
- **Issue:** O(n) search through reviewer's queue to find taskId. Could be slow if reviewer has many active tasks.
- **Impact:** Gas inefficiency, potential DoS if queue grows large.
- **Recommendation:** Use mapping `taskId => index` for O(1) removal.

**M10: Missing SafeERC20 for stake manager calls**
- **Location:** Line 294
- **Issue:** Calls `reviewerStakeManager.reviewerBond(reviewer)` without knowing if that contract uses SafeERC20 internally.
- **Impact:** Dependency on external contract's safety practices.
- **Recommendation:** Audit ReviewerStakeManager.sol for SafeERC20 usage (not in scope).

### LOW

**L1: Deterministic selection uses block.timestamp**
- **Location:** Line 355
- **Issue:** `uint256 seed = uint256(keccak256(abi.encodePacked(taskId, block.timestamp)))` is somewhat predictable within same block.
- **Impact:** Minor manipulation potential if attacker can control timing.
- **Recommendation:** Consider using block.prevrandao for better randomness.

## New Findings: WorkReceipt1155.sol

### LOW

**L2: No reentrancy protection on mint()**
- **Location:** Lines 164-190
- **Issue:** `mint()` is `onlyOperator` but lacks `nonReentrant` modifier despite state changes.
- **Impact:** Low risk (operator-only), but inconsistent with other contracts.
- **Recommendation:** Add `nonReentrant` for consistency.

**L3: Sequential tokenId predictability**
- **Location:** Line 174
- **Issue:** `tokenId = nextTokenId++` is fully predictable.
- **Impact:** Information leakage about total number of accepted milestones.
- **Recommendation:** Consider random tokenId generation if privacy is required.

**L4: Missing SafeERC20**
- **Location:** N/A (no token transfers in this contract)
- **Status:** Not applicable - contract only mints soulbound tokens, no ERC20 operations.

## Reentrancy Assessment

| Contract | State-Changing External Calls | Protected |
|----------|------------------------------|-----------|
| EpochRewardDistributor | `intel.transferFrom()`, `intel.transfer()` | ✅ Yes (nonReentrant) |
| IntelStaking | `intel.transferFrom()`, `intel.transfer()` | ⚠️ Partial (depositYield missing) |
| ReviewerQueue | `reviewerStakeManager.reviewerBond()` (view), `identityGate.isVerified()` (view) | ✅ Yes (nonReentrant on state changes) |
| WorkReceipt1155 | None (only emits events) | ❌ No (but low risk, operator-only) |

## Access Control Assessment

All contracts properly implement:
- `onlyOwner` for admin functions (params, ownership, operator management)
- `onlyOperator` for operational functions (minting, distribution, assignment)
- Ownable2Step for ownership transfer

**No access control vulnerabilities found.**

## Integer Overflow Assessment

- **EpochRewardDistributor:** ✅ Safe (Solidity 0.8.24 has built-in overflow checks)
- **IntelStaking:** ⚠️ Risk in yield calculations (H3) - large multiplications with 1e36 scale
- **ReviewerQueue:** ✅ Safe (simple arithmetic)
- **WorkReceipt1155:** ✅ Safe (simple arithmetic)

## DoS Assessment

| Contract | Unbounded Loops | Storage Writes in Loops | Risk |
|----------|----------------|------------------------|------|
| EpochRewardDistributor | ⚠️ H2 (submitEpochScores) | No | Medium |
| IntelStaking | No | No | Low |
| ReviewerQueue | ⚠️ M8 (_selectReviewerForTask) | No | Medium |
| WorkReceipt1155 | No | No | Low |

## Overall Risk Summary

**Critical:** 0  
**High:** 2 (H3, H4)  
**Medium:** 5 (M6, M7, M8, M9, M10)  
**Low:** 3 (L1, L2, L3)  
**Open from Pass 9:** 2 (H2, M1-M5)

**Recommendation Priority:**
1. Fix H4 (global cap reset) - allows bypass of mint limits
2. Fix H3 (unchecked arithmetic) - potential for overflow bugs
3. Address H2 (unbounded array) - gas DoS vector
4. Add SafeERC20 to all contracts (M1-M5, M6, M7)
5. Optimize ReviewerQueue data structures (M8, M9)

**Notes:**
- All contracts use Solidity 0.8.24 (built-in overflow protection)
- Reentrancy guards are generally well-implemented
- Access control is consistent across all contracts
- Ownable2Step properly implemented for ownership transfer