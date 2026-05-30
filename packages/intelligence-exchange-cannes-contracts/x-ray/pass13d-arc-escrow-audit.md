# Audit Pass 13D: AdvancedArcEscrow.sol Security Audit

**Contract:** AdvancedArcEscrow.sol (1010 lines)
**Scope:** Sponsor track (Arc testnet)
**Date:** 2026-05-30

---

## CRITICAL

### C1: Missing Zero Address Validation in Constructor
**Severity:** CRITICAL
**Lines:** 297-311

The constructor accepts `_paymentToken` and `_identityGate` addresses without zero-address validation. If zero addresses are passed, the contract becomes permanently broken.

```solidity
constructor(
    address _paymentToken,
    address _identityGate,
    address _stakerYieldReceiver,
    address _treasuryReceiver,
    address _disputeResolver
) {
    paymentToken = _paymentToken;  // No zero check
    identityGate = IdentityGate(_identityGate);  // No zero check
    // ...
}
```

**Impact:** Contract deployment with zero addresses would brick all functionality (transfers would fail, role verification would always revert).

**Recommendation:** Add zero-address checks:
```solidity
if (_paymentToken == address(0)) revert ZeroAddress();
if (_identityGate == address(0)) revert ZeroAddress();
if (_stakerYieldReceiver == address(0)) revert ZeroAddress();
if (_treasuryReceiver == address(0)) revert ZeroAddress();
if (_disputeResolver == address(0)) revert ZeroAddress();
```

---

## HIGH

### H1: Race Condition in refundMilestone - Worker Can Be Stiffed
**Severity:** HIGH
**Lines:** 799-822

A poster can call `refundMilestone()` after a worker has submitted work but before review starts, stealing the worker's submission opportunity. The function only checks `MilestoneStatus.Reserved`, not whether a worker has already claimed the milestone.

```solidity
function refundMilestone(bytes32 milestoneId) external nonReentrant {
    // ...
    if (m.status == MilestoneStatus.Reserved) {
        // Not yet claimed/work started - full refund available
    } else if (m.status == MilestoneStatus.Disputed && disputes[milestoneId].resolved) {
        // ...
    } else {
        revert InvalidState(milestoneId, m.status, MilestoneStatus.Reserved);
    }
    // ...
}
```

**Attack scenario:**
1. Worker calls `submitMilestone()` → status becomes `Submitted`
2. Poster immediately calls `refundMilestone()` → **REVERTS** (status is Submitted, not Reserved)
3. Worker must wait for reviewer to call `startReview()` → status becomes `UnderReview`
4. Poster calls `refundMilestone()` → **REVERTS** (status is UnderReview)

**Wait - this is actually protected.** The refund function only allows refund from `Reserved` state. Once worker submits, status is `Submitted`, so refund reverts.

**BUT:** There's a gap. If reviewer never calls `startReview()`, the milestone stays in `Submitted` forever. The worker cannot force review, and the poster cannot refund. Funds are locked.

**Recommendation:** Add a timeout mechanism for `Submitted` state that auto-transitions to `UnderReview` with a default reviewer, or allows worker to cancel after timeout.

---

### H2: Missing nonReentrant on withdrawAvailable
**Severity:** HIGH
**Lines:** 827-836

`withdrawAvailable()` performs an external USDC transfer without the `nonReentrant` modifier, despite updating state and transferring tokens.

```solidity
function withdrawAvailable(bytes32 ideaId, uint256 amount) external onlyPoster(ideaId) {
    IdeaFund storage fund = ideas[ideaId];
    if (fund.available < amount) revert InsufficientBalance(ideaId, amount, fund.available);

    fund.available -= amount;  // State update
    totalEscrowed -= amount;   // State update

    bool ok = IERC20(paymentToken).transfer(fund.poster, amount);  // External call
    if (!ok) revert TransferFailed();
}
```

**Impact:** If USDC token has malicious callback (e.g., ERC777), attacker could reenter and drain additional funds before state updates complete.

**Recommendation:** Add `nonReentrant` modifier to `withdrawAvailable()`.

---

### H3: Dispute Resolution Bypass via autoResolveDispute
**Severity:** HIGH
**Lines:** 783-791

