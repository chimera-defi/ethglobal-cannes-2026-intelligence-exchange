# X-Ray Pass 2 — Tokenomics Math Audit

**Audited:** 2026-05-27  
**Auditor:** claude-sonnet-4-6  
**Scope:**
- `packages/intelligence-exchange-cannes-contracts/src/IntelStaking.sol`
- `packages/intelligence-exchange-cannes-contracts/src/IntelMintController.sol`
- `packages/intelligence-exchange-cannes-contracts/src/IntelToken.sol`
- `packages/intelligence-exchange-cannes-contracts/src/WorkReceipt1155.sol`
- `packages/intelligence-exchange-cannes-tokenomics/src/engine.ts`

**Test Status (pre-audit):** 103/103  
**Test Status (post-fix):** 106/106 (3 new regression tests added)

---

## Question-by-Question Findings

### Q1 — Is `accYieldPerShare` updated atomically? Flash-staker exploit?

**CRITICAL — FIXED**

`stake()` calls `_settleYield(msg.sender)` before updating `s.staked`. When the staker is new (or returning after full unstake), `s.staked == 0`, so `_settleYield` executed:

```solidity
// BUGGY CODE (pre-fix)
if (s.staked == 0) {
    s.yieldDebt = (s.staked * accYieldPerShare) / PRECISION; // always 0!
    return 0;
}
```

Then `stake()` updates `s.staked += amount` but does NOT resync `yieldDebt`. After any yield is deposited, the new staker can call `claimYield()` and receive:

```
pendingYield = (amount * accYieldPerShare) / PRECISION - 0
```

This includes ALL yield that accumulated before their deposit, scaled by their new stake. A flash staker can:
1. Watch for a pending yield deposit transaction in the mempool.
2. Front-run with a large `stake()`.
3. Let the yield deposit land.
4. Call `claimYield()` immediately to receive unearned yield.
5. Call `requestUnstake()` to begin recovery.

**Fix applied to `IntelStaking.sol`:**

After `s.staked += amount` in `stake()`, the debt is now explicitly synced:

```solidity
// NEW: sync yieldDebt after staked is updated, blocking pre-stake yield capture
s.yieldDebt = (s.staked * accYieldPerShare) / PRECISION;
```

The dead-code debt assignment in the `staked == 0` branch of `_settleYield` was removed.

**Regression tests added:**
- `test_new_staker_cannot_claim_prestake_yield`
- `test_existing_staker_receives_yield_after_deposit`
- `test_restaker_cannot_claim_yield_from_zero_stake_period`

---

### Q2 — Is `yieldDebt` always initialized correctly on first stake?

**CRITICAL — same root cause as Q1, fixed together.**

Before the fix, `yieldDebt` was always initialized to 0 regardless of the current `accYieldPerShare`. Any non-zero `accYieldPerShare` at the time of first stake would result in a free retroactive yield claim.

After the fix in `stake()`:

```solidity
s.staked += amount;
// ...
s.yieldDebt = (s.staked * accYieldPerShare) / PRECISION;
```

The debt is set to exactly the amount the staker "would have earned" if they had been staked since the beginning — which is then subtracted out, leaving zero claimable yield from before their stake.

---

### Q3 — Can `_settleYield` return non-zero claimed when staked == 0?

**CLEAN**

The first check in `_settleYield` is `if (s.staked == 0) { return 0; }`. No tokens are transferred. The returned value is the default `uint256` zero. Safe.

---

### Q4 — Division by zero in `depositYield` when `totalStaked == 0`?

**CLEAN**

`depositYield` explicitly guards before the division:

```solidity
if (totalStaked > 0) {
    accYieldPerShare += (amount * PRECISION) / totalStaked;
} else {
    pendingYieldPool += amount;
}
```

When no stakers exist, yield is buffered to `pendingYieldPool` and distributed on the next epoch advance. No division by zero is possible.

---

### Q5 — Precision loss in `(s.staked * accYieldPerShare) / PRECISION`?

**LOW (systemic dust, negligible at realistic amounts)**

`PRECISION = 1e36`. `accYieldPerShare` grows as `(yieldAmount * 1e36) / totalStaked`.

For a single yield deposit of `Y` wei INTEL with `T` wei total staked, a staker with `S` wei staked receives:

```
claimed = (S * (Y * 1e36 / T)) / 1e36
        = S * Y / T   (truncated)
```

Maximum truncation per claim is 1 wei. Over many claims the rounding always favors the contract (never the staker), meaning a tiny dust amount can accumulate in the contract. At realistic values (Y=1e18, T=1e21, S=1e18) the per-claim error is 0–1 wei, which is acceptable. The 1e36 precision factor makes this far less than the analogous ERC-4626 share model.

No fix required. Acceptable.

---

### Q6 — Bonding curve monotonicity and mint+burn extraction

**CLEAN**

The on-chain `mintPrice()` function:

```solidity
uint256 twapWithPremium = (twap * (BPS + premiumBps)) / BPS;
uint256 base = twapWithPremium > floorPrice ? twapWithPremium : floorPrice;
return (base * utilizationMultiplierBps) / BPS;
```

