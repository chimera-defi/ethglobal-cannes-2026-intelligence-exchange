# Smart Contract Security Audit — PASS 15A
## Scope: CategoryRegistry, IdeaEscrow, IntelTimelockController, IdentityGate

**Auditor:** Codex (automated)  
**Date:** 2026-05-30  
**Commit:** HEAD (worktree `assay-audit-pass10`)

---

## Summary Table

| ID | Severity | Contract | Finding | Status |
|---|---|---|---|---|
| P15A-1 | **CRITICAL** | IdeaEscrow | Reentrancy in `fundIdea`: `transferFrom` before state write allows double-funding | **Unfixed** |
| P15A-2 | **HIGH** | IdeaEscrow | Deprecated but still deployed; no rescue function; poster key loss = permanent lock | **By design** |
| P15A-3 | **HIGH** | CategoryRegistry | `setCategoryWeight` dead-end: category at 10000 bps cannot be directly reduced | **Unfixed** |
| P15A-4 | **MEDIUM** | IdentityGate | Owner has attestor privileges; no ownership transfer; permanent SPOF | **Unfixed** |
| P15A-5 | **MEDIUM** | CategoryRegistry | `agentPrimaryCategory` defaults to 0; never updates when category 0 deactivated | **Unfixed** |
| P15A-6 | **LOW** | CategoryRegistry | `setActive` emits no event | **Unfixed** |
| P15A-7 | **INFO** | IntelTimelockController | `cancel` and `adminCancel` are functionally redundant | **By design** |
| P15A-8 | **INFO** | CategoryRegistry | `WeightSumInvalid` validation is mathematically redundant but safe | **Safe** |

> **Skipped (per instructions):** MINIMUM_DELAY = 15 minutes (known mainnet blocker).

---

## Detailed Findings

### P15A-1 [CRITICAL] — IdeaEscrow Reentrancy in `fundIdea`

**Location:** `IdeaEscrow.sol`, `fundIdea()` (lines ~70–85)

**Description:**
The function performs an external `IERC20.transferFrom` **before** writing `ideas[ideaId].exists = true`. A malicious ERC-20 (or ERC-777 token with hooks) can re-enter `fundIdea` during the transfer callback. On re-entry, `ideas[ideaId].exists` is still `false`, so the `IdeaAlreadyFunded` check passes, enabling double-funding of the same `ideaId`.

**Code:**
```solidity
function fundIdea(bytes32 ideaId, address token, uint256 amount) external {
    if (amount == 0) revert ZeroAmount();
    if (ideas[ideaId].exists) revert IdeaAlreadyFunded(ideaId);   // check (still false on re-entry)

    bool ok = IERC20(token).transferFrom(msg.sender, address(this), amount); // external call
    // <-- re-entry point: exists is still false

    ideas[ideaId] = IdeaFund({ poster: msg.sender, token: token, totalFunded: amount, available: amount, exists: true });
    // ...
}
```

**Impact:**
An attacker can deposit once but have the contract record two (or more) deposits, stealing escrowed funds from other users or draining the contract if the token is malicious.

**PoC:**
```solidity
// MaliciousToken that re-enters fundIdea in its transferFrom hook
transferFrom(from, to, amount) {
    if (!reentered) {
        reentered = true;
        IdeaEscrow(target).fundIdea(ideaId, address(this), amount);
    }
    // perform actual transfer once
}
```

**Recommendation:**
Apply CEI (Check-Effects-Interactions):
```solidity
function fundIdea(bytes32 ideaId, address token, uint256 amount) external {
    if (amount == 0) revert ZeroAmount();
    if (ideas[ideaId].exists) revert IdeaAlreadyFunded(ideaId);

    ideas[ideaId] = IdeaFund({
        poster: msg.sender,
        token: token,
        totalFunded: amount,
        available: amount,
        exists: true
    }); // EFFECT first

    bool ok = IERC20(token).transferFrom(msg.sender, address(this), amount); // INTERACTION last
    if (!ok) revert TransferFailed();
    emit IdeaFunded(ideaId, msg.sender, token, amount);
}
```

---

### P15A-2 [HIGH] — IdeaEscrow Deprecated but Deployed, No Rescue Path

