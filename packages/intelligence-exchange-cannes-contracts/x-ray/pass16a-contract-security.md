# Smart Contract Security Audit — PASS 16A

## Scope: Contract Security Review (22 contracts)

**Auditor:** Devin (delegated)
**Date:** 2026-06-01
**Commit:** HEAD

---

## Summary Table

| ID | Severity | Contract | Finding | Status |
|---|---|---|---|---|
| P16A-1 | **HIGH** | BuybackBurn | Slippage check after swap enables sandwich attacks | Unfixed |
| P16A-2 | **MEDIUM** | IntelMintController | TWAP deviation check disabled by default | Unfixed |
| P16A-3 | **MEDIUM** | IntelMintController | Manual TWAP update bypasses oracle security | Unfixed |
| P16A-4 | **MEDIUM** | ReviewerStakeManager | No slash lock enables unstake race condition | Unfixed |
| P16A-5 | **LOW** | DisputeResolution | Jury reward distribution loses dust to rounding | Unfixed |
| P16A-6 | **INFO** | IdeaEscrow | CEI fix verified - correctly implemented | Fixed |
| P16A-7 | **INFO** | CategoryRegistry | Weight-update fix verified - correctly implemented | Fixed |
| P16A-8 | **INFO** | WorkerStakeManager | Slash lock mechanism verified - correctly implemented | Fixed |

---

## HIGH

### P16A-1 [HIGH] — BuybackBurn Slippage Check After Swap Enables Sandwich Attacks

**Location:** `BuybackBurn.sol`, `executeBuyback()` (lines 177-181)

**Description:**
The contract calculates the minimum INTEL output based on TWAP and max slippage BEFORE the swap (lines 157-158), but performs the slippage verification check AFTER the swap completes (lines 178-181). This enables sandwich attacks where an attacker can:

1. Front-run the buyback transaction to manipulate the spot price
2. The swap executes at the manipulated price
3. The post-swap slippage check passes because the manipulated spot price is within tolerance
4. The attacker back-runs to profit from the price movement

The vulnerability exists because the slippage check validates the executed swap rather than constraining the swap execution itself.

**Code:**
```solidity
// Lines 157-158: Pre-swap calculation
uint256 minIntelOut = (ethBalance * 1e18) / twap;
minIntelOut = (minIntelOut * (BPS - maxSlippageBps)) / BPS;

// Line 172: Swap executes without slippage constraint
uint256 intelReceived = swapRouter.exactInputSingle(params);

// Lines 178-181: Post-swap verification (too late)
uint256 spotPrice = (ethBalance * 1e18) / intelReceived;
if (_checkSlippageExceeded(spotPrice, twap, maxSlippageBps)) {
    revert SlippageExceeded(spotPrice, twap, maxSlippageBps);
}
```

**Impact:**
- Attackers can sandwich buyback transactions to extract value
- LP mining rewards can be drained via price manipulation
- Treasury buyback efficiency is compromised
- Economic loss to protocol and LP miners

**PoC:**
```solidity
// Attacker observes pending buyback transaction
// 1. Front-run: Buy INTEL on DEX to pump price
// 2. Buyback executes: Receives fewer INTEL due to higher price
// 3. Post-swap check: Passes because spot is within slippage of (manipulated) TWAP
// 4. Back-run: Sell INTEL to profit from price movement
```

**Recommendation:**
Move slippage protection to the swap execution itself using `amountOutMinimum`:

```solidity
// Calculate minimum output with slippage protection
uint256 minIntelOut = (ethBalance * 1e18) / twap;
minIntelOut = (minIntelOut * (BPS - maxSlippageBps)) / BPS;

// Execute swap with built-in slippage protection
ISwapRouter.ExactInputSingleParams memory params = ISwapRouter.ExactInputSingleParams({
    tokenIn: tokenIn,
    tokenOut: tokenOut,
    fee: POOL_FEE,
    recipient: address(this),
    deadline: block.timestamp + 900,
    amountIn: ethBalance,
    amountOutMinimum: minIntelOut, // This enforces slippage at swap time
    sqrtPriceLimitX96: 0
});

uint256 intelReceived = swapRouter.exactInputSingle(params);

// Remove post-swap slippage check (now redundant)
// The swap will revert if slippage exceeded
```

---

## MEDIUM

