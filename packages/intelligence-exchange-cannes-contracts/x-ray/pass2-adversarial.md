# X-Ray Pass 2 — Adversarial Review: Intelligence Exchange Cannes 2026

**Audited:** 2026-05-27  
**Auditor:** claude-sonnet-4-6 (X-Ray Pass 2, adversarial)  
**Scope:** `packages/intelligence-exchange-cannes-contracts/src/` — 8 contracts  
**Prior pass:** pass1-intel-contracts.md (fixed C-1, H-1, H-2, M-1 through M-5)  
**Test status (pre-pass2):** 106/106 passing  
**Test status (post-fix):** 108/108 passing  

---

## Methodology

Every contract was read in full. All prior pass-1 false-positive decisions were re-examined adversarially. The specific questions posed in the brief were each answered with evidence from code analysis.

---

## IdeaEscrow.sol

### Q1 — After the cross-idea fix, any other way to manipulate fund.available across ideas?

**CLEAN.**  
`reserveMilestone` and `refundMilestone` both now check `milestoneIdea[milestoneId] == ideaId` before operating. `releaseMilestone` also has this guard. The only remaining manipulation of `fund.available` is:
- `reserveMilestone`/`reserveMilestones`: decrements available (poster-only, uses ideaId from argument)
- `refundMilestone`: increments available (poster-only, cross-check enforced)
- `withdrawAvailable`: zeroes available (poster-only, no cross-idea risk)

No cross-idea inflation path remains.

---

### Q2 — Can reserveMilestone be called twice on the same milestoneId?

**CLEAN.**  
Line 108: `if (milestones[milestoneId].status != MilestoneStatus.None) revert MilestoneAlreadyReserved(milestoneId);`  
Once reserved, `milestones[milestoneId].status = MilestoneStatus.Reserved`. A second call with the same `milestoneId` hits this guard and reverts. There is no reset path that returns a milestoneId to `None` (Released, Refunded, Settled all leave status non-None). So double-reserve is impossible.

---

### Q3 — Does releaseMilestone properly check that the milestone was actually reserved?

**CLEAN.**  
```
if (m.status != MilestoneStatus.Reserved) {
    if (m.status == MilestoneStatus.None) revert MilestoneNotReserved(milestoneId);
    revert MilestoneAlreadySettled(milestoneId);
}
```
A milestone that exists in `milestoneIdea` but has status `None` is impossible (milestoneIdea is only written during reserve, simultaneously with status=Reserved). The check is tight.

---

### Q4 — Is withdrawAvailable() safe? Can a poster drain while milestones are still reserved?

**CLEAN.**  
`withdrawAvailable` drains only `fund.available`. Reserved amounts reduce `fund.available` at reservation time and are not restored until `refundMilestone` is called. The reserved pool is logically separate from `available`, so reserved milestones are never touched by `withdrawAvailable`. The only risk is `totalFunded -= amount` creates an accounting inconsistency (totalFunded can drop below the sum of all reserved milestone amounts), but `totalFunded` is a display-only field; it has no security role in any check path.

---

## CONFIRMED VULNERABILITY (FIXED): IdeaEscrow.reserveMilestones — Intra-Batch Duplicate milestoneId Traps Funds

**Severity:** MEDIUM  
**Contract:** `IdeaEscrow.sol`  
**Function:** `reserveMilestones()`  

**Issue:** The original first loop checked `milestones[milestoneId].status != None` against on-chain storage, but did not detect duplicates *within the same batch array*. If a caller passed `[milestoneX, milestoneX]` with amounts `[A, A]`:
- First loop: both see `status==None` in storage (nothing written yet) → both pass.
- `totalRequired = 2A`, `fund.available -= 2A`.
- Second loop: writes `milestoneX` with amount `A`. Second iteration overwrites with amount `A`.
- Result: `fund.available` is reduced by `2A` but only `A` is attached to any milestone. The extra `A` is permanently unreachable (no milestone to refund).

**Exploitability:** The poster must provide the array, so this is only self-harm. However, an off-chain integration bug or front-end error could cause accidental permanent fund loss. Severity MEDIUM.