This is not an AMM bonding curve — it is a TWAP + premium + utilization multiplier. There is no `burn` function that reduces price, so a mint+burn sequence cannot extract value from the price function. `IntelToken.burn()` destroys supply but does not affect `twap`, `floorPrice`, or `utilizationMultiplierBps`.

The off-chain `getCurvePriceUsdPerIntel()` uses `exp(k * u^3)` which is strictly monotonically increasing for positive `k` and non-negative `u`. Monotonicity holds.

---

### Q7 — Sandwich attack vector on `executeMint`

**MEDIUM (oracle TWAP path)**

`executeMint` is `onlyOperator`, meaning arbitrary users cannot call it. This eliminates the standard user-facing front-run vector.

However, a two-step sandwich on the operator's `updateTWAP` → `executeMint` sequence is theoretically possible if the operator submits both transactions in separate blocks:

1. Attacker is a trusted operator (or the channel is observable).
2. Attacker observes a pending `updateTWAP(highPrice)`.
3. No front-run by untrusted parties is possible since `executeMint` is operator-only.

If the threat model includes a compromised operator, the attacker controls both TWAP and minting directly and does not need to sandwich. The slippage guard (`maxPrice`) in `executeMint` provides the correct mitigation for well-behaved operators: if TWAP surges unexpectedly, their own mint will revert at slippage check.

**Recommendation:** Enforce a TWAP staleness check in `mintPrice()` (already flagged as I-4 in pass 1). No code change required for this specific question.

---

### Q8 — Can `utilizationMultiplier` be gamed via fake pending work?

**MEDIUM (operator trust assumption)**

`updateUtilization` is `onlyOperator`. The operator supplies `_pendingVolume` and `_settledCapacity` as raw parameters with no on-chain verification. A malicious or compromised operator can set `_pendingVolume` to `3 * _settledCapacity` to force a 3x price multiplier.

The clamp at `[BPS, 3 * BPS]` (1x–3x) bounds the damage: the worst case is a 3x price pump, which is the designed maximum anti-reflexivity ceiling. Creating "fake pending work" beyond this clamp has no effect.

Given the operator is trusted by design, this is an accepted trust assumption, not a math bug. The clamp is correctly enforced:

```solidity
if (multiplier < BPS) multiplier = BPS;
if (multiplier > 3 * BPS) multiplier = 3 * BPS;
```

**Status:** MEDIUM design concern, not a vulnerability. No fix required; operator trust boundary is documented.

---

### Q9 — ETH split atomicity and staker yield accounting

**HIGH (staker yield from mints is unaccounted)**

In `executeMint`, proceeds are routed as:

```solidity
_sendEth(polAddress, polShare);        // 50%
_sendEth(treasuryAddress, treasuryShare); // 5%
_sendEth(address(staking), stakerShare);  // 45%
```

Each `_sendEth` call uses `require(ok, ...)` so the transaction is atomic — if any ETH transfer fails, all revert. This satisfies the atomicity question.

**However:** the 45% staker share is sent as raw ETH to the staking contract's `receive()` fallback. The staking contract's yield accounting (`accYieldPerShare`, `depositYield()`) is entirely INTEL-denominated. The ETH sits in the contract's ETH balance, permanently unaccounted for in yield calculations. Stakers cannot claim it via `claimYield()`.

The contract comment acknowledges this limitation:

> "In a full implementation this would trigger a swap → INTEL → depositYield(). For this spec slice, we send ETH to the staking contract's designated receiver."

**Impact:** Stakers receive zero yield from mints via `executeMint`. The ETH is not lost (it can be recovered with an admin sweep function), but the 45% staker routing claim in the spec is not delivered by the current code.

**Status:** HIGH — spec mismatch; staker yield from mints is a dead end.

**Recommended fix (not applied, requires DEX integration or architectural decision):**

Option A — Add an `owner`-callable `sweepEthToYield()` function that converts the accumulated ETH balance to INTEL via an on-chain DEX and calls `depositYield()`.

Option B — Track ETH yield separately and distribute it proportionally (requires adding ETH accounting analogous to `accYieldPerShare` but for ETH).

Option C — Change the routing so the staker share is denominated in INTEL from the start (requires pre-mint → swap → deposit flow).

For the demo/testnet scope, **document the gap explicitly** rather than silently losing the ETH:

```solidity
// NOTE: stakerShare ETH accumulates in this contract.
// A production deployment must add a sweep-and-swap mechanism
// or ETH yield accounting to distribute these funds to stakers.
_sendEth(address(staking), stakerShare);
```

---

### Q10 — Does `splitSettlementIntel()` correctly compute 81/9/10?

**CLEAN**

The TypeScript function:

```typescript
const protocolFeeIntel = gross * (protocolFeeBps / 10_000);
const stakerYieldIntel = gross * (stakerYieldBps / 10_000);
const workerPayoutIntel = gross - protocolFeeIntel - stakerYieldIntel;
```