### P16A-2 [MEDIUM] — IntelMintController TWAP Deviation Check Disabled by Default

**Location:** `IntelMintController.sol`, lines 143-154, 275-284

**Description:**
The contract includes a TWAP deviation circuit breaker (`_checkTwapDeviation()`) that prevents minting when TWAP appears manipulated (extremely low relative to floor price). However, this critical security feature is **disabled by default** (`twapDeviationPauseEnabled = false` at line 154). This means:

1. Manual or automated TWAP updates can set arbitrarily low values
2. No validation prevents TWAP from being set below floor price
3. Attackers can manipulate mint pricing by controlling operator keys
4. The circuit breaker exists but is not active unless explicitly enabled

**Code:**
```solidity
// Line 154: Disabled by default
bool public twapDeviationPauseEnabled = false;

// Lines 275-284: Check is skipped when disabled
function _checkTwapDeviation() internal view {
    if (!twapDeviationPauseEnabled) return; // Always returns by default
    if (twap == 0) return;

    if (floorPrice > 0 && twap < (floorPrice * (BPS - maxTwapDeviationBps)) / BPS) {
        revert TwapDeviationTooLarge(twap, floorPrice);
    }
}
```

**Impact:**
- Operator compromise allows arbitrary TWAP manipulation
- Mint pricing can be manipulated to favor attackers
- Protocol economic security depends on operator key security
- Existing circuit breaker provides false sense of security

**Recommendation:**
Enable TWAP deviation check by default and add a timelock for disabling:

```solidity
// Enable by default in constructor
twapDeviationPauseEnabled = true;

// Add timelock for disabling
uint256 public deviationPauseTimelock;
uint256 public constant DEVIATION_PAUSE_TIMELOCK = 7 days;

function disableTwapDeviationCheck() external onlyOwner {
    deviationPauseTimelock = block.timestamp + DEVIATION_PAUSE_TIMELOCK;
}

function commitDisableTwapDeviationCheck() external onlyOwner {
    require(block.timestamp >= deviationPauseTimelock, "timelock not expired");
    twapDeviationPauseEnabled = false;
    deviationPauseTimelock = 0;
}
```

### P16A-3 [MEDIUM] — IntelMintController Manual TWAP Update Bypasses Oracle Security

**Location:** `IntelMintController.sol`, `updateTWAP()` (lines 374-379)

**Description:**
The `updateTWAP()` function allows operators to manually set TWAP values without any validation beyond `> 0`. This manual update path completely bypasses the Uniswap V3 oracle security model. While `pullTWAP()` exists for automated oracle updates, the manual path has no:

1. Maximum deviation check from previous TWAP
2. Timestamp validation (prevents stale data)
3. Cross-reference with external price feeds
4. Rate limiting on TWAP changes

An operator can set TWAP to any value, enabling price manipulation attacks.

**Code:**
```solidity
function updateTWAP(uint256 newTWAP) external onlyOperator {
    if (newTWAP == 0) revert ZeroAmount();
    twap = newTWAP;
    twapUpdatedAt = block.timestamp;
    emit TWAPUpdated(newTWAP, block.timestamp);
}
```

**Impact:**
- Operator can set TWAP to arbitrarily low values to enable cheap minting
- Operator can set TWAP to arbitrarily high values to discourage minting
- No safeguards against operator key compromise
- Undermines the purpose of oracle-based pricing

**Recommendation:**
Add validation constraints to manual TWAP updates:

```solidity
function updateTWAP(uint256 newTWAP) external onlyOperator {
    if (newTWAP == 0) revert ZeroAmount();

    // Validate deviation from floor price
    if (floorPrice > 0) {
        if (newTWAP < floorPrice) {
            // Allow manual override but with stricter deviation check
            uint256 maxDeviation = (floorPrice * (BPS - maxTwapDeviationBps)) / BPS;
            if (newTWAP < maxDeviation) revert TwapDeviationTooLarge(newTWAP, floorPrice);
        }
    }

    // Validate deviation from previous TWAP (prevent sudden jumps)
    if (twap > 0) {
        uint256 deviation;
        if (newTWAP > twap) {
            deviation = ((newTWAP - twap) * BPS) / twap;
        } else {
            deviation = ((twap - newTWAP) * BPS) / twap;
        }
        if (deviation > 5000) revert InvalidParam(); // Max 50% change per update
    }

    twap = newTWAP;
    twapUpdatedAt = block.timestamp;
    emit TWAPUpdated(newTWAP, block.timestamp);
}
```

