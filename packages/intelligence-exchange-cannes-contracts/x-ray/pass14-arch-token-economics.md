# Pass 14 — Architectural Token-Economics Audit

**Scope:** `IntelStaking.sol`, `IntelMintController.sol`, `LiquidityMining.sol`
**Focus:** Epoch boundary conditions, accumulator math, two-transaction invariant violations, front-running, overflow/underflow
**Date:** 2026-05-30
**Auditor:** claude-sonnet-4-6 (deep architectural review pass)
**Threshold:** Confidence >= 8/10 only

---

## Summary Table

| ID | Contract | Severity | Title | Confidence |
|----|----------|----------|-------|------------|
| P14-L1 | LiquidityMining | HIGH | `miningPool` double-decremented: stakers receive ~50% of deposited rewards | 9/10 |
| P14-M1 | IntelMintController | HIGH | `updateEpochCapFromActivity` bypasses `setEpochMintCap` decrease guard | 9/10 |
| P14-M2 | LiquidityMining | MEDIUM | `pendingReward()` reverts with arithmetic underflow when `rewardEndTime == 0` and `lastUpdateTime > 0` | 9/10 |
| P14-S1 | IntelMintController | MEDIUM | TWAP minimum window (60 s) is manipulable on low-liquidity pools | 8/10 |

---

## P14-L1 — HIGH — LiquidityMining: `miningPool` double-decremented

**File:** `LiquidityMining.sol`
**Lines:** 211–218 (`_updatePool`), 228–236 (`_settleReward`)
**Confidence:** 9/10

### Finding

`miningPool` is decremented in two separate places for the same economic event (reward emission), causing stakers to receive roughly half the rewards that were deposited.

**`_updatePool` (lines 211–218):**
```solidity
uint256 rewards = rewardEnd * rewardRate;
if (rewards > miningPool) {
    rewards = miningPool;
}
// ...
accRewardPerShare += (rewards * PRECISION) / totalStaked;
miningPool -= rewards;   // DEDUCTION #1
lastUpdateTime += rewardEnd;
```

**`_settleReward` (lines 227–236):**
```solidity
claimed = accumulated - m.rewardDebt;
if (claimed > miningPool) {
    claimed = miningPool;
}
m.rewardDebt = accumulated;
miningPool -= claimed;   // DEDUCTION #2
intel.transfer(wallet, claimed);
```

### Proof (concrete example)

Initial state: `miningPool = 1000`, `totalStaked = 100` (Alice), `rewardRate = 10/s`.

At `T+10`, Alice calls `claimRewards()`:

1. `_updatePool`: `rewards = 100`, `accRPS += 1e36`, **`miningPool = 900`** (first deduction)
2. `_settleReward`: `claimed = 100`, `miningPool = 800` (second deduction), `transfer(Alice, 100)`

Contract ERC-20 balance: `1100 → 1000` (100 transferred). `miningPool = 800`, but actual mineable balance = `1000 − 100(staked) = 900`. **100 INTEL permanently orphaned.**

Over a full emission cycle of 1000 INTEL, `_updatePool` removes 1000 from `miningPool`, and `_settleReward` removes another 1000. Once `miningPool` hits 0 from the first deductions, the capping guard on line 229 (`if (claimed > miningPool) claimed = miningPool`) fires and stakers receive zero. Simultaneously, `m.rewardDebt` is advanced to `accumulated` (not `rewardDebt + actual_claimed`), permanently forfeiting the uncollected difference — stakers can never reclaim it.

### Two-transaction invariant violation

TX1 (anyone): `stake(large)` + `claimRewards()` — reward earned and pool decremented twice.
TX2 (anyone): subsequent `claimRewards()` — miningPool is now depleted at twice the expected rate; later stakers get nothing.

The accumulator invariant (`accRewardPerShare × totalStaked / PRECISION == sum of all claimable rewards`) is violated immediately after the first claim cycle.

### Recommended fix

Remove the `miningPool -= rewards` line from `_updatePool`. The pool should only be debited when tokens are actually transferred (in `_settleReward`). Alternatively, remove the deduction from `_settleReward` and treat `_updatePool` as the sole debit gate, but this requires removing the "insufficient pool" capping logic.

