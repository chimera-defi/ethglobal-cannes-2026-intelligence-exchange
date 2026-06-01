# AUDIT PASS 14: Dispute Resolution + Reviewer System — Architecture Deep Review

**Date:** 2026-05-30
**Auditor:** Claude Sonnet 4.6 (claude-sonnet-4-6)
**Scope:** DisputeResolution.sol, ReviewerStakeManager.sol, ReviewerQueue.sol
**Confidence gate:** >= 8/10 only

---

## Targeted Questions — Findings

---

### Q1: Can a slashed reviewer still vote on a dispute they are named in?

**Answer: YES — confirmed. No juror exclusion check for dispute parties.**

**Severity: HIGH | Confidence: 10/10**

**Location:** `DisputeResolution.sol` lines 247–271 (`castVote`), line 219 (`selectJury`).

`selectJury` only validates that jurors have `staked > 0` (line 229). It does not exclude `dispute.worker`, `dispute.reviewer`, or `dispute.disputer` from the jury. Once selected as a juror, a reviewer named as a party in the dispute can call `castVote` freely — the only checks are:

- `dispute.state == Pending` (line 249)
- `block.timestamp <= votingDeadline` (line 250)
- `!hasVoted[msg.sender]` (line 251)
- membership in `dispute.jury[]` (lines 254–261)

There is no check that `msg.sender != dispute.reviewer` or `msg.sender != dispute.worker` or `msg.sender != dispute.disputer`.

**Attack path:**
1. Reviewer is named in a dispute (`dispute.reviewer = reviewerAddr`).
2. Operator (possibly colluding or simply unaware) includes `reviewerAddr` in the juror list passed to `selectJury`.
3. Reviewer calls `castVote(disputeId, false)` — votes to reject the dispute, saving their own bond.
4. With jurorCount = 5 and quorumBps = 6000, a single juror vote can be the deciding margin.

**Fix:** Add to `selectJury` (line 225 loop body):
```solidity
if (jurors[i] == dispute.worker || jurors[i] == dispute.reviewer || jurors[i] == dispute.disputer)
    revert InvalidJuror();
```

---

### Q2: Can all jurors be slashed mid-dispute, permanently locking it?

**Answer: YES — a liveness failure is possible, but the dispute can be recovered via `expireDispute`.**

**Severity: MEDIUM | Confidence: 9/10**

**Location:** `DisputeResolution.sol` lines 365–377 (`expireDispute`), lines 282–290 (`resolveDispute` zero-vote path).

If all jurors are slashed (their bonds drop below `minReviewerBond`), they retain their staking positions in `IntelStaking` because `ReviewerStakeManager.slash` only reduces `reviewerBond` and `eligibleReviewers`, it does NOT reduce `staking.stakers[juror].staked`. The dispute contract uses `staking.stakers` at selection time but never rechecks it during voting; there is therefore no mechanism to remove a juror from a live dispute after selection.

If all jurors decline to vote (because they are slashed, inactive, or colluding), the `totalVotes == 0` branch at line 286 fires in `resolveDispute`, setting `state = Expired` and returning the bond — this is the **correct** liveness rescue.

Additionally, `expireDispute` (line 365) can be called by anyone after `votingDeadline + 24 hours`, setting `state = Expired` and clearing `taskDisputeId`.

**Residual risk:** If `votingDeadline` is never set (jury was never selected — `votingDeadline == 0`, line 201), then:
- `resolveDispute` at line 280: `block.timestamp <= dispute.votingDeadline` → `block.timestamp <= 0` is always false, so it passes. Any caller can immediately resolve with zero votes and expire it. Bond is returned.
- `expireDispute` at line 368: `block.timestamp <= 0 + 24 hours` is false within 24 hours of Unix epoch — but in practice, `block.timestamp` far exceeds 24 hours, so `expireDispute` is also immediately callable.

**Conclusion:** Full permanent lock is not possible due to these escape hatches. However, the zero-`votingDeadline` path is a logic defect: a dispute that never had a jury selected can be immediately resolved with zero votes at line 286, bypassing the entire jury process and returning the disputer's bond. An operator failure to call `selectJury` lets the disputer get their bond back without any jury process.

**Fix:** Require `dispute.votingDeadline != 0` before entering the vote-tally path, or revert in `resolveDispute` if jury was never selected.

---

### Q3: Can an attacker drain the dispute bond pool by cycling open/expire disputes?

**Answer: NO net drain, but griefing amplification exists.**

