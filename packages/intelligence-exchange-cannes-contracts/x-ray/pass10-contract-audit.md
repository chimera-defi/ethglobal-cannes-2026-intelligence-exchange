# Pass 10 Security Audit: Smart Contracts

**Date:** 2026-05-30  
**Auditor:** Devin (devin-delegate) + claude-sonnet-4-6  
**Scope:** EpochRewardDistributor.sol (pass 9 re-check), IntelStaking.sol, ReviewerQueue.sol, WorkReceipt1155.sol

---

## Executive Summary

Pass 9 H1 (unbounded distributeEpochRewards loop) is fixed. H2 (unbounded submitEpochScores array) and all M1-M5 SafeERC20 findings remain open. New audit of IntelStaking and ReviewerQueue reveals two new HIGH findings: a mint-cap bypass via mid-epoch param reset (H4) and potential overflow in yield precision math (H3). Prioritize H4 and H3 before mainnet.

---

## Pass 9 Finding Status

| Finding | Description | Status |
|---------|-------------|--------|
| H1 | EpochRewardDistributor distributeEpochRewards unbounded loop | ✅ FIXED (topCount now bounded) |
| H2 | EpochRewardDistributor submitEpochScores unbounded workers array | ❌ STILL OPEN (line 140, no max cap) |
| M1 | DisputeResolution missing SafeERC20 | ❌ STILL OPEN |
| M2 | EpochRewardDistributor missing SafeERC20 | ❌ STILL OPEN (lines 186, 231, 241) |
| M3 | WorkerStakeManager missing SafeERC20 | ❌ STILL OPEN |
| M4 | ReviewerStakeManager missing SafeERC20 | ❌ STILL OPEN |
| M5 | BuybackBurn missing SafeERC20 | ❌ STILL OPEN |

---

## New Findings — IntelStaking.sol

### HIGH

**H3: Unchecked Arithmetic in Yield Calculations**
- **Location:** Lines 207-208, 240-241, 278
- **Issue:** Yield calculations use 1e36 precision intermediates without overflow guards. At large staking positions the multiplication can overflow uint256.
- **Risk:** Yield calculations silently truncate, under-paying stakers or DOS-ing the function.
- **Recommendation:** Use `mulDiv` (FullMath library) for precision arithmetic; add explicit overflow checks.

**H4: setParams() Resets globalCapRemaining Mid-Epoch**
- **Location:** Line 412
- **Issue:** Owner can call `setParams()` to raise `epochMintCap`, which resets `globalCapRemaining`. This allows an operator to reset the cap mid-epoch and mint more than the cap intended.
- **Risk:** Mint cap bypass — economic supply invariant violated.
- **Recommendation:** Only allow param changes to take effect at epoch boundaries, not immediately.

### MEDIUM

**M6: Missing SafeERC20**
- **Location:** Lines 211-212, 259-260, 273-274
- **Issue:** Manual ERC-20 transfer calls without return value safety.
- **Recommendation:** Use SafeERC20.

**M7: depositYield() Missing nonReentrant**
- **Location:** Line 271
- **Issue:** `depositYield()` performs ERC-20 transfers without reentrancy guard. An ERC-777 or callback token could re-enter.
- **Recommendation:** Add `nonReentrant` modifier.

---

## New Findings — ReviewerQueue.sol

### MEDIUM

**M8: Unbounded Loop in _selectReviewerForTask**
- **Location:** Lines 284-297
- **Issue:** Iterates over entire reviewer pool with no cap. Large pools cause OOG.
- **Recommendation:** Add `maxReviewerScanBps` or hard cap of 200 iterations.

**M9: O(n) Search in _removeFromQueue**
- **Location:** Lines 379-388
- **Issue:** Linear scan to find and splice reviewer. Scales poorly with queue size.
- **Recommendation:** Use a mapping(address => index) for O(1) removal.

**M10: External Contract Safety**
- **Location:** Line 294
- **Issue:** Calls `stakeManager.getStake(reviewer)` inside the selection loop. If stakeManager is upgraded or reverts, the entire selection DOS's.
- **Recommendation:** Cache stake values before the loop, or wrap in try/catch.

---

## New Findings — WorkReceipt1155.sol

No new HIGH or MEDIUM findings. Contract is minimal and correctly implements soulbound ERC-1155 (transfer blocked, mint-only). LOW: no event on failed mint; consider emitting a `MintFailed` event for observability.

---

## Priority Order for Fixes

| Priority | Finding | Action |
|----------|---------|--------|
| 1 | H4 (IntelStaking setParams cap reset) | Gate param changes to epoch boundaries |
| 2 | H3 (IntelStaking overflow) | Replace with mulDiv / FullMath |
| 3 | H2 (EpochRewardDistributor workers array) | Add `require(workers.length <= MAX_WORKERS)` |
| 4 | M1-M6 (SafeERC20 missing) | Batch replace manual transfers with SafeERC20 |
| 5 | M7 (depositYield reentrancy) | Add nonReentrant |
| 6 | M8-M9 (ReviewerQueue gas) | Cap loop, add O(1) removal map |

---

## Audit Status: ⚠️ REQUIRES FIXES (2 HIGH before mainnet — H3, H4)
