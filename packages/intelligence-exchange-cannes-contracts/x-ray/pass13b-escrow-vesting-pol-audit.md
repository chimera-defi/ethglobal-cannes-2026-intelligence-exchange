# Audit Pass 13B: TaskEscrow.sol + IntelVesting.sol + IntelPOLManager.sol

**Date:** 2026-05-30  
**Scope:** Full security audit of escrow, vesting, and POL management contracts  
**Agent:** Devin (SWE-1.6 Fast)

---

## TaskEscrow.sol

### CRITICAL

**C1: Escrow deadlock if IntelStaking depositYield fails**  
**Location:** Lines 204-216  
**Severity:** CRITICAL  

The `release()` function calls `staking.depositYield(stakerShare)` without error handling. If the staking contract is paused, upgraded, or the deposit fails for any reason, the entire release transaction reverts, leaving the escrow permanently locked. The worker cannot receive their share, the treasury cannot receive its share, and the funder cannot refund.

```solidity
// Lines 213-215
bool approveOk = intel.approve(address(staking), stakerShare);
require(approveOk, "TaskEscrow: release approve failed");
staking.depositYield(stakerShare); // No try/catch - if this fails, entire release reverts
```

**Recommendation:** Wrap the staking deposit in a try/catch block. If it fails, send the staker share to the treasury or a fallback address instead, or add a function to manually recover funds from stuck tasks.

---

### HIGH

**H1: Owner can drain escrow by setting workerBps=0 mid-task**  
**Location:** Lines 251-259  
**Severity:** HIGH  

The split basis points are owner-mutable and can be changed at any time, including while a task is in Funded state. A malicious owner could set `workerBps=0` immediately before calling `release()`, causing the entire task amount to go to staker + treasury instead of the worker.

```solidity
// Lines 251-259
function setSplitBps(uint256 _workerBps, uint256 _stakerBps, uint256 _treasuryBps) external onlyOwner {
    if (_workerBps + _stakerBps + _treasuryBps != BPS) revert InvalidSplit();
    workerBps = _workerBps;    // Can be set to 0 mid-task
    stakerBps = _stakerBps;
    treasuryBps = _treasuryBps;
}
```

**Recommendation:** Either lock the split BPS when a task is funded (snapshot the split at funding time), or add a timelock to split changes with a notification period.

---

**H2: No auto-release timeout - tasks can be permanently locked**  
**Location:** Lines 69-79, 195-225  
**Severity:** HIGH  

There is no time-based auto-release mechanism. If the operator (reviewer) disappears or refuses to call `release()`, a funded task can remain locked indefinitely. The funder can only refund after the 7-day window (line 233), but the worker has no recourse if the reviewer abandons the task after the refund window expires.

```solidity
// No timeout mechanism in release()
function release(bytes32 taskId, address worker) external onlyOperator nonReentrant {
    // No timestamp check for auto-release
    if (task.state != TaskState.Funded) revert TaskNotFunded();
    // ...
}
```

**Recommendation:** Add an auto-release timeout after which anyone can call release, or add an emergency escape hatch that allows the worker to claim funds after a prolonged inactivity period.

---

### MEDIUM

**M1: State machine allows rejected→accepted transition via worker reassignment**  
**Location:** Lines 169-189  
**Severity:** MEDIUM  

While there's no direct "rejected" state, the `setWorker()` and `clearWorker()` functions allow reassigning workers on a funded task. This could be abused to reassign a task from one worker to another without the original worker's consent, effectively creating a rejected→accepted transition.

```solidity
// Lines 169-177
function setWorker(bytes32 taskId, address worker) external onlyOperator {
    if (worker == address(0)) revert ZeroAddress();
    Task storage task = tasks[taskId];
    if (task.state != TaskState.Funded) revert TaskNotFunded();
    task.worker = worker;  // Can reassign arbitrarily
    emit WorkerAssigned(taskId, worker);
}
```

**Recommendation:** Add a check that `task.worker == address(0)` before allowing setWorker, or require the current worker's consent for reassignment.

---

**M2: No protection against staking contract upgrade/downgrade**  
**Location:** Line 56, 215  
**Severity:** MEDIUM  

