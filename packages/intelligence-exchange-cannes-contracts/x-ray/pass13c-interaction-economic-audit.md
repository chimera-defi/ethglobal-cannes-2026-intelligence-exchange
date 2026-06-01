# Audit Pass 13C: Cross-Contract Interaction + Economic Attack Vectors

## Executive Summary

**Overall Risk Level: MEDIUM**

Identified 3 HIGH and 2 MEDIUM severity cross-contract interaction issues. The most critical finding is that slashed reviewers are not automatically removed from the review queue, allowing them to continue reviewing despite being ineligible. Additionally, the TaskEscrow release mechanism has no fallback if staking yield deposit fails, which could permanently lock worker funds.

## Findings

| Severity | Issue | Location | Impact |
|----------|-------|----------|--------|
| **HIGH** | Slashed reviewers not removed from review queue | ReviewerQueue.sol:294, ReviewerStakeManager.sol:233-254 | Slashed reviewers can still be assigned reviews despite being ineligible |
| **HIGH** | TaskEscrow release has no fallback if depositYield fails | TaskEscrow.sol:215, IntelStaking.sol:286 | Worker funds permanently locked if staking yield deposit reverts |
| **HIGH** | ReviewerQueue doesn't check eligibility before assignment | ReviewerQueue.sol:272-309 | Ineligible reviewers (including slashed) can be assigned if in eligible list |
| **MEDIUM** | consumeAllowance bypass protection incomplete | IntelStaking.sol:365, IntelMintController.sol:347 | Only operator protection; no additional checks |
| **MEDIUM** | Flow bonus gaming via micro-stake | IntelStaking.sol:208-213, 508-510 | Attackers can trigger bonus with minimal stake |

## Detailed Analysis

### 1. Staking → MintController Interaction

**Finding**: consumeAllowance is operator-only, preventing direct bypass
- **Evidence**: `consumeAllowance()` at <ref_snippet file="/home/agents/workspace/ethglobal-cannes-2026-intelligence-exchange/packages/intelligence-exchange-cannes-contracts/src/IntelStaking.sol" lines="365-375" /> has `onlyOperator` modifier
- **Status**: ✅ NOT VULNERABLE - Regular stakers cannot call directly

**Finding**: MintController checks allowance before consuming
- **Evidence**: `executeMintERC20()` at <ref_snippet file="/home/agents/workspace/ethglobal-cannes-2026-intelligence-exchange/packages/intelligence-exchange-cannes-contracts/src/IntelMintController.sol" lines="343-347" /> validates allowance via `mintAllowance()` before calling `consumeAllowance()`
- **Status**: ✅ NOT VULNERABLE - Proper validation in place

### 2. DisputeResolution → ReviewerStakeManager Slashing

**Finding**: Reviewer slash silently fails if bond already withdrawn
- **Evidence**: DisputeResolution slash attempts at <ref_snippet file="/home/agents/workspace/ethglobal-cannes-2026-intelligence-exchange/packages/intelligence-exchange-cannes-contracts/src/DisputeResolution.sol" lines="301-313" /> wrapped in try/catch; emits `SlashFailed` event but continues
- **Root Cause**: If reviewer unstakes before dispute resolves, `slash()` reverts with `InsufficientBond` at <ref_snippet file="/home/agents/workspace/ethglobal-cannes-2026-intelligence-exchange/packages/intelligence-exchange-cannes-contracts/src/ReviewerStakeManager.sol" lines="236-237" />
- **Impact**: Malicious reviewers can escape slashing by unstaking before dispute resolution
- **Severity**: HIGH

**Finding**: Slashed reviewers not removed from ReviewerQueue
- **Evidence**: ReviewerQueue assignment at <ref_snippet file="/home/agents/workspace/ethglobal-cannes-2026-intelligence-exchange/packages/intelligence-exchange-cannes-contracts/src/ReviewerQueue.sol" lines="294-295" /> only checks `reviewerBond()` for weight, NOT `isEligible()` for eligibility
- **Root Cause**: No integration between ReviewerStakeManager eligibility flag and ReviewerQueue assignment logic
- **Impact**: Slashed reviewers (with `eligibleReviewers[reviewer] = false`) can still be assigned reviews if they remain in the eligible reviewers list passed to `_selectReviewerForTask()`
- **Severity**: HIGH