Also fix the `rewardDebt` update when capping: use `m.rewardDebt = m.rewardDebt + claimed` (not `m.rewardDebt = accumulated`) when `claimed < owed`, so forfeited rewards can be reclaimed if more tokens are deposited later.

---

## P14-M1 — HIGH — IntelMintController: `updateEpochCapFromActivity` bypasses the `CannotDecreaseCap` guard

**File:** `IntelMintController.sol`
**Lines:** 566–569 (`setEpochMintCap`), 583–600 (`updateEpochCapFromActivity`)
**Confidence:** 9/10

### Finding

`setEpochMintCap` enforces a one-way ratchet: the cap can only be increased or zeroed:

```solidity
// Line 567
require(newCap == 0 || newCap >= epochMintCap, "CannotDecreaseCap");
```

`updateEpochCapFromActivity` (operator-callable when `activityCapEnabled = true`) unconditionally overwrites `epochMintCap` with no such guard:

```solidity
// Line 599
epochMintCap = newCap;
```

`newCap` is derived from `(BASE_EPOCH_CAP * ratio) / BPS` where `ratio` is clamped to `[activityCapFloorBps, activityCapCeilingBps]`. The floor defaults to 2000 (20%) but `setActivityCapBounds` allows the owner to lower it to 1 BPS.

### Two-transaction invariant violation

TX1 (owner): `setActivityCapEnabled(true)` + `setActivityCapBounds(1, 50000)`
TX2 (operator): `updateEpochCapFromActivity(0)` → `ratio = 0 → clamped to 1 → newCap = 500_000e18 × 1 / 10000 = 50e18`

`epochMintCap` is reduced from 500 000 INTEL to 50 INTEL, effectively halting minting, despite the `CannotDecreaseCap` invariant in `setEpochMintCap`. No timelock, no multi-sig, no event distinguishable from a normal activity update.

Even with default bounds (`activityCapFloorBps = 2000`), an operator can call `updateEpochCapFromActivity(0)` and reduce `epochMintCap` from any value above 100 000 INTEL to exactly 100 000 INTEL — a silent cap reduction mid-epoch that the ratchet was supposed to prevent.

### Recommended fix

Add the same ratchet guard to `updateEpochCapFromActivity`:

```solidity
uint256 newCap = (BASE_EPOCH_CAP * ratio) / BPS;
require(newCap == 0 || newCap >= epochMintCap, "ActivityCap: cannot decrease cap");
epochMintCap = newCap;
```

Or: make `updateEpochCapFromActivity` apply only to a separate `activityEpochCap` that acts as an additional ceiling, leaving the hard `epochMintCap` ratchet untouched.

---

## P14-M2 — MEDIUM — LiquidityMining: `pendingReward()` reverts when `rewardEndTime == 0` and `lastUpdateTime > 0`

**File:** `LiquidityMining.sol`
**Lines:** 117–128 (`pendingReward`), 202–204 (`_updatePool`)
**Confidence:** 9/10

### Finding

`_updatePool` guards the `rewardEndTime - lastUpdateTime` subtraction inside an `if (block.timestamp < rewardEndTime)` branch (line 202), so it is safe when `rewardEndTime = 0`.

`pendingReward()` performs the same subtraction without this guard (line 123):

```solidity
uint256 timeEnd = elapsed > rewardEndTime - lastUpdateTime
    ? rewardEndTime - lastUpdateTime
    : elapsed;
```

If `rewardEndTime = 0` (rewards never deposited) and `lastUpdateTime > 0` (any stake has occurred), then `rewardEndTime - lastUpdateTime` underflows under Solidity 0.8.x checked arithmetic and **the transaction reverts**.

**Reachable path:**
1. Deploy `LiquidityMining`.
2. User calls `stake()` — `_updatePool` sets `lastUpdateTime = block.timestamp > 0`.
3. No `depositRewards()` is ever called, so `rewardEndTime = 0`.
4. Any subsequent call to `pendingReward(wallet)` **reverts unconditionally**.

This breaks any UI or contract that calls `pendingReward()` as a pre-flight check. It also makes it impossible to distinguish "no pending reward" from "contract error" in off-chain tooling.