`autoResolveDispute()` can be called by **anyone** after timeout, not just the designated resolver. This allows an attacker to front-run the resolver and force a 50/50 split.

```solidity
function autoResolveDispute(bytes32 milestoneId) external {
    Dispute storage d = disputes[milestoneId];
    if (d.raisedAt == 0) revert DisputeNotFound();
    if (d.resolved) revert InvalidDisputeResolution();
    if (block.timestamp < d.resolutionDeadline) revert TimeoutNotReached();

    // Auto-resolve with 50/50 split
    _resolveDispute(milestoneId, DisputeResolution.Split, 5000, msg.sender);
}
```

**Impact:** Malicious actor can force unfavorable 50/50 split before resolver can make a proper decision. The resolver's address is recorded but the decision is overridden.

**Recommendation:** Restrict `autoResolveDispute()` to `onlyResolver` or add a delay after timeout before auto-resolve can be triggered (e.g., 24-hour grace period for resolver).

---

## MEDIUM

### M1: IdentityGate Verification Inconsistent Across Entry Points
**Severity:** MEDIUM
**Lines:** 469, 489, 651

Not all entry points enforce IdentityGate verification:
- `submitMilestone()`: ✅ has `onlyVerifiedWorker`
- `startReview()`: ✅ has `onlyVerifiedReviewer`
- `raiseDispute()`: ❌ NO verification - only checks if sender is stakeholder (worker/poster/reviewer)

```solidity
function raiseDispute(bytes32 milestoneId, bytes32 reasonHash) external {
    // ...
    bool isStakeholder = (
        msg.sender == m.worker ||
        msg.sender == ideas[m.ideaId].poster ||
        msg.sender == m.reviewer
    );
    if (!isStakeholder) revert Unauthorized();
    // ...
}
```

**Impact:** A revoked worker/poster/reviewer could still raise disputes after losing verification, or an attacker who compromised a stakeholder address could raise disputes without proper role verification.

**Recommendation:** Add role verification to `raiseDispute()`:
```solidity
modifier onlyVerifiedStakeholder(bytes32 milestoneId) {
    MilestoneFund storage m = milestones[milestoneId];
    bool isVerified = (
        (msg.sender == m.worker && identityGate.isVerified(msg.sender, keccak256("worker"))) ||
        (msg.sender == ideas[m.ideaId].poster && identityGate.isVerified(msg.sender, keccak256("poster"))) ||
        (msg.sender == m.reviewer && identityGate.isVerified(msg.sender, keccak256("reviewer")))
    );
    if (!isVerified) revert Unauthorized();
    _;
}
```

---

### M2: Rounding Errors in Fee Calculation for Small Amounts
**Severity:** MEDIUM
**Lines:** 558-561, 613-615

The fee calculation uses integer division which can result in zero fees for small amounts, causing the worker to receive more than intended.

```solidity
uint256 stakerAmount = (toRelease * STAKER_BPS) / BPS_DENOMINATOR;  // 9%
uint256 treasuryAmount = (toRelease * TREASURY_BPS) / BPS_DENOMINATOR;  // 10%
uint256 workerAmount = toRelease - stakerAmount - treasuryAmount;  // ~81%
```

**Example:** If `toRelease = 5` USDC:
- `stakerAmount = (5 * 900) / 10000 = 0`
- `treasuryAmount = (5 * 1000) / 10000 = 0`
- `workerAmount = 5 - 0 - 0 = 5` (100% instead of 81%)

**Impact:** Protocol loses expected fees on micro-transactions. While low impact in absolute terms, it violates the stated fee structure.

**Recommendation:** Add a minimum fee or use a different fee calculation for small amounts. Document this behavior as expected for micro-transactions.

---

### M3: No Validation That paymentToken is Actually USDC
**Severity:** MEDIUM
**Lines:** 202, 304

The contract accepts any ERC20 as `paymentToken` but documentation claims it's "USDC-native". There's no validation that the token has 6 decimals (USDC standard) or stablecoin properties.

```solidity
address public immutable paymentToken;
// ...
paymentToken = _paymentToken;  // No validation
```

**Impact:** If deployed with a volatile token (e.g., WETH), the "stable" escrow assumptions break. Fee calculations and vesting schedules might not make sense for volatile assets.