**Location:** `IdeaEscrow.sol` (entire contract), `Deploy.s.sol` (line ~90)

**Description:**
`IdeaEscrow` is explicitly marked `@custom:deprecated true` and labeled "legacy" in the deployment script, yet it is still deployed in `Deploy.run()`. The contract has no `rescue()` or `sweep()` function. If a poster funds an idea and then loses their private keys, the tokens are permanently locked—there is no admin override for `withdrawAvailable`.

**Evidence:**
- `Deploy.s.sol:90`: `result.ideaEscrow = new IdeaEscrow(...);` with comment `"// IdeaEscrow (legacy)"`
- No callers in `src/` other than tests and the deployment script itself.
- No `onlyOwner` or emergency withdrawal exists.

**Impact:**
Low probability (no active integration), but any direct usage results in unrecoverable funds on key loss.

**Recommendation:**
Either (a) remove from deployment script entirely, or (b) add an `onlyOwner` emergency sweep for genuinely stuck funds.

---

### P15A-3 [HIGH] — CategoryRegistry `setCategoryWeight` Administrative Dead-End

**Location:** `CategoryRegistry.sol`, `setCategoryWeight()` (lines ~130–175)

**Description:**
If any category ever reaches `10000` bps (e.g., owner sets it to 10000 to consolidate weights), attempting to reduce that category directly will always revert. The proportional rebalancing branch is skipped when `oldRemainingWeight == 0`, leaving the sum at `< 10000`, which fails the `WeightSumInvalid` check.

**Code:**
```solidity
uint256 oldRemainingWeight = BPS_TOTAL - oldWeight; // = 0 when oldWeight == 10000
if (oldRemainingWeight > 0) {
    // ... rebalancing logic ...
}
// If oldRemainingWeight == 0, other categories keep their old values (all 0)
// Total = newWeight + 0 + ... + 0 != 10000 → revert
```

**PoC:**
1. Owner calls `setCategoryWeight(0, 10000)` → total = 10000 ✅
2. State: cat0=10000, cats1-5=0
3. Owner calls `setCategoryWeight(0, 5000)` → oldRemainingWeight=0, no rebalancing, total=5000 → **revert**

**Recovery:**
Owner must first increase a *different* category (e.g., `setCategoryWeight(1, 5000)`), which redistributes proportionally from cat0. This is non-obvious and wastes gas.

**Recommendation:**
Add an explicit branch for `oldRemainingWeight == 0` that distributes `remainingWeight` evenly across other categories, or document the recovery path clearly.

---

### P15A-4 [MEDIUM] — IdentityGate Owner/Attestor Conflation and No Ownership Transfer

**Location:** `IdentityGate.sol`

**Description:**
1. `onlyAttestor` allows **both** `attestor` and `owner` to verify/revoke roles. This means the owner can self-verify as poster, worker, or reviewer, bypassing the intended World ID attestation flow.
2. There is **no ownership transfer function**. The deployer is the permanent owner. If deployer keys are lost or compromised, the `attestor` can never be rotated by anyone else.

**Code:**
```solidity
modifier onlyAttestor() {
    if (msg.sender != attestor && msg.sender != owner) revert Unauthorized();
    _;
}

function setAttestor(address _attestor) external {
    if (msg.sender != owner) revert Unauthorized(); // owner-only, no transfer path
    attestor = _attestor;
}
```

**Impact:**
- Owner compromise = full role-verification bypass.
- Owner key loss = permanent attestor lock.

**Recommendation:**
Add two-step ownership transfer (`transferOwnership` / `acceptOwnership`) and consider splitting `onlyAttestor` from `onlyOwner` for privileged operations.

---

### P15A-5 [MEDIUM] — CategoryRegistry Stale Primary Category on Deactivation

**Location:** `CategoryRegistry.sol`

**Description:**
`agentPrimaryCategory[agent]` defaults to `0` (Code). When category 0 is deactivated via `setActive(0, false)`, agents whose primary category is 0 retain that value indefinitely. `recordCategoryCompletion` correctly blocks new completions in inactive categories, but the primary category mapping becomes stale data that downstream consumers may misinterpret.

