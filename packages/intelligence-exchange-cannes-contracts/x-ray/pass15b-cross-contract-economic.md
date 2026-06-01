# PASS 15B: Cross-Contract Economic Audit

## Summary Table

| Severity | Count | Finding |
|----------|-------|---------|
| HIGH | 1 | BuybackBurn → LiquidityMining: Reward Draining via Failed Deposit |
| MEDIUM | 2 | EpochRewardDistributor: Treasury Drain via Zero Pool, WorkerStakeManager: Slash Race Condition |
| LOW | 2 | ReviewerStakeManager: Queue Removal Failure, LiquidityMining: Reward Rate Manipulation |
| INFO | 1 | Cross-Contract Trust Model Analysis |

---

## HIGH

### H1: BuybackBurn → LiquidityMining: Reward Draining via Failed Deposit

**Description:**
BuybackBurn routes 20% of buyback proceeds to LiquidityMining via `depositRewards()` (line 188). The call is wrapped in try-catch, but if it fails, the approval is zeroed (line 192) and the tokens remain in BuybackBurn. However, there is no mechanism to recover these tokens or retry the deposit. An attacker who can cause `depositRewards()` to fail repeatedly can trap INTEL in BuybackBurn, effectively draining the LP mining rewards.

**Impact:**
- LP mining rewards permanently trapped in BuybackBurn
- Economic loss to LP miners
- No recovery path for trapped tokens

**PoC:**
```solidity
// Attacker causes depositRewards to fail by:
// 1. Front-running to make LiquidityMining.sol non-reentrant
// 2. Causing IntelToken transfer to fail (e.g., insufficient balance in LiquidityMining)
// 3. Making lpMiningAddress point to a malicious contract that reverts

// Result: miningShare INTEL trapped in BuybackBurn forever
```

**Evidence:**
- BuybackBurn.sol:188-193 - try-catch with approval zeroing on failure
- BuybackBurn.sol:196 - burns remaining INTEL without handling trapped mining share

**Recommendation:**
Add a recovery function for trapped LP mining rewards:
```solidity
function recoverTrappedMiningRewards() external onlyOwner {
    if (lpMiningAddress != address(0)) {
        uint256 balance = intel.balanceOf(address(this));
        if (balance > 0) {
            intel.approve(lpMiningAddress, balance);
            try ILiquidityMining(lpMiningAddress).depositRewards(balance) {
                // Success
            } catch {
                intel.approve(lpMiningAddress, 0);
                // Transfer to treasury as fallback
                intel.transfer(treasury, balance);
            }
        }
    }
}
```

---

## MEDIUM

### M1: EpochRewardDistributor: Treasury Drain via Zero Pool

**Description:**
`distributeEpochRewards()` transfers `epochRewardPool` from treasury to the contract (line 190) before calculating rewards. If `epochRewardPool` is set to 0 by owner, or if treasury has insufficient balance, the transfer fails and reverts. However, there is no check that `epochRewardPool > 0` before executing the transfer. A malicious owner could set `epochRewardPool` to an extremely high value, causing the treasury to drain all INTEL, or set it to 0 to brick reward distribution.

**Impact:**
- Treasury can be drained by setting excessive pool size
- Reward distribution can be bricked by setting pool to 0
- Economic attack surface via owner key compromise

**Evidence:**
- EpochRewardDistributor.sol:187-190 - pool transfer without balance check
- EpochRewardDistributor.sol:259-262 - owner can set arbitrary pool size

**Recommendation:**
Add pool size validation and treasury balance check:
```solidity
function distributeEpochRewards(uint256 epoch) external onlyOperator nonReentrant {
    // ... existing checks ...
    
    uint256 pool = epochRewardPool;
    require(pool > 0, "EpochRewardDistributor: pool is zero");
    require(intel.balanceOf(treasury) >= pool, "EpochRewardDistributor: insufficient treasury balance");
    
    intel.transferFrom(treasury, address(this), pool);
    // ... rest of function ...
}
```

### M2: WorkerStakeManager: Slash Race Condition

**Description:**
`slash()` deducts from `workerStake` first, then `pendingUnstake` (lines 222-228). However, a worker could call `requestUnstake()` and `finalizeUnstake()` in the same block as a slash, racing to withdraw their stake before the slash executes. Since `slash()` checks `workerStake + pendingUnstake` (line 213), but deducts sequentially, a worker who unstakes exactly their full stake could evade slashing if they win the race.

**Impact:**
- Workers can evade slashing by timing unstake transactions
- Economic security of stake mechanism compromised
- Fraudulent workers can escape consequences

**PoC:**
```solidity
// Worker has 1000 INTEL staked
// Worker calls requestUnstake(1000) - moves to pendingUnstake
// Worker calls finalizeUnstake() in same block
// Operator calls slash(worker, 1000) in same block
// If finalizeUnstake executes first, worker receives 1000 INTEL
// slash() then sees workerStake + pendingUnstake = 0, reverts
```

**Evidence:**
- WorkerStakeManager.sol:213 - checks combined balance
- WorkerStakeManager.sol:222-228 - deducts sequentially
- WorkerStakeManager.sol:161-179 - unstake finalization transfers tokens