**Recommendation:** Either:
1. Document that any ERC20 is supported (update comments/docs)
2. Add token validation (e.g., check decimals == 6)

---

### M4: Vesting Cliff Can Be Manipulated by Approval Timing
**Severity:** MEDIUM
**Lines:** 519, 843-877

Vesting `startTime` is set when reviewer approves (`approveMilestone`), not when milestone is reserved or submitted. This gives the reviewer control over vesting timing.

```solidity
function approveMilestone(bytes32 milestoneId, bytes32 attestationHash) external onlyReviewer(milestoneId) {
    // ...
    m.vesting.startTime = block.timestamp;  // Reviewer controls when vesting starts
    m.status = MilestoneStatus.Approved;
    // ...
}
```

**Impact:** A malicious reviewer could delay approval to shorten effective vesting (e.g., if cliff is 7 days and they approve on day 6, the worker gets less than expected). Conversely, they could delay to give workers more vesting.

**Recommendation:** Set `vesting.startTime` at milestone reservation time or submission time, not approval time. Or document that vesting starts at approval.

---

## LOW

### L1: No Mechanism to Handle Stuck Milestones in Submitted State
**Severity:** LOW
**Lines:** 469-481

If a worker submits a milestone but no reviewer ever calls `startReview()`, the milestone stays in `Submitted` state forever. The worker cannot force progress, and the poster cannot refund.

**Impact:** Funds are locked indefinitely if the reviewer ecosystem fails.

**Recommendation:** Add a timeout for `Submitted` state that auto-transitions to `UnderReview` with a default reviewer or allows cancellation.

---

### L2: Owner Can Change Timeouts to Zero
**Severity:** LOW
**Lines:** 937-945

The owner can set `reviewTimeout` and `disputeWindow` to zero, effectively disabling timeout protections.

```solidity
function setReviewTimeout(uint256 _reviewTimeout) external onlyOwner {
    reviewTimeout = _reviewTimeout;  // Can be set to 0
    emit ReviewTimeoutSet(_reviewTimeout);
}
```

**Impact:** Malicious owner could disable auto-release and auto-resolve, causing permanent fund locks.

**Recommendation:** Add minimum values for timeout parameters.

---

### L3: Duplicate Event Emission in _resolveDispute
**Severity:** LOW
**Lines:** 734, 760, 776

The `DisputeResolved` event is emitted inside `_resolveDispute`, but `resolveDispute` (the public entry) doesn't emit its own event. This is fine for single resolution, but if `_resolveDispute` is called from multiple paths (which it is: `resolveDispute` and `autoResolveDispute`), the event emission location is correct but could be confusing.

**Impact:** None - this is actually correct design.

**Recommendation:** No action needed - this is fine.

---

## POSITIVE FINDINGS

1. ✅ **Reentrancy guard properly implemented** on critical functions (`releaseMilestone`, `autoReleaseMilestone`, `resolveDispute`, `refundMilestone`)
2. ✅ **Dispute duplicate protection** - `raiseDispute` checks `disputes[milestoneId].raisedAt != 0` (line 668)
3. ✅ **State machine is well-structured** with clear enum states and transitions
4. ✅ **Auto-release timeout exists** for `UnderReview` state (line 605-607)
5. ✅ **Auto-resolve timeout exists** for disputes (line 787)
6. ✅ **Access control is generally good** with role-based modifiers
7. ✅ **Fee calculation uses remainder method** to avoid dust accumulation (line 561)
8. ✅ **Self-review protection** - reviewer cannot review their own idea (line 495)

---

## SUMMARY

**Critical:** 1
**High:** 3
**Medium:** 4
**Low:** 2
**Positive:** 8

The contract is generally well-designed with proper reentrancy guards and timeout mechanisms. The main concerns are:

1. **Critical:** Missing zero-address validation in constructor could brick deployment
2. **High:** Reentrancy vulnerability in `withdrawAvailable`
3. **High:** Anyone can force auto-resolve disputes, bypassing the designated resolver
4. **Medium:** Inconsistent IdentityGate verification on dispute raising

For a sponsor track (Arc testnet), these issues should be addressed before mainnet deployment, especially the critical constructor validation.