**Code:**
```solidity
mapping(address => uint256) public agentPrimaryCategory; // defaults to 0

function recordCategoryCompletion(...) {
    if (!categories[category].active) revert CategoryInactive(); // blocks new records
    // ...
    if (agentCategoryAiu[agent][category] > agentCategoryAiu[agent][agentPrimaryCategory[agent]]) {
        agentPrimaryCategory[agent] = category; // only updates on new AIU in active category
    }
}
```

**Impact:**
Off-chain indexers or partner contracts reading `agentPrimaryCategory` may show agents as "Code specialists" even when the Code category is globally inactive.

**Recommendation:**
In `setActive`, iterate over affected agents (expensive) or add a view function that resolves the active primary category with a validity check.

---

### P15A-6 [LOW] — CategoryRegistry `setActive` Missing Event

**Location:** `CategoryRegistry.sol`, `setActive()` (lines ~225–230)

**Description:**
`setActive` toggles category availability but does not emit `CategoryActivationToggled`... wait, it does. Let me re-read:

Actually, looking at the code:
```solidity
function setActive(uint256 category, bool active) external onlyOwner {
    if (category >= 6) revert InvalidCategory();
    categories[category].active = active;
    emit CategoryActivationToggled(category, active);
}
```

It DOES emit. I made an error. Let me remove this finding.

Hmm, wait - the line numbers in my analysis may not match exactly. Let me re-verify. The code shows `emit CategoryActivationToggled(category, active);`. So this finding is INVALID. I'll remove it.

Let me replace with a different finding.

Actually, looking more carefully at CategoryRegistry, `setCategoryWeight` has a potential rounding issue. The proportional rebalancing can set a category to 0 weight if `oldCatWeight * remainingWeight < oldRemainingWeight`. For example, if a category has weight 1 and we redistribute with remainingWeight = 5000 and oldRemainingWeight = 9999, then `newCatWeight = (1 * 5000) / 9999 = 0`. This silently zeroes a category's weight. But the function reverts on `newWeightBps == 0` for the TARGET category only, not for rebalanced categories. So a rebalanced category can end up with weight 0.

Wait, let me check if this is possible:
- Initial: cat0=3500, cat1=1500, cat2=2000, cat3=2000, cat4=500, cat5=500
- Set cat0 to 9999
- remainingWeight = 1
- oldRemainingWeight = 6500
- cat1: (1500 * 1) / 6500 = 0
- cat2: (2000 * 1) / 6500 = 0
- cat3: 0
- cat4: (500 * 1) / 6500 = 0
- cat5: 0
- distributed = 0
- remainder = 1
- Add remainder to cat1: cat1 = 1
- Final: 9999 + 1 + 0 + 0 + 0 + 0 = 10000 ✅

So cat2, cat3, cat4, cat5 all become 0. Is this a problem? The categories still exist, just with 0 weight. There's no validation that weights must be > 0. This could be intentional (deprioritizing categories). But if a category has weight 0, it gets no rewards. That seems fine.

But wait, what if we then try to set a category that was zeroed?
- State: cat0=9999, cat1=1, cat2=0, cat3=0, cat4=0, cat5=0
- Set cat2 to 100
- oldWeight=0, newWeight=100
- remainingWeight=9900
- oldRemainingWeight=10000
- cat0: (9999 * 9900) / 10000 = 9899
- cat1: (1 * 9900) / 10000 = 0
- cats3-5: 0
- distributed = 9899
- remainder = 9900 - 9899 = 1
- Add to cat0: 9899 + 1 = 9900
- Final: 9900 + 1 + 100 + 0 + 0 + 0 = 10001 → **revert with WeightSumInvalid**

Wait, that can't be right. Let me recalculate:
- cat0 = 9999, cat1 = 1, cat2 = 0, cat3 = 0, cat4 = 0, cat5 = 0. Sum = 10000 ✅
- Set cat2 to 100:
  - oldWeight = 0
  - newWeight = 100
  - remainingWeight = 10000 - 100 = 9900
  - oldRemainingWeight = 10000 - 0 = 10000
  - cat0: (9999 * 9900) / 10000 = 98990100 / 10000 = 9899
  - cat1: (1 * 9900) / 10000 = 9900 / 10000 = 0
  - cat3: 0
  - cat4: 0
  - cat5: 0
  - distributed = 9899 + 0 + 0 + 0 + 0 = 9899
  - remainder = 9900 - 9899 = 1
  - Add to cat0: 9899 + 1 = 9900
  - Total: 9900 + 0 + 100 + 0 + 0 + 0 = 10000 ✅