**Recommendation:**
Add a slash lockout period during unstake:
```solidity
mapping(address => uint256) public slashLockUntil;

function requestUnstake(uint256 amount) external nonReentrant {
    // ... existing logic ...
    slashLockUntil[msg.sender] = block.timestamp + 1 hours; // 1 hour slash protection
}

function finalizeUnstake() external nonReentrant {
    require(block.timestamp >= slashLockUntil[msg.sender], "WorkerStakeManager: slash lock active");
    // ... rest of function ...
}

function slash(address worker, uint256 amount, address reporter) external onlyOperator nonReentrant {
    // ... existing logic ...
    slashLockUntil[worker] = block.timestamp + 1 hours; // Extend lock on slash
}
```

---

## LOW

### L1: ReviewerStakeManager: Queue Removal Failure

**Description:**
When a reviewer is slashed below the minimum bond, the contract attempts to remove them from ReviewerQueue via `removeEligibleReviewer()` (line 255). This call is wrapped in try-catch with silent failure. If the ReviewerQueue contract is upgraded or the call fails for any reason, the reviewer remains in the queue despite being ineligible, creating a state inconsistency.

**Impact:**
- State inconsistency between ReviewerStakeManager and ReviewerQueue
- Ineligible reviewers may still be assigned tasks
- Requires manual intervention to resolve

**Evidence:**
- ReviewerStakeManager.sol:254-256 - silent failure on queue removal

**Recommendation:**
Emit an event on queue removal failure for monitoring:
```solidity
if (address(reviewerQueue) != address(0)) {
    try reviewerQueue.removeEligibleReviewer(reviewer) {
        // Success
    } catch {
        emit QueueRemovalFailed(reviewer, "removeEligibleReviewer call failed");
    }
}
```

### L2: LiquidityMining: Reward Rate Manipulation

**Description:**
`setRewardRate()` can be called by owner at any time, even during an active reward period (line 151-157). While there is a check that rate cannot be zero during active period, there is no constraint on how high the rate can be set. A malicious owner could set an extremely high rate, causing the `miningPool` to drain rapidly, or set it to zero to brick reward distribution.

**Impact:**
- Reward distribution can be manipulated by owner
- Mining pool can be drained unexpectedly
- LP miners may receive incorrect rewards

**Evidence:**
- LiquidityMining.sol:151-157 - owner can set arbitrary rate
- LiquidityMining.sol:211-218 - high rate drains pool faster

**Recommendation:**
Add rate change constraints and timelock:
```solidity
uint256 public pendingRewardRate;
uint256 public rateChangeTimelock;

function setRewardRate(uint256 rate) external onlyOwner {
    require(rate == 0 || rewardEndTime == 0 || block.timestamp >= rateChangeTimelock, "rate change timelock active");
    pendingRewardRate = rate;
    rateChangeTimelock = block.timestamp + 2 days;
}

function commitRewardRate() external onlyOwner {
    require(block.timestamp >= rateChangeTimelock, "timelock not expired");
    require(pendingRewardRate > 0 || rewardEndTime == 0, "rate cannot be zero during active period");
    uint256 oldRate = rewardRate;
    rewardRate = pendingRewardRate;
    emit RewardRateUpdated(oldRate, rewardRate);
    pendingRewardRate = 0;
}
```

---

## INFO

### I1: Cross-Contract Trust Model Analysis

**Description:**
The cross-contract trust model is as follows:

1. **BuybackBurn → LiquidityMining**: BuybackBurn trusts LiquidityMining via `lpMiningAddress`. Owner sets this address. If set to malicious contract, it could drain mining rewards or cause reentrancy.

2. **ReviewerStakeManager → ReviewerQueue**: ReviewerStakeManager calls `removeEligibleReviewer()` on ReviewerQueue. Owner sets this address. Malicious queue could revert or misbehave.

3. **All contracts → IntelToken**: All contracts trust IntelToken for transfers. Standard ERC20, no special trust concerns.

4. **All contracts → Operators**: Each contract has operator permissions set by owner. Operator compromise affects all contracts simultaneously.

5. **No cross-calls between target contracts**: LiquidityMining, EpochRewardDistributor, WorkerStakeManager do not call each other. Economic isolation is good.

**Impact:**
- Trust model is centralized around owner and operator addresses
- Cross-contract attacks limited to address configuration
- No direct reentrancy paths between target contracts

**Evidence:**
- BuybackBurn.sol:67-68, 256-262 - lpMiningAddress configuration
- ReviewerStakeManager.sol:64, 326-329 - reviewerQueue configuration
- All contracts: operator mapping set by owner

**Recommendation:**
- Implement timelock for address configuration changes
- Add multisig requirement for owner operations
- Consider cross-contract reentrancy guards if future integrations are added

---

## Conclusion

The cross-contract economic analysis reveals:
- **1 HIGH severity** issue regarding trapped LP mining rewards
- **2 MEDIUM severity** issues regarding treasury drain and slash race conditions
- **2 LOW severity** issues regarding state consistency and reward manipulation
- **1 INFO** finding documenting the trust model

The primary economic attack surface is through owner/operator key compromise and the lack of recovery mechanisms for failed cross-contract calls. Implementing the recommended mitigations will significantly improve the economic security of the protocol.