The `IntelStaking` contract address is immutable (line 56), but the staking contract itself could be upgraded or its interface changed. The `depositYield()` call (line 215) assumes the staking contract maintains this interface. If the staking contract is upgraded to a version without `depositYield()`, TaskEscrow will break.

```solidity
// Line 56 - immutable but underlying contract can change
IntelStaking public immutable staking;

// Line 215 - assumes interface stability
staking.depositYield(stakerShare);
```

**Recommendation:** Consider adding a version check or interface verification, or allow the owner to update the staking address with a timelock.

---

### LOW

**L1: Zero-amount tasks are correctly blocked**  
**Location:** Line 146  
**Severity:** LOW - VALIDATED  

The contract correctly prevents zero-amount tasks with a check on line 146. This is not a vulnerability.

```solidity
if (amount == 0) revert ZeroAmount();
```

---

**L2: Reentrancy protection is present**  
**Location:** Lines 91-96, 195, 229  
**Severity:** LOW - VALIDATED  

Both `release()` and `refund()` use the `nonReentrant` modifier, providing protection against reentrancy attacks.

```solidity
modifier nonReentrant() {
    require(_reentrancyStatus != _ENTERED, "TaskEscrow: reentrant call");
    _reentrancyStatus = _ENTERED;
    _;
    _reentrancyStatus = _NOT_ENTERED;
}
```

---

## IntelVesting.sol

### CRITICAL

**C2: Cliff bypass possible via duration=0 and start=cliff**  
**Location:** Lines 78-85, 91-104  
**Severity:** CRITICAL  

The constructor validates that `duration > 0` (line 78), but does not validate the relationship between `_start` and `_cliffDelay`. If `_start` is set to a future timestamp and `_cliffDelay=0`, the cliff becomes that future timestamp. However, more critically, the `vestedAmount()` calculation (lines 91-104) has a edge case: if `duration` is very small (e.g., 1 second) and the beneficiary calls `release()` immediately after the cliff, they could withdraw the entire allocation almost instantly.

While duration=0 is blocked, duration=1 is allowed, which effectively creates a near-instant vesting after the cliff.

```solidity
// Line 78 - only checks duration != 0
if (_duration == 0) revert InvalidDuration();

// Lines 99-103 - no minimum duration check
uint256 elapsed = timestamp - cliff;
if (elapsed >= duration) {
    return totalAllocation;  // Full vesting if duration is tiny
}
```

**Recommendation:** Add a minimum duration check (e.g., 30 days) in the constructor to prevent near-instant vesting schedules.

---

### HIGH

**H3: Revocation race condition - treasury can call revoke() just before cliff**  
**Location:** Lines 134-149  
**Severity:** HIGH  

The `revoke()` function checks `block.timestamp >= cliff` (line 137). This creates a race condition where the treasury can call `revoke()` in the same block or millisecond before the cliff expires, clawing back all unvested tokens even though vesting is about to begin. Beneficiaries have no way to protect against this timing attack.

```solidity
// Line 137 - strict timestamp check allows race condition
if (block.timestamp >= cliff) revert RevocationLockedAfterCliff();
```

**Recommendation:** Add a buffer period (e.g., 1 hour) before the cliff during which revocation is disabled, or require a notice period before revocation takes effect.

---

### MEDIUM

**M3: Integer rounding favors beneficiary in edge cases**  
**Location:** Line 103  
**Severity:** MEDIUM  

The vesting calculation uses `(totalAllocation * elapsed) / duration`. This rounds down, which is generally safe. However, in the case of very small allocations or specific elapsed values, the beneficiary could receive slightly less than the mathematical exact amount due to rounding. While this is not an exploit, it could lead to dust accumulation.

```solidity
// Line 103 - rounds down
return (totalAllocation * elapsed) / duration;
```

**Recommendation:** Consider using a more precise calculation or allow the beneficiary to withdraw any remaining dust after full vesting period.

---

**M4: Access control for revoke() is treasury-only, not owner**  
**Location:** Line 135  
**Severity:** MEDIUM - DESIGN CHOICE  