**Fix applied:** Moved the `status != None` check from the first loop into the second (write) loop. When a duplicate appears in the batch, the second occurrence finds `status == Reserved` (set by the first iteration's write) and reverts, rolling back the entire transaction including the `fund.available` deduction. This matches the existing AdvancedArcEscrow batch pattern.

```solidity
// Before: duplicate check only against stored state (misses intra-batch duplicates)
for (uint256 i = 0; i < milestoneIds.length; i++) {
    if (milestones[milestoneId].status != MilestoneStatus.None) revert ...;
    totalRequired += amounts[i];
}
fund.available -= totalRequired;
for (...) { milestones[milestoneId] = ...; }  // second occurrence silently overwrites

// After: check moved into write loop — intra-batch duplicate found at write time → revert
fund.available -= totalRequired;
for (uint256 i = 0; i < milestoneIds.length; i++) {
    if (milestones[milestoneId].status != MilestoneStatus.None) revert MilestoneAlreadyReserved(milestoneId);
    milestones[milestoneId] = ...;  // first occurrence writes; second occurrence finds Reserved → revert
}
```

**Test added:** `test_reserveMilestones_revert_duplicateMilestoneIdInBatch` in `IdeaEscrow.t.sol`.

---

## AdvancedArcEscrow.sol

### Q5 — Is totalEscrowed correctly decremented in ALL paths?

**CLEAN (post-pass1 fixes).**  
- `_releaseMilestone`: `totalEscrowed -= toRelease` ✓  
- `autoReleaseMilestone` (UnderReview path): `totalEscrowed -= m.amount` ✓  
- `autoReleaseMilestone` (Approved path): calls `_releaseMilestone`, which decrements ✓  
- `_resolveDispute` (all branches): `totalEscrowed -= m.amount` before branching ✓  
- `refundMilestone`: `totalEscrowed -= amount` ✓  
- `withdrawAvailable`: `totalEscrowed -= amount` ✓  

All six exit paths are covered.

---

### Q6 — PosterWins dispute: fees taken even on poster refund — intentional and abusable?

**QUESTION (design decision, not externally exploitable).**  
In `_resolveDispute`, `stakerAmount` (9%) and `treasuryAmount` (10%) are deducted from `m.amount` before branching to PosterWins/WorkerWins/Split. On `PosterWins`, the poster receives `workerPool = m.amount - stakerAmount - treasuryAmount` (~81%), not the full `m.amount`.

This means a poster who "wins" a dispute still loses 19% to platform fees. This is punitive and arguably unfair to an innocent poster.

**Is it abusable externally?** No. The fees go to fixed `stakerYieldReceiver` and `treasuryReceiver` (admin-controlled addresses). The resolver cannot self-enrich by calling PosterWins. A malicious resolver could force PosterWins to extract fees, but the resolver is `disputeResolver || owner` (both admin-controlled). External actors cannot force this path.

**Recommendation:** Clarify with design team whether fees should be waived when the resolver rules PosterWins (poster made whole). Current behavior is consistent but punitive.

---

### Q7 — reserveMilestone: can amount exceed fund.available? Is the check tight?

**CLEAN.**  
Line 347: `if (fund.available < amount) revert InsufficientBalance(...)`. This is a strict less-than check (`<`), meaning `amount == fund.available` passes (exact spend allowed). There is no off-by-one: spending exactly the remaining available is valid behavior. No amount can exceed available.

---

### Q8 — After M-2 rounding fix: does worker get remainder? Is dust accumulated anywhere?

**CLEAN.**  
In `_releaseMilestone` and `autoReleaseMilestone`:
```solidity
uint256 stakerAmount  = (toRelease * STAKER_BPS) / BPS_DENOMINATOR;   // 9%
uint256 treasuryAmount = (toRelease * TREASURY_BPS) / BPS_DENOMINATOR; // 10%
uint256 workerAmount   = toRelease - stakerAmount - treasuryAmount;    // remainder ~81%
```
The worker receives the arithmetic remainder, absorbing any rounding dust. No dust accumulates.

In `_resolveDispute`, the same pattern applies:
```solidity
uint256 workerPool = m.amount - stakerAmount - treasuryAmount; // remainder, no dust
```
For the Split sub-path:
```solidity
uint256 workerShare = (workerPool * workerPayoutBps) / BPS_DENOMINATOR;
uint256 posterShare = workerPool - workerShare;
```
`posterShare` gets the remainder of `workerPool`, absorbing any sub-pool rounding dust. Clean.

---

### Q9 — Can the same milestoneId be used for two different ideaIds in AdvancedArcEscrow?

**CLEAN.**  
`reserveMilestone` and `reserveMilestones` both check `milestones[milestoneId].status != None`. After a milestone is reserved (for idea A), its status is permanently non-None (Reserved → Released/Refunded/etc.). A second reservation attempt by any poster for any ideaId with the same milestoneId will revert with `MilestoneAlreadyExists`. Since milestoneIds are caller-chosen (not guaranteed unique), callers should use collision-resistant identifiers; the contract-level guard ensures safety regardless.

---

## IntelStaking.sol

### Q10 — After require(ok) ERC-20 fix: partial transfer state inconsistency?

**CLEAN.**  
All four transfer sites (`stake`, `unstake`, `depositYield`, `_settleYield`) now use `require(ok, ...)`. The state update order is:

- `stake`: `s.staked += amount; totalStaked += amount; s.yieldDebt = ...;` THEN `transferFrom` — if transfer fails, revert rolls back all state. If transfer succeeds, state is committed. No partial state.
- `unstake`: `s.pendingUnstake = 0;` THEN `transfer` — if transfer fails, revert restores `pendingUnstake`. Clean CEI.
- `depositYield`: `accYieldPerShare +=` THEN `transferFrom` would be wrong order — but actually `transferFrom` happens FIRST (line 192), then `accYieldPerShare` update. CLEAN CEI.
- `_settleYield`: `s.yieldDebt = accumulated;` THEN `intel.transfer` — if transfer fails, revert restores yieldDebt. Clean.

No partial-state inconsistency path exists.

---

### Q11 — Cooldown bypass: can a user unstake without waiting?

**CLEAN (no bypass).**  
The cooldown path is: `requestUnstake` → sets `s.unstakeAvailableAt = block.timestamp + cooldown` → `unstake` → checks `block.timestamp >= s.unstakeAvailableAt`. There is no path to set `unstakeAvailableAt = 0` (except after `unstake` succeeds). `block.timestamp` cannot be manipulated by users (validator skew ≤ 12s, negligible vs. 3-day default cooldown).

The L-1 issue from pass1 remains: calling `requestUnstake(1)` resets the cooldown timer for all pending amounts. This is self-harm only (caller delays their own withdrawal). No third-party fund loss.

---

### Q12 — Is accYieldPerShare updated correctly on every depositYield? Can a late staker steal yield?

**CONFIRMED VULNERABILITY (FIXED): Late Staker Yield Theft**

**Severity:** HIGH  
**Contract:** `IntelStaking.sol`  
**Function:** `stake()`, `_settleYield()`  

**Issue (original code):** The original `_settleYield` set `yieldDebt = 0` when `s.staked == 0`:
```solidity
if (s.staked == 0) {
    s.yieldDebt = (s.staked * accYieldPerShare) / PRECISION; // = 0 * X = 0
    return 0;
}
```
`stake()` called `_settleYield` *before* updating `s.staked`. So for a first-time staker:
1. `_settleYield`: `s.staked == 0` → `yieldDebt = 0`, return.
2. `s.staked += amount`.
3. Next `claimYield`: `accumulated = amount * accYieldPerShare / PRECISION`, `yieldDebt = 0` → claims `accumulated`.

If `accYieldPerShare > 0` (yield was deposited before this staker joined), the staker claims yield they never earned. With a 50/50 split scenario (Alice and Bob both staking 100 INTEL, yield of 90 deposited only while Alice was staked), Bob could claim 90 INTEL that belongs to Alice, draining the yield pool.

**Attack scenario:**
1. Alice stakes 100 INTEL. `accYieldPerShare = 0`.
2. 90 INTEL yield deposited. `accYieldPerShare = 0.9 * PRECISION`.
3. Bob stakes 100 INTEL. `_settleYield(bob)`: staked=0, `yieldDebt = 0`.
4. `bob.staked = 100`. Bob claims: `accumulated = 100 * 0.9*P / P = 90`. `yieldDebt = 0`. Claims 90 INTEL.
5. Alice claims: `accumulated = 100 * 0.9*P / P = 90`. Claims 90 INTEL.
6. Total claimed: 180 INTEL. Deposited: 90 INTEL. Contract insolvent.

**Fix applied:** After `s.staked += amount` in `stake()`, anchor the yield debt to the current accumulator level:
```solidity
s.staked += amount;
s.stakedAt = block.timestamp;
totalStaked += amount;
// Anchor yieldDebt so this stake does not retroactively earn pre-stake yield
s.yieldDebt = (s.staked * accYieldPerShare) / PRECISION;
```
`_settleYield` when `s.staked == 0` now simply `return 0` (no debt write needed — stake() handles initialization).

This fix was already applied to the current file (visible at lines 142-145 and the updated `_settleYield` at line 299-303).

**Tests:** `test_stake_yieldDebt_anchoredForLateStaker`, `test_existing_staker_receives_yield_after_deposit`, `test_restaker_cannot_claim_yield_from_zero_stake_period` all present and passing in `IntelStaking.t.sol`.

---

## IntelMintController.sol

### Q13 — POL 50% split: goes to controlled address or callable by anyone?

**CLEAN.**  
`polAddress` is set in the constructor with a zero-address guard and mutable only via `setRoutingAddresses(address _pol, address _treasury)` which is `onlyOwner` and also guards against zero. ETH routing to `polAddress` happens via `_sendEth(polAddress, polShare)`, an internal call. There is no public function that allows an arbitrary caller to redirect or claim the POL share. The POL address is fully owner-controlled.

---

### Q14 — Reentrancy path through ETH receive and mint functions?

**CLEAN.**  
`executeMint` call order:
1. `staking.consumeAllowance(to, intelAmount)` — state committed (allowance consumed).
2. `intel.mint(to, intelAmount)` — tokens minted.
3. `_sendEth(polAddress, polShare)` — first external ETH send.
4. `_sendEth(treasuryAddress, share)`.
5. `_sendEth(address(staking), stakerShare)`.
6. `_sendEth(msg.sender, excess)`.

A reentrant call from a malicious `polAddress` at step 3 would attempt `executeMint` again, but `consumeAllowance` at step 1 of the reentrant call would fail with `AllowanceInsufficient` (already consumed in the outer call). The CEI pattern holds: all meaningful state changes occur before external calls.

The `receive()` function on IntelMintController just accepts ETH; no state changes. The `receive()` on IntelStaking also just accepts ETH. Neither creates a callback exploit path.

---

## AgentIdentityRegistry.sol

### Q15 — After zero-address attestor fix: other ways to forge a valid attestation signature?

**CLEAN on forgery, LOW on admin misconfiguration risk fixed.**  

The H-1 fix correctly guards both `constructor` and `setAttestor` against `address(0)`. `ecrecover` cannot produce a non-zero address for a garbage signature, so the bypass is closed.

**Additional finding (FIXED): `setIdentityGate` missing zero-address check.**  
`setIdentityGate(address _identityGate)` had no zero-address guard. If called with `address(0)`, all subsequent `identityGate.isVerified(...)` calls would hit address-zero (no code), which in Solidity returns success=true with empty returndata — ABI-decoding `bool` from empty data returns `false`. So `registerAgent` would fail for all users. Not a signature bypass (always returns false, not true), but a registry DoS.

**Fix applied:**
```solidity
function setIdentityGate(address _identityGate) external onlyOwner {
    if (_identityGate == address(0)) revert Unauthorized();
    identityGate = IdentityGate(_identityGate);
}
```

**Signature malleability:** `recoverSigner` does not check `s < secp256k1_n/2`. However, since `attestedJobs[jobId]` provides replay protection keyed on `jobId` (not the signature itself), a malleable second signature for the same job would be blocked by the `JobAlreadyAttested` check. For a different jobId, malleability is irrelevant (different preimage). CLEAN.

---

### Q16 — Can the same worker submit twice for the same jobId?

**CLEAN.**  
`attestedJobs[jobId]` is set to `true` on line 118 before the function returns. A second call with the same `jobId` hits `if (attestedJobs[jobId]) revert JobAlreadyAttested(jobId)` at line 110. The `fingerprint` (agent identity) is also separately validated, so a different agent cannot submit the same jobId either.

---

## General

### Q17 — Integer overflow risks? unchecked blocks?

**CLEAN.**  
All contracts compile under `pragma solidity ^0.8.24`, which has built-in overflow protection. The only `unchecked` blocks are in `IntelToken.sol`:
- Line 74 (`transferFrom`): allowance subtraction after `currentAllowance >= amount` check.
- Line 96 (`burnFrom`): same pattern.
- Line 123 (`_transfer`): balance subtraction after `fromBalance >= amount` check.
- Line 147 (`_burn`): same pattern.

All four are safe: they are guarded by explicit `>=` checks immediately above. No other `unchecked` blocks exist.

---

### Q18 — selfdestruct, delegatecall, or assembly usage?

**CLEAN.**  
- `selfdestruct`: not present in any contract.
- `delegatecall`: not present in any contract.
- `assembly`: one block, in `AgentIdentityRegistry.recoverSigner` (lines 171-175). It extracts `r`, `s`, `v` from a 65-byte signature using `calldataload`. This is standard ECDSA parsing equivalent to what OpenZeppelin uses. The `v` normalization (`if (v < 27) v += 27`) is correct.

---

## FALSE POSITIVE REVISITS

### Pass-1 FALSE POSITIVE: L-3 (IdeaEscrow no withdraw function)

**Not a false positive.** The `withdrawAvailable()` function was added (L-3 recommended it as a "future feature"). It is now present and safe. This finding was correctly marked as LOW and is now resolved.

### Pass-1 I-3 (Reviewer = Poster self-review)

**Not a false positive.** The fix was applied: `startReview` now includes `if (msg.sender == ideas[m.ideaId].poster) revert Unauthorized()`. CONFIRMED FIXED.

### Pass-1 I-4 (TWAP staleness not enforced)

**Remains open.** `mintPrice()` still does not check `block.timestamp - twapUpdatedAt <= MAX_TWAP_AGE`. This is a non-critical design gap (operator controls TWAP updates; a stale TWAP benefits neither the attacker nor harms users except by mispricing). Still recommended for production.

---

## Summary

| # | Severity | Contract | Finding | Status |
|---|----------|----------|---------|--------|
| P2-C1 | HIGH | IntelStaking | Late staker yield theft via yieldDebt=0 initialization | FIXED (already in file) |
| P2-M1 | MEDIUM | IdeaEscrow | Duplicate milestoneId in batch traps poster funds | FIXED (this pass) |
| P2-L1 | LOW | AgentIdentityRegistry | setIdentityGate missing zero-address check | FIXED (this pass) |
| P2-Q1 | QUESTION | AdvancedArcEscrow | PosterWins dispute still deducts 19% platform fee | Design decision — needs team input |
| P2-I1 | INFO | IntelMintController | TWAP staleness not enforced (carry-over from pass1 I-4) | Unresolved |

**Post-fix test status:** 108/108 PASSING (2 new tests added in IdeaEscrow.t.sol)

---

## Auto-Fixes Applied (this pass)

### IdeaEscrow.sol
- `reserveMilestones`: moved status check from pre-aggregation loop into write loop to catch intra-batch duplicate `milestoneId` values; reverts the entire transaction (including the `fund.available` deduction) if a duplicate is found.

### AgentIdentityRegistry.sol
- `setIdentityGate`: added `if (_identityGate == address(0)) revert Unauthorized()` guard.

### IntelStaking.sol (already fixed, noted)
- `stake()`: `s.yieldDebt` anchored to `(s.staked * accYieldPerShare) / PRECISION` after `s.staked += amount`.
- `_settleYield()`: removed the dead `yieldDebt = 0` write when `s.staked == 0`; now just `return 0`.

### Test files
- `IdeaEscrow.t.sol`: added `test_reserveMilestones_revert_duplicateMilestoneIdInBatch` and `test_yieldDebt_anchoredOnStake_noRetroactiveClaim`.
