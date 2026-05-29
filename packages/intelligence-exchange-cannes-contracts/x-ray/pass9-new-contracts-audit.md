# Pass 9 Security Audit: New Contracts

**Date:** 2026-05-29  
**Auditor:** Devin (Claude Sonnet 4.6)  
**Scope:** DisputeResolution.sol, EpochRewardDistributor.sol, WorkerStakeManager.sol, ReviewerStakeManager.sol, BuybackBurn.sol, CategoryRegistry.sol

---

## Executive Summary

This audit reviews 6 newly added contracts for:
- Reentrancy vulnerabilities
- Access control issues
- Integer overflow in BPS math
- Denial of service vectors
- ERC-20 token handling safety

**Overall Assessment:** 3 HIGH findings, 2 MEDIUM findings, 4 LOW findings

---

## Findings by Contract

### 1. DisputeResolution.sol

#### CRITICAL
None

#### HIGH
None

#### MEDIUM

**M1: Missing SafeERC20 - Manual Return Value Checks**
- **Location:** Lines 201-202, 359-360, 365-366, 390
- **Issue:** Contract uses manual `bool` return value checks for ERC-20 transfers instead of OpenZeppelin's SafeERC20
- **Risk:** Non-standard ERC-20 tokens that don't return boolean values (e.g., USDT) will fail silently
- **Recommendation:** Import and use SafeERC20's `safeTransfer` and `safeTransferFrom`

#### LOW

**L1: Try-Catch Swallows Slash Failures**
- **Location:** Lines 294-303, 312-325
- **Issue:** External calls to stake managers are wrapped in try/catch blocks that silently fail
- **Risk:** Slashing may fail without notification, leaving malicious actors unpenalized
- **Recommendation:** Emit events on catch blocks for better observability

**L2: Jury Selection Loop Not Gas-Optimized**
- **Location:** Lines 218-223, 229-231
- **Issue:** Two separate loops over jurors array could be combined
- **Risk:** Minor gas inefficiency
- **Recommendation:** Combine validation and jury duty tracking into single loop

---

### 2. EpochRewardDistributor.sol

#### CRITICAL
None

#### HIGH

**H1: Unbounded Loop in distributeEpochRewards**
- **Location:** Lines 179-181, 189-194
- **Issue:** Loops over `topCount` which could be set arbitrarily high by owner
- **Risk:** Owner can grief contract by setting `topPercentileBps` to 10000, causing OOG for all distributions
- **Recommendation:** Add hard cap on `topCount` (e.g., max 100 workers)

**H2: Unbounded Loop in submitEpochScores**
- **Location:** Lines 150-158
- **Issue:** No limit on `workers.length` - operator can submit arbitrarily large arrays
- **Risk:** Operator can grief contract by submitting massive arrays, causing OOG
- **Recommendation:** Add max array length parameter (e.g., max 1000 workers)

#### MEDIUM

**M2: Missing SafeERC20**
- **Location:** Lines 186, 231, 241
- **Issue:** Manual return value checks for ERC-20 transfers
- **Risk:** Non-standard tokens will fail
- **Recommendation:** Use SafeERC20

#### LOW

**L3: Race Condition in distributeEpochRewards**
- **Location:** Line 186
- **Issue:** `intel.transferFrom(treasury, address(this), pool)` happens before state changes
- **Risk:** If transfer fails, gas is wasted but no state change
- **Recommendation:** Follow CEI pattern - check effects, then interact

---

### 3. WorkerStakeManager.sol

#### CRITICAL
None

#### HIGH
None

#### MEDIUM

**M3: Missing SafeERC20**
- **Location:** Lines 133-134, 171-172, 228-229, 233-234
- **Issue:** Manual return value checks for ERC-20 transfers
- **Risk:** Non-standard tokens will fail
- **Recommendation:** Use SafeERC20

#### LOW

**L4: Slash Deduction Logic Complexity**
- **Location:** Lines 216-224
- **Issue:** Complex logic to deduct from staked vs pending unstake
- **Risk:** Edge cases where calculation might be incorrect
- **Recommendation:** Simplify to always deduct from staked first, then pending