The `revoke()` function can only be called by the `treasury` address (line 135), not the contract owner. This is a design choice that decentralizes control, but it means the contract owner cannot revoke if the treasury address is compromised or lost.

```solidity
// Line 135 - treasury-only, not owner
if (msg.sender != treasury) revert Unauthorized();
```

**Recommendation:** Document this design choice clearly, or consider adding owner as a fallback revoker with a timelock.

---

### LOW

**L3: No reentrancy protection on release()**  
**Location:** Lines 116-127  
**Severity:** LOW  

The `release()` function does not use a reentrancy guard. While the function is simple and doesn't perform external calls before updating state, a malicious token contract could potentially reenter during the `transfer()` call.

```solidity
// Lines 116-127 - no nonReentrant modifier
function release() external {
    uint256 amount = releasable();
    if (amount == 0) revert NothingToRelease();
    released += amount;  // State update before transfer - good
    bool ok = _transfer(token, beneficiary, amount);
    if (!ok) revert TransferFailed();
}
```

**Recommendation:** Consider adding a reentrancy guard for defense in depth, or document that the token contract must be trusted.

---

**L4: Zero duration is correctly blocked**  
**Location:** Line 78  
**Severity:** LOW - VALIDATED  

The constructor correctly rejects `duration=0` with an explicit check.

```solidity
if (_duration == 0) revert InvalidDuration();
```

---

## IntelPOLManager.sol

### HIGH

**H4: TWAP window can be set to 60 seconds, enabling manipulation**  
**Location:** Lines 245-249  
**Severity:** HIGH  

The `setTwapWindow()` function has a minimum of 60 seconds (line 246). A 60-second TWAP window is extremely short and can be easily manipulated by a large trade. The owner could set this to 60 seconds to manipulate price feeds for other contracts that rely on this TWAP.

```solidity
// Lines 245-249
function setTwapWindow(uint32 _twapWindow) external onlyOwner {
    if (_twapWindow < 60) revert InvalidParam();  // 60 seconds minimum is too short
    uint32 old = twapWindow;
    twapWindow = _twapWindow;
    emit TwapWindowUpdated(old, _twapWindow);
}
```

**Recommendation:** Increase the minimum TWAP window to at least 1800 seconds (30 minutes), or add a timelock to TWAP window changes.

---

**H5: UniV3 position NFT is not locked - owner can remove liquidity**  
**Location:** Lines 49-50, 173-200  
**Severity:** HIGH  

The Uniswap V3 position NFT token ID is stored in `positionTokenId` (lines 49-50), but there is no function to burn or transfer it. However, the owner could call the Uniswap position manager directly to decrease liquidity or collect fees, bypassing this contract's controls. The NFT is held by this contract, but the owner has no explicit function to remove liquidity, which is good - but the lack of explicit burn/transfer functions means the position could be orphaned if the contract needs to be upgraded.

```solidity
// Lines 49-50 - NFT is stored but not explicitly protected
uint256 public positionTokenId;

// Lines 173-200 - mint/increase liquidity, but no decrease/burn
if (positionTokenId == 0) {
    // mint new position
} else {
    // increase liquidity
}
```

**Recommendation:** Add explicit functions to decrease liquidity or burn the position with owner-only access, or document that the position is meant to be permanent.

---

### MEDIUM

**M5: Fee collection is owner-only with potential MEV risk**  
**Location:** Lines 218-230  
**Severity:** MEDIUM  

The `collectFees()` function is owner-only (line 218). This creates a MEV opportunity where an attacker could monitor the mempool for fee collection transactions and frontrun them to extract value. However, since the fees go to the contract itself and require a second transaction to withdraw, the risk is limited.

```solidity
// Line 218 - owner-only
function collectFees() external onlyOwner returns (uint256 amount0, uint256 amount1) {
```

**Recommendation:** Consider making fee collection permissionless, or add a delay/commit-reveal scheme for fee collection.

---

**M6: ETH withdrawal has reentrancy protection but uses call**  
**Location:** Lines 102-111  
**Severity:** MEDIUM  

The `withdrawEth()` function uses `nonReentrant` and uses `call` for the transfer (line 107). This is generally safe, but the reentrancy guard is protection against the recipient being a malicious contract that reenters during the ETH transfer.

