# Audit Pass 11: IntelMintController.sol + DisputeResolution.sol State Machine + Replay Protection

**Date:** 2026-05-30  
**Scope:** IntelMintController.sol, DisputeResolution.sol, AgentIdentityRegistry.sol (ECDSA section only)  
**Agent:** Devin (SWE-1.6 Fast)

## Executive Summary

This audit pass examined the IntelMintController pricing mechanics, DisputeResolution state machine, and AgentIdentityRegistry ECDSA replay protection. Found **3 HIGH**, **3 MEDIUM**, and **2 LOW** severity issues.

## Findings

| Severity | Count | Issues |
|----------|-------|--------|
| CRITICAL | 0 | - |
| HIGH | 3 | Utilization multiplier manipulation, Routing address instant update, No task finalization check |
| MEDIUM | 3 | Price slippage between quote/execution, Incomplete slashing protection, Dispute griefing vector |
| LOW | 2 | Pause front-running, Limited replay protection |

---

## IntelMintController.sol

### HIGH: Utilization multiplier manipulation by operator

**Location:** `updateUtilization()` (lines 450-465)

**Finding:** The `updateUtilization()` function allows operators to arbitrarily set `_pendingVolume` and `_settledCapacity` with no validation. The multiplier is calculated as `(_pendingVolume * BPS) / _settledCapacity` and clamped to [1x, 3x]. A malicious operator can spike the multiplier to 3x by setting high pending volume or low settled capacity, making minting expensive for all users.

**Evidence:** Lines 450-465 show no validation of the input parameters beyond non-zero checks. The clamping to 3x provides a bound but still allows significant manipulation.

```
function updateUtilization(uint256 _pendingVolume, uint256 _settledCapacity) external onlyOperator {
    pendingTaskVolume = _pendingVolume;
    settledCapacity = _settledCapacity;
    // ... multiplier calculation with no input validation
}
```

**Recommendation:** Add validation to ensure utilization changes are within reasonable bounds relative to previous values, or implement a timelock/delay for utilization changes.

---

### HIGH: Routing addresses upgradable without timelock

**Location:** `setRoutingAddresses()` (lines 499-504)

**Finding:** The `setRoutingAddresses()` function allows the owner to instantly update `polAddress` (50% of mint proceeds) and `treasuryAddress` (5% of mint proceeds) without any timelock or delay. The owner can redirect all future mint proceeds to any address immediately.

**Evidence:** Lines 499-504 show instant update with no timelock:

```
function setRoutingAddresses(address _pol, address _treasury) external onlyOwner {
    if (_pol == address(0) || _treasury == address(0)) revert ZeroAddress();
    polAddress = _pol;
    treasuryAddress = _treasury;
    emit RoutingAddressesUpdated(_pol, _treasury);
}
```

**Recommendation:** Implement a timelock (e.g., 48 hours) for routing address changes, or use a multi-sig for owner operations.

---

### MEDIUM: Price slippage between quoteMint() and execution

**Location:** `quoteMint()` (lines 250-252) vs `_doMint()` (lines 645-680)

**Finding:** There is no price locking mechanism between `quoteMint()` (which returns a quote) and actual mint execution in `selfMint()` or `executeMint()`. The price is recalculated at execution time via `mintPrice()`, which can change if utilization, TWAP, or other parameters are updated between quote and execution. While there is a `maxPrice` slippage guard, this still allows adversarial price manipulation.

**Evidence:** `quoteMint()` calls `mintPrice()` view function (line 251), but `_doMint()` recalculates `mintPrice()` at execution time (line 651) without locking the quoted price.

**Recommendation:** Implement a price quote mechanism with a deadline and locked price, or require users to accept the execution-time price with explicit slippage tolerance.

---

### MEDIUM: ETH transfer reentrancy risk

**Location:** `_sendEth()` (lines 695-699) called from `_doMint()` (lines 672-674)

**Finding:** While `_doMint()` uses the `nonReentrant` modifier, the ETH transfers via `_sendEth()` use low-level `call` which can trigger reentrancy in recipient contracts. The reentrancy guard provides protection, but the pattern is fragile if the guard is ever removed or bypassed.

**Evidence:** Lines 672-674 show ETH transfers to external addresses after state changes:

```
_sendEth(polAddress, polShare);
_sendEth(treasuryAddress, treasuryShare);
staking.depositEthYield{value: stakerShare}();
```

**Recommendation:** Follow checks-effects-interactions pattern strictly - perform all ETH transfers at the end of the function after all state updates.

---

### LOW: Pause/unpause front-running risk

**Location:** `pauseMinting()` / `unpauseMinting()` (lines 506-518)

**Finding:** The owner can pause and unpause minting instantly. An attacker could monitor the mempool for unpause transactions and front-run them with their own mint transactions to get preferential pricing before others can react.

**Evidence:** Lines 506-518 show instant pause/unpause with no delay:

```
function unpauseMinting() external onlyOwner {
    mintPaused = false;
    emit MintUnpaused(msg.sender);
}
```

**Recommendation:** Implement a timelock for unpause operations (e.g., 1 hour notice period) or use a batch auction mechanism for post-unpause mints.

---

## DisputeResolution.sol

### HIGH: No check for task finalization before opening dispute

**Location:** `openDispute()` (lines 180-207)

**Finding:** The `openDispute()` function does not check if the associated task has already been finalized in TaskEscrow. An attacker could open disputes on already-finalized tasks, wasting juror time and bond funds.

**Evidence:** Lines 180-207 show no integration with TaskEscrow to check task status:

```
function openDispute(bytes32 taskId, address worker, address reviewer) external nonReentrant {
    if (worker == address(0)) revert ZeroAddress();
    if (reviewer == address(0)) revert ZeroAddress();
    // No check if taskId is already finalized
    uint256 disputeId = nextDisputeId++;
    // ...
}
```

**Recommendation:** Add a check to verify the task is in an appropriate state (e.g., accepted but not finalized) before allowing dispute opening. This requires integration with TaskEscrow.

---

### MEDIUM: Incomplete bond slashing on reviewer fault

**Location:** `resolveDispute()` (lines 295-305)

**Finding:** When a dispute is upheld with reviewer fault, the contract attempts to slash the reviewer's bond via `reviewerStakeManager.slash()`. However, this is wrapped in a try-catch block that silently fails on error. If the slash fails, the reviewer keeps their bond despite being found at fault, and the disputer still receives their bond back.

**Evidence:** Lines 295-305 show silent failure handling:

```
try reviewerStakeManager.slash(dispute.reviewer, slashAmount) {
    reviewerSlashed = true;
    emit BondSlashed(disputeId, dispute.reviewer, slashAmount);
} catch {} // Silent failure - reviewer keeps bond
```

**Recommendation:** Remove silent failure handling or require successful slashing for dispute resolution. If slashing fails, the dispute should not resolve in the disputer's favor.

---

### MEDIUM: No rate limiting on dispute opening

**Location:** `openDispute()` (lines 180-207)

**Finding:** While opening a dispute requires posting a bond (default 100 INTEL), there is no rate limiting. An attacker could open multiple disputes in quick succession to grief reviewers and waste juror time, as long as they can afford the bond costs.

**Evidence:** Lines 180-207 show no rate limiting or cooldown period:

```
function openDispute(bytes32 taskId, address worker, address reviewer) external nonReentrant {
    // No check for recent disputes by same address
    // No cooldown period
    uint256 disputeId = nextDisputeId++;
    // ...
}
```

**Recommendation:** Implement a rate limit (e.g., max 1 dispute per address per 24 hours) or increase bond costs for frequent disputers.

---

### NOT VULNERABLE: State machine prevents premature resolution

**Location:** `resolveDispute()` (lines 272-343)

**Finding:** The dispute state machine correctly enforces that disputes can only be resolved after the voting deadline has passed (line 275: `if (block.timestamp <= dispute.votingDeadline) revert VotingWindowOpen()`). Disputes cannot be resolved before voting ends.

**Evidence:** Lines 272-275 show proper deadline enforcement:

```
function resolveDispute(uint256 disputeId, bool reviewerAtFault) external nonReentrant {
    Dispute storage dispute = disputes[disputeId];
    if (dispute.state != DisputeState.Pending) revert DisputeNotPending();
    if (block.timestamp <= dispute.votingDeadline) revert VotingWindowOpen();
    // ...
}
```

**Status:** ✅ CORRECT - State machine properly enforces voting deadline before resolution.

---

### NOT VULNERABLE: Double-vote protection implemented

**Location:** `castVote()` (lines 242-266)

**Finding:** The contract prevents double-voting through the `hasVoted` mapping (line 107 in struct, line 246 check). Once a juror votes, they cannot vote again on the same dispute.

**Evidence:** Lines 246 and 258 show double-vote protection:

```
if (dispute.hasVoted[msg.sender]) revert AlreadyVoted();
// ...
dispute.hasVoted[msg.sender] = true;
```

**Status:** ✅ CORRECT - Double-voting is properly prevented.

---

## AgentIdentityRegistry.sol

### LOW: Limited replay protection in attestations

**Location:** `getAttestationDigest()` (lines 223-231) and `recoverSigner()` (lines 233-249)

**Finding:** The attestation signature includes `block.chainid` which provides cross-chain replay protection. However, there is no nonce or timestamp in the digest, meaning the same attestation signature could theoretically be reused within the same chain if the same `jobId` is submitted multiple times (though `attestedJobs[jobId]` prevents this). The protection is functional but minimal.

**Evidence:** Lines 223-231 show the digest construction:

```
function getAttestationDigest(bytes32 fingerprint, bytes32 jobId, uint256 score, address reviewer, bool payoutReleased) public view returns (bytes32) {
    return keccak256(abi.encodePacked(address(this), block.chainid, fingerprint, jobId, score, reviewer, payoutReleased));
}
```

**Recommendation:** Consider adding a nonce or timestamp to the attestation digest for stronger replay protection, though the current implementation is sufficient given the `attestedJobs` mapping.

---

### NOT VULNERABLE: Re-registration attack prevented

**Location:** `registerAgent()` (lines 84-114)

**Finding:** The contract prevents re-registration attacks by computing the fingerprint as `keccak256(abi.encodePacked(agentType, agentVersion, msg.sender))` and checking if the agent is already registered (line 94). The same address cannot register the same agent type and version twice.

**Evidence:** Lines 93-94 show the re-registration check:

```
fingerprint = keccak256(abi.encodePacked(agentType, agentVersion, msg.sender));
if (agents[fingerprint].registered) revert AgentAlreadyRegistered(fingerprint);
```

**Status:** ✅ CORRECT - Re-registration attacks are prevented through fingerprint-based deduplication.

---

## Summary

**Total Issues:** 8 (3 HIGH, 3 MEDIUM, 2 LOW)  
**Correct Implementations:** 3 (state machine, double-vote protection, re-registration prevention)

The most critical issues are the operator's ability to manipulate the utilization multiplier and the owner's ability to instantly redirect mint proceeds. The dispute resolution system lacks integration with TaskEscrow to prevent disputes on finalized tasks. Several issues involve silent failure patterns that should be addressed for robustness.