### P16A-4 [MEDIUM] — ReviewerStakeManager No Slash Lock Enables Unstake Race Condition

**Location:** `ReviewerStakeManager.sol`, `slash()` (lines 242-270), `requestUnstake()` (lines 149-165)

**Description:**
Unlike `WorkerStakeManager` which implements a slash lock mechanism (`slashLockUntil` mapping with 1-hour window, see WorkerStakeManager.sol lines 74-75, 158, 170, 234), `ReviewerStakeManager` has no such protection. A reviewer can:

1. Commit fraud on a review
2. Immediately call `requestUnstake()` to move bond to pending
3. Wait for cooldown (30 days) then call `finalizeUnstake()`
4. If the slash transaction arrives after unstake finalization, the reviewer escapes with their bond

The contract attempts to remove the reviewer from `ReviewerQueue` on slash (lines 254-259), but this is a best-effort operation wrapped in try-catch and does not prevent the unstake itself.

**Code:**
```solidity
// ReviewerStakeManager - no slash lock
function requestUnstake(uint256 amount) external nonReentrant {
    if (amount == 0) revert ZeroAmount();
    if (reviewerBond[msg.sender] < amount) revert InsufficientBond();

    uint256 oldBond = reviewerBond[msg.sender];
    reviewerBond[msg.sender] -= amount;
    pendingUnstake[msg.sender] += amount;
    unstakeAvailableAt[msg.sender] = block.timestamp + unstakeCooldown;
    // No slashLockUntil set here
}

function slash(address reviewer, uint256 amount) external onlyOperator {
    // ...
    reviewerBond[reviewer] -= amount;
    // No slash lock extension
}
```

**Contrast with WorkerStakeManager (correct implementation):**
```solidity
// WorkerStakeManager - has slash lock
function requestUnstake(uint256 amount) external nonReentrant {
    // ...
    slashLockUntil[msg.sender] = block.timestamp + SLASH_LOCK_WINDOW;
}

function slash(address worker, uint256 amount, address reporter) external onlyOperator nonReentrant {
    // ...
    slashLockUntil[worker] = block.timestamp + SLASH_LOCK_WINDOW;
}

function finalizeUnstake() external nonReentrant {
    // ...
    require(block.timestamp >= slashLockUntil[msg.sender], "WorkerStakeManager: slash lock active");
}
```

**Impact:**
- Fraudulent reviewers can escape slashing by timing unstake transactions
- Economic security of reviewer bond mechanism is compromised
- Requires operators to slash immediately before reviewer unstakes
- Inconsistent security model between worker and reviewer stake managers

**Recommendation:**
Add slash lock mechanism to ReviewerStakeManager:

```solidity
// Add to storage
mapping(address => uint256) public slashLockUntil;
uint256 public constant SLASH_LOCK_WINDOW = 1 hours;

// Update requestUnstake
function requestUnstake(uint256 amount) external nonReentrant {
    if (amount == 0) revert ZeroAmount();
    if (reviewerBond[msg.sender] < amount) revert InsufficientBond();

    uint256 oldBond = reviewerBond[msg.sender];
    reviewerBond[msg.sender] -= amount;
    pendingUnstake[msg.sender] += amount;
    unstakeAvailableAt[msg.sender] = block.timestamp + unstakeCooldown;
    slashLockUntil[msg.sender] = block.timestamp + SLASH_LOCK_WINDOW; // Add this

    emit UnstakeRequested(msg.sender, amount, unstakeAvailableAt[msg.sender]);
    emit BondUpdated(msg.sender, oldBond, reviewerBond[msg.sender]);
}

// Update finalizeUnstake
function finalizeUnstake() external nonReentrant {
    if (pendingUnstake[msg.sender] == 0) revert NoPendingUnstake();
    if (block.timestamp < unstakeAvailableAt[msg.sender]) {
        revert CooldownActive(unstakeAvailableAt[msg.sender]);
    }
    require(block.timestamp >= slashLockUntil[msg.sender], "ReviewerStakeManager: slash lock active"); // Add this

    // ... rest of function
}

// Update slash
function slash(address reviewer, uint256 amount) external onlyOperator {
    // ...
    reviewerBond[reviewer] -= amount;
    slashLockUntil[reviewer] = block.timestamp + SLASH_LOCK_WINDOW; // Add this

    // ... rest of function
}
```