---

### 4. ReviewerStakeManager.sol

#### CRITICAL
None

#### HIGH
None

#### MEDIUM

**M4: Missing SafeERC20**
- **Location:** Lines 119-120, 168-169, 202-203, 214-215, 239-240
- **Issue:** Manual return value checks for ERC-20 transfers
- **Risk:** Non-standard tokens will fail
- **Recommendation:** Use SafeERC20

#### LOW

**L5: Fee Balance Check Before Transfer**
- **Location:** Line 198
- **Issue:** Checks `intel.balanceOf(address(this)) < fees` before zeroing balance
- **Risk:** Check-then-act race condition (though low risk in single transaction)
- **Recommendation:** Use CEI pattern - zero balance first, then transfer

---

### 5. BuybackBurn.sol

#### CRITICAL
None

#### HIGH
None

#### MEDIUM

**M5: Missing SafeERC20**
- **Location:** Line 296
- **Issue:** Manual approval call without SafeERC20
- **Risk:** Non-standard tokens may fail approval
- **Recommendation:** Use SafeERC20's `safeApprove`

**M6: Staticcall Failure Handling**
- **Location:** Lines 261-263
- **Issue:** TWAP fetch via staticcall reverts on failure
- **Risk:** Buyback completely blocked if POL manager is temporarily unavailable
- **Recommendation:** Add fallback mechanism or grace period

#### LOW

**L6: Slippage Check After Swap**
- **Location:** Lines 169-173
- **Issue:** Post-swap slippage check reverts entire transaction
- **Risk:** Wasted gas if slippage exceeded - should check before swap
- **Recommendation:** Pre-calculate expected output using pool reserves

**L7: ETH Withdrawal Uses call**
- **Location:** Line 195
- **Issue:** Uses low-level `call` for ETH withdrawal
- **Risk:** Reentrancy if owner is malicious contract (though nonReentrant modifier protects)
- **Recommendation:** Use `transfer` for simplicity (100 gas limit is sufficient)

---

### 6. CategoryRegistry.sol

#### CRITICAL
None

#### HIGH
None

#### MEDIUM
None

#### LOW

**L8: setCategoryWeight Loop Unbounded**
- **Location:** Lines 211-230
- **Issue:** Fixed loop of 6 iterations, but could be parameterized for extensibility
- **Risk:** If category count increases in future, code will break
- **Recommendation:** Make category count a constant parameter

**L9: No Validation of Weight Sum**
- **Location:** Lines 198-234
- **Issue:** Rebalancing logic assumes weights sum to 10000 but doesn't validate
- **Risk:** Rounding errors could cause sum to deviate from 10000
- **Recommendation:** Add assertion that final sum equals BPS_TOTAL

---

## Summary Statistics

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH     | 2 |
| MEDIUM   | 4 |
| LOW      | 5 |

**Total:** 11 findings

## Recommendations Priority

1. **Immediate (HIGH):**
   - Add hard caps on array sizes in EpochRewardDistributor (H1, H2)
   - This prevents operator griefing vectors

2. **Short-term (MEDIUM):**
   - Replace all manual ERC-20 calls with SafeERC20 (M1-M5)
   - Add fallback mechanism for TWAP fetch in BuybackBurn (M6)

3. **Long-term (LOW):**
   - Improve observability with events on error paths (L1)
   - Optimize gas usage in loops (L2, L8)
   - Improve CEI pattern adherence (L3, L5)
   - Add validation invariants (L9)

---

## Conclusion

The contracts demonstrate good security practices with:
- Proper reentrancy guards on all state-changing functions
- Clear access control with owner/operator separation
- Ownable2Step for ownership transfers

The primary concerns are:
1. **DoS vectors via unbounded loops** in EpochRewardDistributor
2. **Missing SafeERC20** across all contracts
3. **Limited observability** when external calls fail

Address the HIGH findings before mainnet deployment. MEDIUM findings should be fixed in first patch. LOW findings are quality improvements.

**Audit Status:** ✅ COMPLETE