Worker payout is computed as the **remainder** after deducting the two fee components. This eliminates independent float multiplication for the worker share and avoids float accumulation errors. The final `workerPayoutIntel` exactly accounts for all gross INTEL.

The `round()` calls apply only to the returned struct values (for display), not to the intermediate calculations. The arithmetic itself is exact within JavaScript's 64-bit float, which has 53 bits of mantissa (~15 significant decimal digits). For gross values up to 10^12 INTEL (far beyond realistic), this is precise to within 1 ulp.

The overflow guard `if (protocolFeeBps + stakerYieldBps > 10_000) throw` correctly prevents invalid policies. The default `stakerYieldBps = 900` (9%) and `protocolFeeBps` must be provided by caller.

For the canonical 81/9/10 split: `protocolFeeBps=1000, stakerYieldBps=900` → worker=8100/10000=81%. Verified correct.

**Float accumulation check:**

```
gross = 1000.0
protocolFee = 1000 * 0.1 = 100.0              (exact in float64)
stakerYield = 1000 * 0.09 = 90.00000000000001  (float64 rounding)
worker = 1000 - 100 - 90.00000000000001 = 809.99999999999999
round(worker, 8) = 810.0
```

The `round(value, 8)` call corrects the float imprecision for display. The sum of rounded values is 100 + 90 + 810 = 1000. **No net accumulation error at 8-decimal precision.**

---

### Q11 — Does `quoteMintIntel()` match on-chain `quoteMint()`?

**MEDIUM (intentional model mismatch — undocumented)**

The two functions use fundamentally different pricing models:

| | On-chain `quoteMint()` | Off-chain `quoteMintIntel()` |
|---|---|---|
| Base price | TWAP (oracle) | `basePriceUsdPerIntel` (param) |
| Curve model | TWAP + premium (linear) | Exponential: `basePrice * exp(k * u^3)` |
| Demand signal | `utilizationMultiplierBps` (1x–3x) | `liquidityDepthUsd` + `slippageBps` |
| Units | ETH wei | USD |

They are separate systems with separate input parameters and will not agree for the same inputs. This is not a bug — the off-chain engine appears to be a **simulation/demo model** while the on-chain contract is the **authoritative production pricing** mechanism.

**Impact:** Any UI or service that calls `quoteMintIntel()` and presents the result as the on-chain mint price will be inaccurate. Users could be surprised by a different price at execution time.

**Recommendation:** Add a JSDoc comment to `quoteMintIntel()` explicitly stating it is a simulation model (for bonding curve visualization) and that the authoritative price must be read from `IntelMintController.quoteMint()` on-chain.

---

## Summary

| # | Question | Severity | Status |
|---|---|---|---|
| Q1 | Flash staker pre-stake yield exploit | **CRITICAL** | **FIXED** |
| Q2 | yieldDebt initialization for new stakers | **CRITICAL** | **FIXED** (same fix as Q1) |
| Q3 | `_settleYield` with staked == 0 | CLEAN | — |
| Q4 | Division by zero in `depositYield` | CLEAN | — |
| Q5 | Precision loss in yield math | LOW | Noted, no fix needed |
| Q6 | Bonding curve monotonicity | CLEAN | — |
| Q7 | Sandwich attack on `executeMint` | MEDIUM | No code change (operator-only; slippage guard sufficient) |
| Q8 | `utilizationMultiplier` gaming | MEDIUM | No code change (operator trust; clamped 1x–3x) |
| Q9 | ETH split atomicity + staker yield dead-end | **HIGH** | Documented; architectural fix deferred |
| Q10 | `splitSettlementIntel()` 81/9/10 accuracy | CLEAN | — |
| Q11 | `quoteMintIntel()` vs on-chain parity | MEDIUM | Documented; comment recommendation |

---

## Fixes Applied

### `IntelStaking.sol`

**Bug:** `_settleYield` set `yieldDebt = 0` when `s.staked == 0`, and `stake()` did not resync `yieldDebt` after updating `s.staked`. A new staker could immediately claim yield proportional to their new stake size multiplied by all pre-existing `accYieldPerShare`.

**Fix in `stake()`:** After `s.staked += amount`, explicitly sync:
```solidity
s.yieldDebt = (s.staked * accYieldPerShare) / PRECISION;
```

**Fix in `_settleYield()`:** Removed the dead-code `yieldDebt = 0` assignment in the `staked == 0` branch. It was a no-op (0 * anything = 0) and masked the real problem.

### `IntelStaking.t.sol`

Added 3 regression tests:
- `test_new_staker_cannot_claim_prestake_yield` — proves exploit is blocked
- `test_existing_staker_receives_yield_after_deposit` — ensures normal yield still works
- `test_restaker_cannot_claim_yield_from_zero_stake_period` — covers re-stake after full withdrawal

**Post-fix test count: 106/106 passing** (baseline was 103/103).

---

## Out-of-Scope but Noted

**WorkReceipt1155.sol** — No mathematical logic (pure accounting/soulbound NFT). No issues found.

**IntelToken.sol** — No yield or bonding curve math. Standard ERC-20 with supply cap. No issues found beyond what was covered in pass 1.