---

## LOW

### P16A-5 [LOW] — DisputeResolution Jury Reward Distribution Loses Dust to Rounding

**Location:** `DisputeResolution.sol`, `_rewardJurors()` (lines 397-425)

**Description:**
The jury reward distribution uses integer division `dispute.bond / correctVotes` (line 404), which can result in dust loss due to rounding. For example:

- Dispute bond: 100 INTEL
- Correct votes: 3
- Reward per juror: 100 / 3 = 33 INTEL each
- Total distributed: 33 * 3 = 99 INTEL
- Dust lost: 1 INTEL

This dust remains in the contract permanently with no recovery mechanism.

**Code:**
```solidity
function _rewardJurors(uint256 disputeId, bool rewardUpholdVoters) private {
    Dispute storage dispute = disputes[disputeId];

    uint256 correctVotes = rewardUpholdVoters ? dispute.votesUphold : dispute.votesReject;
    if (correctVotes == 0) return;

    uint256 rewardPerJuror = dispute.bond / correctVotes; // Rounding loss here

    for (uint256 i = 0; i < dispute.jury.length; i++) {
        // ... transfer rewardPerJuror to each juror
    }
    // Dust remains in contract
}
```

**Impact:**
- Minor economic loss to jurors over time
- Dust accumulates in contract with no recovery path
- Unfair reward distribution when bond not evenly divisible

**Recommendation:**
Distribute rewards sequentially to ensure full bond distribution:

```solidity
function _rewardJurors(uint256 disputeId, bool rewardUpholdVoters) private {
    Dispute storage dispute = disputes[disputeId];

    uint256 correctVotes = rewardUpholdVoters ? dispute.votesUphold : dispute.votesReject;
    if (correctVotes == 0) return;

    uint256 remainingBond = dispute.bond;

    for (uint256 i = 0; i < dispute.jury.length; i++) {
        address juror = dispute.jury[i];
        bool votedCorrectly = /* ... */;

        if (votedCorrectly) {
            // Give each juror their share, last juror gets remainder
            uint256 reward = (i == dispute.jury.length - 1) ? remainingBond : (dispute.bond / correctVotes);
            remainingBond -= reward;

            bool transferOk = intel.transfer(juror, reward);
            if (transferOk) {
                emit JurorRewarded(disputeId, juror, reward);
            }
        }
    }
}
```

---

## INFO

### P16A-6 [INFO] — IdeaEscrow CEI Fix Verified

**Location:** `IdeaEscrow.sol`, `fundIdea()` (lines 88-104)

**Description:**
The CEI (Check-Effects-Interactions) fix from pass-15 has been correctly implemented. The function now:

1. **Check**: Validates amount and checks if idea already funded (lines 89-90)
2. **Effects**: Writes state before external call (lines 92-98)
3. **Interactions**: Performs external `transferFrom` last (lines 100-101)

This prevents reentrancy attacks where a malicious token could re-enter `fundIdea` during the transfer callback.

**Code:**
```solidity
function fundIdea(bytes32 ideaId, address token, uint256 amount) external {
    if (amount == 0) revert ZeroAmount();
    if (ideas[ideaId].exists) revert IdeaAlreadyFunded(ideaId); // Check

    ideas[ideaId] = IdeaFund({ // Effects (state write before external call)
        poster: msg.sender,
        token: token,
        totalFunded: amount,
        available: amount,
        exists: true
    });

    bool ok = IERC20(token).transferFrom(msg.sender, address(this), amount); // Interactions
    if (!ok) revert TransferFailed();

    emit IdeaFunded(ideaId, msg.sender, token, amount);
}
```

**Status:** ✅ Fixed correctly

### P16A-7 [INFO] — CategoryRegistry Weight-Update Fix Verified

**Location:** `CategoryRegistry.sol`, `setCategoryWeight()` (lines 198-257)

**Description:**
The weight-update fix from pass 15A-3 has been correctly implemented. When a category has 10000 bps (all weight), the function now:

1. Detects `oldRemainingWeight == 0` (line 209)
2. Distributes `remainingWeight` evenly across 5 other categories (lines 232-240)
3. Adds rounding remainder to first non-target category (lines 242-246)