**Severity: LOW (for drain) / MEDIUM (for griefing) | Confidence: 9/10**

**Analysis:**

The dispute bond is deposited by the disputer at `openDispute` (line 207) via `transferFrom`. When a dispute is expired (`resolveDispute` zero-vote path, line 289, or `expireDispute` line 371), the bond is returned to the disputer via `_returnBond` (line 384 — a plain `intel.transfer`).

The contract holds exactly one bond per open dispute. There is no mechanism for the contract to accumulate INTEL beyond active dispute bonds and any juror rewards. Since bonds are always either:
- Returned to disputer (Expired, Rejected-by-disputer returns nothing — it goes to treasury), or
- Sent to treasury (`_slashBond`, line 390)

...the contract cannot be drained below zero.

**However, the griefing vector is real:**

1. Attacker opens a dispute for a task, posting `disputeBond = 100e18 INTEL`.
2. `selectJury` is never called (operator fails or is DoS'd), so `votingDeadline == 0`.
3. `expireDispute` is callable immediately (as noted in Q2), returning the bond.
4. `taskDisputeId[taskId]` is cleared at line 374.
5. Attacker can immediately open a new dispute for the same task.

This cycle costs the attacker only gas — they always get their INTEL back. Each cycle:
- Consumes operator resources (jury selection)
- Blocks legitimate task settlement (task is locked while `taskDisputeId != 0`)
- Can be repeated indefinitely for the same task

The cost to the attacker is only gas. With a low gas-price environment, this is a viable DoS against any specific task or against task settlement broadly.

**Fix:** Add a per-task maximum dispute count. After N expired disputes on the same task, require a longer cooldown or escalating bond.

---

### Q4: Does clearing `taskDisputeId` on Rejected/Expired state open double-dispute exploits?

**Answer: YES — the clearing is intentional but creates a concrete re-dispute abuse path for the Rejected case.**

**Severity: HIGH | Confidence: 9/10**

**Location:** `DisputeResolution.sol` lines 355–358 (`resolveDispute`) and lines 373–374 (`expireDispute`).

When a dispute is **Rejected** (disputer's bond is slashed to treasury, line 348), the code at line 356–358 clears `taskDisputeId[dispute.taskId] = 0`. This allows opening a new dispute for the same task.

**Problem:** There is no state on the Dispute struct nor on the task to record that a previous dispute was already fully adjudicated and rejected. A new dispute for the same task starts from zero:

1. Disputer A opens dispute, loses the bond (Rejected). `taskDisputeId` cleared.
2. Disputer B (or A with a fresh address) opens a new dispute for the same task.
3. Dispute B proceeds normally — jury, voting, resolution.

This is the intended re-dispute semantics (rejected = "we decided; but you can try again"). However, combined with the unrestricted `resolveDispute` caller (no `onlyOperator` on line 277), any actor can call `resolveDispute` passing `reviewerAtFault = true` or `false` after the voting window. The operator's intended fault interpretation is passed as a **caller-supplied boolean** with no on-chain validation against the actual vote tallies.

**Critical sub-finding — `resolveDispute` caller controls the fault attribution:**

`resolveDispute(uint256 disputeId, bool reviewerAtFault)` is `external nonReentrant` with **no access control** (line 277). Any address can call it post-deadline and pass any value for `reviewerAtFault`. The on-chain vote tally only determines whether the uphold quorum was met; if met, the caller decides who is slashed:

- Caller passes `reviewerAtFault = true` → reviewer is slashed 20%.
- Caller passes `reviewerAtFault = false` → worker AND reviewer are slashed `dispute.bond` each (full bond, not 20%).

A griefer can wait until the vote deadline passes with quorum met, then call `resolveDispute(id, false)` to force maximum slashing on both worker and reviewer, even if the jury intended only reviewer fault.

**Fix:** Either:
1. Track vote direction per juror in a separate mapping (not just `hasVoted`), compute the majority direction on-chain, and remove the `reviewerAtFault` caller parameter.
2. Or restrict `resolveDispute` to `onlyOperator`.

---

### Q5: ReviewerQueue self-assignment: can `taskWorker = address(0)` bypass the check?

**Answer: YES — passing `address(0)` bypasses self-assignment protection entirely.**

**Severity: HIGH | Confidence: 10/10**

**Location:** `ReviewerQueue.sol` lines 130–136 (`assignReview`), lines 287–345 (`_selectReviewerForTask`), line 311 (`reviewer == taskWorker` check).

The self-assignment check is:
```solidity
if (reviewer == taskWorker) {
    continue;
}
```
(line 311)

`taskWorker` is passed as a `calldata` parameter by the operator:
```solidity
function assignReview(
    bytes32 taskId,
    uint256 taskCategory,
    address[] calldata eligibleReviewers,
    address taskWorker   // ← caller-controlled
) external onlyOperator nonReentrant {
```

There is **no validation** that `taskWorker` is non-zero, nor that it matches the actual worker stored for `taskId` on any authoritative on-chain registry (e.g., TaskEscrow). If an operator passes `address(0)`:
- `reviewer == address(0)` is always false for any real reviewer address.
- The self-assignment check is silently bypassed for every candidate.
- A reviewer who is also the task worker will be selectable.

**Who controls the parameter?** Only operators (`onlyOperator`). However:
1. A compromised or malicious operator can pass `address(0)` or any wrong address.
2. There is no on-chain cross-reference to `TaskEscrow` or any contract that stores the canonical `taskWorker`. The ReviewerQueue has no knowledge of who submitted the task.

**Additional concern:** In `reassignTimedOut` (line 182), the hardcoded `address(0)` is deliberately passed:
```solidity
address newReviewer = _selectReviewerForTask(taskId, assignment.taskCategory, newEligibleReviewers, address(0));
```
This is intentional (comment: "address(0) for taskWorker since it's reassignment") but it means **on reassignment, the original task worker can become the reviewer**. If the task worker is in `newEligibleReviewers`, they will pass the `reviewer == taskWorker` check (since `address(0) != taskWorker`) and can be selected.

**Fix:**
1. Validate `taskWorker != address(0)` in `assignReview`.
2. Store `taskWorker` in the `ReviewAssignment` struct at assignment time and use it in `reassignTimedOut`.
3. Ideally, cross-reference a canonical `TaskEscrow` mapping on-chain rather than trusting the parameter.

---

## Additional Critical Findings (discovered during review)

---

### F1: `_rewardJurors` cannot distinguish uphold from reject voters — incorrect reward distribution

**Severity: HIGH | Confidence: 10/10**

**Location:** `DisputeResolution.sol` lines 397–425 (`_rewardJurors`).

The function is designed to reward only "correct" voters. However, the implementation at lines 409–413 marks **any juror who voted** (regardless of direction) as `votedCorrectly = true`:

```solidity
bool votedCorrectly = false;
if (rewardUpholdVoters && dispute.hasVoted[juror]) {
    votedCorrectly = true; // Simplified - in production track vote direction
} else if (!rewardUpholdVoters && dispute.hasVoted[juror]) {
    votedCorrectly = true; // Simplified
}
```

`dispute.hasVoted[juror]` is true for **every juror who voted**, regardless of whether they voted `uphold = true` or `false`. The comment "Simplified - in production track vote direction" acknowledges this is broken but the code is deployed as-is.

**Consequence:** When a dispute is **Rejected** and `_rewardJurors(disputeId, false)` is called:
- All jurors who voted (uphold or reject) are rewarded from `dispute.bond`.
- A juror who voted `uphold` (the minority / "wrong" vote) receives the same reward as one who voted `reject`.
- `rewardPerJuror = dispute.bond / correctVotes` where `correctVotes = dispute.votesReject`, but the reward is paid to all `hasVoted` jurors.

**Bond accounting defect:** `correctVotes` is set to `dispute.votesReject` (line 401), but rewards are paid to `dispute.jury.length` voters who have `hasVoted = true` (potentially including uphold voters). If `votesUphold + votesReject` jurors voted and `correctVotes == votesReject`, the total payout is `(votesUphold + votesReject) * (bond / votesReject)`, which exceeds `dispute.bond` whenever any juror voted uphold. This **overpays from the contract's INTEL balance**, potentially draining bond deposits from other disputes.

**Fix:** Add a `mapping(address => bool) voteDirection` to the Dispute struct and set it in `castVote`. Use it in `_rewardJurors` to filter correctly.

---

### F2: `resolveDispute` has no access control — any caller can trigger slashing post-deadline

**Severity: HIGH | Confidence: 10/10**

**Location:** `DisputeResolution.sol` line 277.

As noted in Q4, `resolveDispute` is `external nonReentrant` with no `onlyOperator` or other access control. This is documented above but warrants its own finding due to the standalone impact.

Any EOA can call `resolveDispute` after `votingDeadline` and:
1. Choose `reviewerAtFault = false` to maximally slash both worker and reviewer (each by `dispute.bond`, not the 20% `reviewerSlashBps`).
2. The try/catch blocks mean failed slashes emit `SlashFailed` events but do not revert — the dispute still transitions to a terminal state regardless of slash success.

Even without a colluding operator, a public mempool watcher can front-run the intended operator resolution call with an adversarial `reviewerAtFault` value.

**Fix:** Add `onlyOperator` modifier to `resolveDispute`.

---

### F3: `quorumThreshold` rounds to zero for small `jurorCount` — disputes always uphold

**Severity: MEDIUM | Confidence: 9/10**

**Location:** `DisputeResolution.sol` line 293.

```solidity
uint256 quorumThreshold = (jurorCount * quorumBps) / 10000;
```

With `jurorCount = 5` and `quorumBps = 6000`, this gives `(5 * 6000) / 10000 = 3`. Correct.

However, if `setJurorCount(1)` is called (no minimum enforced), then `(1 * 6000) / 10000 = 0`. The check at line 294:
```solidity
if (dispute.votesUphold >= quorumThreshold)  // 0 >= 0 is TRUE
```
...passes with **zero uphold votes**. A dispute with one juror who votes to reject will still uphold because `0 >= 0`.

More precisely: if `jurorCount = 1` and the single juror votes `reject`, then `votesUphold = 0 >= 0 = quorumThreshold` → upheld. The reject path is unreachable.

If `jurorCount = 2` and `quorumBps = 6000`: threshold = `(2 * 6000) / 10000 = 1`. One uphold vote = upheld, one reject vote = quorumThreshold not met → goes to reject path. This behaves correctly for 2.

The zero-threshold defect is triggered specifically when `jurorCount * quorumBps < 10000`. With the default `quorumBps = 6000`, this means `jurorCount < 2` (jurorCount = 1 gives threshold = 0).

**Fix:** Add `require(jurorCount >= 3, "jurorCount too low")` in `setJurorCount`, and add `require((jurorCount * quorumBps) / 10000 >= 1, "quorum rounds to zero")` as a guard.

---

## Summary Table

| ID | File | Lines | Title | Severity | Confidence |
|----|------|--------|-------|----------|------------|
| Q1 | DisputeResolution.sol | 219–261 | Named party can be selected as juror and vote on own dispute | HIGH | 10/10 |
| Q2 | DisputeResolution.sol | 201, 280, 365–377 | Zero votingDeadline allows immediate resolution; no permanent lock | MEDIUM | 9/10 |
| Q3 | DisputeResolution.sol | 183–211, 365–377 | Costless dispute cycling DoS against task settlement | MEDIUM | 9/10 |
| Q4 | DisputeResolution.sol | 277, 355–358 | `resolveDispute` is unguarded; caller-supplied `reviewerAtFault` enables adversarial slashing after re-dispute | HIGH | 9/10 |
| Q5 | ReviewerQueue.sol | 130–136, 183, 311 | `taskWorker = address(0)` bypasses self-assignment check; reassignment always passes address(0) | HIGH | 10/10 |
| F1 | DisputeResolution.sol | 397–425 | `_rewardJurors` rewards all voters regardless of direction; bond over-distribution | HIGH | 10/10 |
| F2 | DisputeResolution.sol | 277 | `resolveDispute` has no access control | HIGH | 10/10 |
| F3 | DisputeResolution.sol | 293–294 | `quorumThreshold` rounds to zero at jurorCount=1; every dispute upholds | MEDIUM | 9/10 |

---

## Audit Notes

- `ReviewerStakeManager.slash` correctly propagates ineligibility (line 242: `eligibleReviewers[reviewer] = false`) but does NOT propagate to `IntelStaking.stakers` — a slashed reviewer retains their staking weight for future jury selection.
- The `IReviewerStakeManager` interface declared locally in DisputeResolution.sol (lines 11–14) is never used; the contract uses the concrete `ReviewerStakeManager` type directly. The dead interface adds no risk but should be removed.
- `ReviewerQueue._removeFromQueue` O(1) swap-and-pop (lines 418–434) is correctly implemented. Prior pass-13a findings C2/M9 are resolved.
- `maxReviewerScanCount = 50` cap (line 67, enforced at line 304) resolves prior C1/M8 OOG finding.
- `try/catch` on `reviewerStakeManager.reviewerBond` call (line 324) resolves prior C3/M10 finding.