### Recommended fix

Mirror `_updatePool`'s guard:

```solidity
if (block.timestamp > lastUpdateTime && totalStaked > 0 && rewardEndTime > lastUpdateTime) {
    uint256 elapsed = block.timestamp - lastUpdateTime;
    uint256 timeUntilEnd = rewardEndTime - lastUpdateTime;
    uint256 timeEnd = elapsed < timeUntilEnd ? elapsed : timeUntilEnd;
    _accRewardPerShare += (timeEnd * rewardRate * PRECISION) / totalStaked;
}
```

---

## P14-S1 — MEDIUM — IntelMintController: 60-second TWAP minimum window enables price manipulation

**File:** `IntelMintController.sol`
**Lines:** 386–409 (`pullTWAP`)
**Confidence:** 8/10

### Finding

`pullTWAP` enforces a minimum `twapPeriod` of 60 seconds:

```solidity
// Line 388
if (twapPeriod < 60) revert InvalidParam();
```

60 seconds is insufficient to resist deliberate pool manipulation on any pool with less than deep institutional liquidity. Uniswap V3 TWAP resistance degrades sharply below 30 minutes (1800 s). A well-capitalised adversary can move the tick over a 60-second window at a fraction of the cost of manipulating a 30-minute TWAP.

**Impact path:**
1. Attacker identifies that the operator bot is calling `pullTWAP(pool, 60, ...)` on a schedule.
2. Attacker flash-loans capital, pushes pool tick down for 60 seconds, then snaps back.
3. Operator bot calls `pullTWAP` → stored `twap` is suppressed.
4. `mintPrice()` falls to `floorPrice` (floor provides partial mitigation).
5. Attacker self-mints at below-fair-value price, dumps INTEL.

`floorPrice` is the only backstop. If `floorPrice` is stale (set months ago) relative to current market, the window between `floorPrice` and fair value is exploitable.

The TWAP deviation circuit breaker (`twapDeviationPauseEnabled`) mitigates this but is **disabled by default** and only checks deviation from `floorPrice`, not from a longer-window TWAP.

### Recommended fix

- Raise minimum `twapPeriod` to 900 seconds (15 min) or 1800 seconds (30 min).
- Enable `twapDeviationPauseEnabled` by default once the pool has liquidity.
- Add a secondary validation: reject TWAP updates where the new value deviates more than X% from the previous stored TWAP within a single update cycle.

---

## Per-Contract Invariant Summary

### IntelStaking

| Question | Answer |
|---|---|
| Two-tx invariant violation? | No — epoch boundary correctly resets both per-wallet and global caps atomically; `consumeAllowance` without `_advanceEpochIfNeeded` is safe because MintController syncs via `staking.epoch()`. |
| Accumulator overflow? | INTEL: manually guarded at `type(uint128).max` (line 296). ETH: no guard (line 585) but unreachable at realistic ETH yield levels. |
| Risk-free front-run? | No — yield sandwich requires 3-day locked capital; not risk-free. |

### IntelMintController

| Question | Answer |
|---|---|
| Two-tx invariant violation? | Yes — P14-M1: `updateEpochCapFromActivity` + `setActivityCapEnabled` bypasses the cap ratchet. |
| Accumulator overflow? | N/A — no accumulator in this contract. `utilizationMultiplierBps` bounded to `[BPS, 3*BPS]`. |
| Risk-free front-run? | Partial — 60s TWAP window enables low-cost oracle suppression (P14-S1); mitigated by floorPrice. |

### LiquidityMining

| Question | Answer |
|---|---|
| Two-tx invariant violation? | Yes — P14-L1: `_updatePool` + `claimRewards` double-deducts `miningPool`; subsequent stakers receive zero yield as pool drains at 2x rate. |
| Accumulator overflow? | Guarded at `type(uint128).max` (line 216). `pendingReward()` view can revert (P14-M2) but does not corrupt state. |
| Risk-free front-run? | No — no cooldown, so `depositRewards` can be sandwiched, but attacker capital is at risk during the window (no instant exit). Not risk-free. |

---

*End of Pass 14 — Token Economics Architectural Audit*