This resolves the dead-end issue where reducing a 10000 bps category would revert.

**Code:**
```solidity
if (oldRemainingWeight > 0) {
    // ... proportional rebalancing ...
} else {
    // When target category has ALL the weight (10000 bps), distribute evenly
    uint256 distributedWeight;
    uint256 evenShare = remainingWeight / 5; // 5 other categories
    for (uint256 i = 0; i < 6; i++) {
        if (i != category) {
            categories[i].rewardWeightBps = evenShare;
            distributedWeight += evenShare;
        }
    }
    // Add remainder to first non-target category
    if (distributedWeight < remainingWeight) {
        uint256 remainder = remainingWeight - distributedWeight;
        uint256 firstNonTarget = (category == 0) ? 1 : 0;
        categories[firstNonTarget].rewardWeightBps += remainder;
    }
}
```

**Status:** ✅ Fixed correctly

### P16A-8 [INFO] — WorkerStakeManager Slash Lock Mechanism Verified

**Location:** `WorkerStakeManager.sol`, lines 74-75, 148-161, 164-183, 208-252

**Description:**
The slash lock mechanism from pass 15B-M2 has been correctly implemented. The contract:

1. Sets `slashLockUntil` on `requestUnstake()` (line 158)
2. Validates slash lock in `finalizeUnstake()` (line 170)
3. Extends slash lock on `slash()` (line 234)
4. Uses 1-hour lock window (line 75)

This prevents workers from evading slashing by timing unstake transactions.

**Code:**
```solidity
mapping(address => uint256) public slashLockUntil;
uint256 public constant SLASH_LOCK_WINDOW = 1 hours;

function requestUnstake(uint256 amount) external nonReentrant {
    // ...
    slashLockUntil[msg.sender] = block.timestamp + SLASH_LOCK_WINDOW;
}

function finalizeUnstake() external nonReentrant {
    // ...
    require(block.timestamp >= slashLockUntil[msg.sender], "WorkerStakeManager: slash lock active");
}

function slash(address worker, uint256 amount, address reporter) external onlyOperator nonReentrant {
    // ...
    slashLockUntil[worker] = block.timestamp + SLASH_LOCK_WINDOW;
}
```

**Status:** ✅ Implemented correctly

---

## Cross-Contract Trust Analysis

### Trust Relationships

1. **TaskEscrow → IntelStaking**: Calls `depositYield()` with try-catch fallback to treasury (lines 234-241). Safe due to fallback logic.

2. **DisputeResolution → ReviewerStakeManager**: Calls `slash()` with try-catch (lines 301-314). Safe due to error handling and event emission.

3. **DisputeResolution → WorkerStakeManager**: Calls `slash()` with try-catch (lines 324-330). Safe due to error handling and event emission.

4. **BuybackBurn → LiquidityMining**: Calls `depositRewards()` with try-catch (lines 188-194). Safe due to approval zeroing on failure and recovery function.

5. **ReviewerStakeManager → ReviewerQueue**: Calls `removeEligibleReviewer()` with try-catch (lines 255-259). Safe due to event emission on failure.

### No Critical Cross-Contract Vulnerabilities Found

- All cross-contract calls use try-catch with appropriate fallback logic
- No reentrancy paths between target contracts
- Trust model is centralized around owner/operator addresses (documented in pass 15B)

---

## Conclusion

Pass 16A identified:
- **1 HIGH severity** issue: BuybackBurn slippage check timing enables sandwich attacks
- **3 MEDIUM severity** issues: TWAP deviation check disabled, manual TWAP bypass, reviewer slash lock missing
- **1 LOW severity** issue: Jury reward dust loss
- **3 INFO findings** verifying pass-15 fixes are correctly implemented

The primary security concerns are:
1. **Slippage protection timing** in BuybackBurn (HIGH) - allows sandwich attacks
2. **TWAP manipulation vectors** in IntelMintController (MEDIUM) - disabled circuit breaker and manual override
3. **Inconsistent slash protection** between WorkerStakeManager and ReviewerStakeManager (MEDIUM)

All pass-15 fixes (IdeaEscrow CEI, CategoryRegistry weight update, WorkerStakeManager slash lock) have been verified as correctly implemented.