```solidity
// Lines 102-111
function withdrawEth(address to, uint256 amount) external onlyOwner nonReentrant {
    if (to == address(0)) revert ZeroAddress();
    if (amount > address(this).balance)
        revert InsufficientBalance(address(this).balance, amount);
    (bool ok,) = to.call{value: amount}("");  // call allows reentrancy but guard prevents it
    if (!ok) revert TransferFailed();
}
```

**Recommendation:** Current implementation is safe with the nonReentrant guard. No action needed.

---

**M7: No rebalancing mechanism when price moves outside tick range**  
**Location:** Lines 138-213  
**Severity:** MEDIUM  

The `deployToUniV3()` function creates a concentrated liquidity position with specific tick bounds. If the price moves outside these bounds, the position stops earning fees. There is no rebalancing mechanism to adjust the tick range.

```solidity
// Lines 138-144 - tick range is set once
function deployToUniV3(
    address pool,
    uint256 intelAmount,
    uint256 ethAmount,
    int24 tickLower,  // Fixed at deployment
    int24 tickUpper   // Fixed at deployment
) external onlyOwner nonReentrant {
```

**Recommendation:** Add a function to rebalance the position by burning the old position and creating a new one with updated tick bounds, or document that manual intervention is required.

---

### LOW

**L5: Tick manipulation in _tickToPrice calculation**  
**Location:** Lines 325-338  
**Severity:** LOW  

The `_tickToPrice()` function performs manual tick-to-price conversion. If the tick is at extreme values, the calculation could overflow or produce incorrect prices. However, Uniswap V3 ticks are bounded to valid ranges, so this is unlikely in practice.

```solidity
// Lines 325-338
function _tickToPrice(int24 tick, bool intelIsToken0) internal pure returns (uint256) {
    uint160 sqrtPriceX96 = _getSqrtRatioAtTick(tick);
    uint256 priceX96 = uint256(sqrtPriceX96) * uint256(sqrtPriceX96);
    priceX96 = priceX96 >> 96;
    // ...
}
```

**Recommendation:** Add overflow checks or use Uniswap's library functions if available.

---

**L6: No check for WETH address validity beyond non-zero**  
**Location:** Line 87  
**Severity:** LOW  

The constructor only checks that the WETH address is non-zero (line 87). It does not verify that the address is actually a WETH contract or that it implements the deposit/withdraw functions.

```solidity
// Line 87 - only checks non-zero
if (_weth == address(0)) revert ZeroAddress();
```

**Recommendation:** Consider adding an interface check or verifying that the WETH contract has the expected functions.

---

## Summary

### Critical Issues: 2
- C1: TaskEscrow escrow deadlock if staking deposit fails
- C2: IntelVesting cliff bypass via tiny duration

### High Issues: 5
- H1: TaskEscrow owner can drain escrow by setting workerBps=0
- H2: TaskEscrow no auto-release timeout
- H3: IntelVesting revocation race condition
- H4: IntelPOLManager TWAP window can be set to 60 seconds
- H5: IntelPOLManager UniV3 position NFT not explicitly locked

### Medium Issues: 7
- M1: TaskEscrow worker reassignment allows rejected→accepted transition
- M2: TaskEscrow no protection against staking contract upgrade
- M3: IntelVesting integer rounding
- M4: IntelVesting revoke() is treasury-only
- M5: IntelPOLManager fee collection MEV risk
- M6: IntelPOLManager ETH withdrawal reentrancy (mitigated)
- M7: IntelPOLManager no rebalancing mechanism

### Low Issues: 6
- L1-L2: TaskEscrow validations (correctly implemented)
- L3-L4: IntelVesting design considerations
- L5-L6: IntelPOLManager edge cases

### Validated Controls: 3
- Zero-amount tasks blocked in TaskEscrow
- Reentrancy protection present in TaskEscrow
- Zero duration blocked in IntelVesting

**Overall Assessment:** The contracts have solid basic security controls but lack edge case handling for external dependency failures and timing-based attacks. The critical issues around staking deposit failures and vesting duration edge cases should be addressed before mainnet deployment.