I made an arithmetic error. It does sum to 10000. The logic is sound.

Let me think of another edge case...
- cat0 = 5000, cat1 = 5000, cat2 = 0, cat3 = 0, cat4 = 0, cat5 = 0
- Set cat2 to 1:
  - remainingWeight = 9999
  - oldRemainingWeight = 10000
  - cat0: (5000 * 9999) / 10000 = 4999
  - cat1: (5000 * 9999) / 10000 = 4999
  - cats3-5: 0
  - distributed = 9998
  - remainder = 9999 - 9998 = 1
  - Add to cat0: 4999 + 1 = 5000
  - Total: 5000 + 4999 + 1 + 0 + 0 + 0 = 10000 ✅

The math holds. The `WeightSumInvalid` check is indeed redundant but harmless.

OK so I don't have a LOW finding for CategoryRegistry. Let me think of something else.

Actually, looking at IdeaEscrow again:
- `releaseMilestone` transfers to `worker`, `stakerYieldReceiver`, and `treasuryReceiver`. If any of these addresses is a contract that reverts on token receipt, the entire transaction reverts. This is standard behavior and by design.
- `refundMilestone` doesn't actually transfer tokens back to the poster; it just increments `fund.available`. The poster must then call `withdrawAvailable`. This two-step refund is by design.

Looking at IntelTimelockController:
- `execute` forwards all gas to the target call (`target.call{value: value}(data)`). This is standard and allows the target to perform complex operations.
- The return value of the external call is captured but only emitted in the event. If the call returns useful data, it's accessible to the direct caller.

I think my findings are solid. Let me remove the invalid P15A-6 and adjust numbering.

Actually, I want to add one more finding: In AdvancedArcEscrow (not in scope but related), the `_calculateReleasable` for milestone-based vesting has a potential division by zero:
```solidity
uint256 postCliffDuration = v.duration - v.cliff;
if (postCliffDuration == 0) {
    return m.amount;
}
```
This is protected. Not an issue.

Wait, the scope is only the 4 files specified. I shouldn't analyze AdvancedArcEscrow beyond checking if it calls IdeaEscrow (it doesn't).

Let me also check if there's any issue with CategoryRegistry's `agentPrimaryCategory` being used by ReviewerQueue. Looking at ReviewerQueue, it uses `categoryRegistry` but only reads the enum definition, not `agentPrimaryCategory`. So no cross-contract impact.

Final findings list:
1. P15A-1 CRITICAL - IdeaEscrow reentrancy
2. P15A-2 HIGH - IdeaEscrow deprecated but deployed, no rescue
3. P15A-3 HIGH - CategoryRegistry weight dead-end
4. P15A-4 MEDIUM - IdentityGate owner/attestor conflation + no transfer
5. P15A-5 MEDIUM - CategoryRegistry stale primary category
6. P15A-6 LOW - IntelTimelockController: `execute` forwards arbitrary calldata without size limits

Wait, is the calldata size limit an issue? In EVM, calldata is limited by block gas limit. Not a real issue.

Let me think of a real LOW finding for IntelTimelockController...
- `queue` doesn't emit the `salt` in the event. The event is:
  ```solidity
  event OperationQueued(bytes32 indexed id, address indexed target, uint256 value, bytes data, bytes32 salt, uint256 readyAt);
  ```
  Actually it does include salt. Not an issue.

- `execute` doesn't validate that `msg.value == value`. If someone calls `execute` with `msg.value > value`, the excess ETH stays in the timelock contract. If `msg.value < value`, the call fails due to insufficient ETH. This is standard behavior.

OK, I'll just stick with 5 findings. Let me restructure:

1. P15A-1 CRITICAL
2. P15A-2 HIGH  
3. P15A-3 HIGH
4. P15A-4 MEDIUM
5. P15A-5 MEDIUM
6. P15A-6 INFO (redundant cancel/adminCancel)
7. P15A-7 INFO (redundant WeightSumInvalid check)

That seems balanced and accurate.

Let me finalize and write the report.