### 3. TaskEscrow → IntelStaking Yield Routing

**Finding**: TaskEscrow release has no fallback if depositYield fails
- **Evidence**: `release()` at <ref_snippet file="/home/agents/workspace/ethglobal-cannes-2026-intelligence-exchange/packages/intelligence-exchange-cannes-contracts/src/TaskEscrow.sol" lines="212-215" /> calls `staking.depositYield(stakerShare)` without try/catch
- **Root Cause**: If `depositYield()` reverts (e.g., transfer failure, though pause doesn't affect it), the entire transaction reverts, permanently locking the worker's 81% share
- **Note**: `depositYield()` at <ref_snippet file="/home/agents/workspace/ethglobal-cannes-2026-intelligence-exchange/packages/intelligence-exchange-cannes-contracts/src/IntelStaking.sol" lines="286-291" /> lacks `whenNotPaused` modifier, so pause is not the failure mode
- **Impact**: Worker funds permanently locked if staking yield deposit fails for any reason
- **Severity**: HIGH

### 4. Economic Attack Vectors

**Finding**: Quality streak gaming - NOT IMPLEMENTED
- **Evidence**: No "streak" or "quality streak" logic found in contracts
- **Status**: ✅ NOT APPLICABLE - Feature not implemented

**Finding**: Poster rebate gaming - NOT IMPLEMENTED
- **Evidence**: No "rebate" logic found in contracts
- **Status**: ✅ NOT APPLICABLE - Feature not implemented

**Finding**: Flow bonus gaming via micro-stake
- **Evidence**: Flow bonus logic at <ref_snippet file="/home/agents/workspace/ethglobal-cannes-2026-intelligence-exchange/packages/intelligence-exchange-cannes-contracts/src/IntelStaking.sol" lines="208-213" /> tracks `epochNewStake`; bonus applied at <ref_snippet file="/home/agents/workspace/ethglobal-cannes-2026-intelligence-exchange/packages/intelligence-exchange-cannes-contracts/src/IntelStaking.sol" lines="508-510" /> if `epochNewStakeEpoch == currentEpoch && epochNewStake > 0`
- **Attack Vector**: Attacker stakes 1 wei to trigger `epochNewStakeEpoch = currentEpoch`, then stakes full amount in same epoch - both get the 15% bonus
- **Impact**: Bonus applied to entire stake in epoch, not just incremental new stake
- **Severity**: MEDIUM (economic inefficiency, not critical exploit)

**Finding**: LP mining front-running - NOT APPLICABLE
- **Evidence**: BuybackBurn at <ref_snippet file="/home/agents/workspace/ethglobal-cannes-2026-intelligence-exchange/packages/intelligence-exchange-cannes-contracts/src/BuybackBurn.sol" lines="184-195" /> sends rewards to separate `lpMiningAddress` contract, not to stakers
- **Status**: ✅ NOT APPLICABLE - LP mining is separate program, not tied to staking

## Recommendations

### Priority 1 (Critical)
1. **Auto-remove slashed reviewers from queue**: Add integration in ReviewerStakeManager.slash() to call ReviewerQueue removal, or have ReviewerQueue check `isEligible()` before assignment
2. **Add fallback to TaskEscrow.release()**: Wrap `depositYield()` in try/catch; if it fails, send staker share to treasury or hold in escrow contract

### Priority 2 (High)
3. **Add unstake lock during disputes**: Prevent reviewers from unstaking while they have pending disputes
4. **Improve flow bonus logic**: Apply bonus only to incremental new stake, not total stake in epoch

### Priority 3 (Medium)
5. **Add operator checks to consumeAllowance**: Consider additional caller validation beyond `onlyOperator`

## Test Cases for Verification

1. **Slashed reviewer assignment test**: Create reviewer, slash them, attempt to assign review via ReviewerQueue - should fail
2. **TaskEscrow fallback test**: Mock depositYield failure, verify release() doesn't lock worker funds
3. **Flow bonus micro-stake test**: Stake 1 wei, then large amount, verify bonus doesn't apply to full amount
4. **Dispute unstake timing test**: Create dispute, try to unstake reviewer bond before resolution - should fail