# Audit Pass 12A — New Contracts: LiquidityMining + BuybackBurn LP Routing + IntelStaking Flow Bonus

**Date:** 2026-05-30
**Scope:** New LP mining contract, buyback LP routing, staking flow bonus
**Files:**
- `packages/intelligence-exchange-cannes-contracts/src/LiquidityMining.sol`
- `packages/intelligence-exchange-cannes-contracts/src/BuybackBurn.sol` (LP routing)
- `packages/intelligence-exchange-cannes-contracts/src/IntelStaking.sol` (flow bonus)

---

## LiquidityMining.sol

### ✅ Reentrancy Protection
- `stake()`, `unstake()`, `claimRewards()` all guarded by `nonReentrant()` modifier (lines 52-57)
- Status: **RESOLVED**

### ✅ Reward Math Overflow Protection
- Line 215: `require(accRewardPerShare + (rewards * PRECISION) / totalStaked <= type(uint128).max, "accumulator overflow")`
- PRECISION = 1e36 is safe given the uint128.max cap
- Status: **RESOLVED**

### ⚠️ depositRewards() Extension Logic
- Lines 131-149: Extends rewardEndTime based on amount / rewardRate
- If rewardRate is set to 0, extension = amount / 0 would revert (SafeMath division by zero)
- If rewardRate is set to a very small value (e.g., 1), extension could be huge
- **Issue:** Malicious operator could set rewardRate = 1, then depositRewards(1) to extend mining by 1 second per wei, potentially locking rewards for years
- **Severity:** MEDIUM (operator abuse)
- **Recommendation:** Add max extension cap or require rewardRate >= minimum threshold

### ⚠️ emergencyWithdraw() No Pause Guard
- Lines 158-171: `emergencyWithdraw()` has no `whenNotPaused` modifier
- If contract is paused, users cannot emergency withdraw their stake
- **Severity:** MEDIUM (user fund lockup during pause)
- **Recommendation:** Add `whenNotPaused` modifier OR explicitly allow emergency withdraw during pause (add comment)

### ✅ rewardEndTime Handling in _updatePool()
- Lines 192-219: Correctly caps reward calculation when block.timestamp > rewardEndTime
- Lines 201-204: timeUntilEnd calculation properly handles expired rewards
- Status: **RESOLVED**

### ℹ️ DOS Griefing Vector
- Attacker could stake 1 wei to increase totalStaked, reducing accRewardPerShare growth for all stakers
- Cost: 1 wei + gas
- Impact: Dilutes reward distribution, not critical but annoying
- **Severity:** LOW (griefing)
- **Recommendation:** Add minimum stake amount (e.g., 0.001 INTEL)

---

## BuybackBurn.sol (LP Routing)

### ⚠️ Approval Leak on depositRewards() Failure
- Line 187: `intel.approve(lpMiningAddress, miningShare)`
- Line 188: `ILiquidityMining(lpMiningAddress).depositRewards(miningShare)`
- If line 188 reverts, the approval is never zeroed
- **Issue:** Leftover approval allows lpMiningAddress to drain future INTEL held by BuybackBurn
- **Severity:** HIGH (approval leak)
- **Recommendation:** Wrap in try/catch or zero approval after call:
```solidity
try ILiquidityMining(lpMiningAddress).depositRewards(miningShare) {
    // success
} catch {
    // zero approval on failure
    intel.approve(lpMiningAddress, 0);
    revert; // or handle gracefully
}
intel.approve(lpMiningAddress, 0); // zero on success
```

### ⚠️ No LP Mining Address Validation
- Lines 184-190: No check that lpMiningAddress is a valid LiquidityMining contract
- Owner could set lpMiningAddress to a malicious contract that implements depositRewards()
- Malicious contract could drain approved INTEL or revert to block buybacks
- **Severity:** MEDIUM (misconfiguration risk)
- **Recommendation:** Add interface check or whitelist validation in setLpMining()

### ✅ 70% Burn Floor Enforcement
- Line 252: `if (_lpMiningBps > 3000) revert InvalidParam()` — enforces max 30% to LP mining
- Correctly implements Gensyn invariant: minimum 70% burn
- Status: **RESOLVED**

### ✅ Front-Run Protection
- Only owner can call setLpMining() (line 251)
- executeBuyback() is operator-only (line 134)
- No front-run risk on lpMiningAddress changes
- Status: **RESOLVED**

---

## IntelStaking.sol (Flow Bonus)

### ✅ epochNewStake Reset Logic
- Lines 209-213: Correctly resets epochNewStake when staking in a new epoch
- Checks `s.epochNewStakeEpoch != currentEpoch` before reset
- Status: **RESOLVED**

### ⚠️ epochNewStake Overflow Risk
- Lines 209-213: epochNewStake is uint256, but not checked for overflow
- If user stakes 2^256 - 1 INTEL, epochNewStake could overflow on subsequent stakes
- **Severity:** LOW (theoretical, requires unrealistic stake amounts)
- **Recommendation:** Add overflow check or cap at type(uint256).max - amount

### ✅ Flow Bonus Partial Unstake Handling
- Lines 209-213: epochNewStake tracks cumulative new stake in epoch
- Partial unstake (requestUnstake) does NOT reset epochNewStake
- Re-staking in same epoch correctly adds to epochNewStake
- Flow bonus applies correctly for the full epoch new stake amount
- Status: **RESOLVED**

### ✅ FLOW_BONUS_BPS Ordering in _mintAllowance
- Lines 498-522: Flow bonus applied BEFORE walletCap and globalCap
- Line 508-509: Bonus added to rawAllowance
- Lines 512-518: Caps applied after bonus
- This is correct: bonus is additive, then capped
- Status: **RESOLVED**

---

## Summary

### Critical Issues
None

### High Issues
1. **BuybackBurn.sol: Approval leak on depositRewards() failure** — leftover approval allows LP mining contract to drain future INTEL

### Medium Issues
1. **LiquidityMining.sol: depositRewards() extension abuse** — operator could set low rewardRate to lock mining for years
2. **LiquidityMining.sol: emergencyWithdraw() no pause guard** — users cannot emergency withdraw during pause
3. **BuybackBurn.sol: No LP mining address validation** — owner could misconfigure to malicious contract

### Low Issues
1. **LiquidityMining.sol: DOS griefing via 1 wei stake** — attacker can dilute reward distribution
2. **IntelStaking.sol: epochNewStake theoretical overflow** — requires unrealistic stake amounts

### Resolved Issues
- ✅ LiquidityMining reentrancy protection
- ✅ LiquidityMining reward math overflow protection
- ✅ LiquidityMining rewardEndTime handling
- ✅ BuybackBurn 70% burn floor
- ✅ BuybackBurn front-run protection
- ✅ IntelStaking epochNewStake reset logic
- ✅ IntelStaking flow bonus partial unstake handling
- ✅ IntelStaking FLOW_BONUS_BPS ordering