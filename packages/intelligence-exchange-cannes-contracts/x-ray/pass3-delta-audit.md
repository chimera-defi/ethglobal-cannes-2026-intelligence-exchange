# X-Ray Pass 3 — Delta Audit: ETH Yield + selfMint + PosterWins Refactor

**Audited:** 2026-05-28  
**Auditor:** claude-sonnet-4-6 (X-Ray Pass 3, independent delta audit)  
**Commits in scope:**
- `a07c726` — ETH yield accumulator, PosterWins full refund, axios CVE
- `9dad63c` — reentrancy guard, selfMint public entry, sweepETH, dead error cleanup

**Changed contracts:**
- `IntelStaking.sol` — ETH yield accumulator, reentrancy guard, `_settleEthYield`, `depositEthYield`, `claimEthYield`
- `IntelMintController.sol` — `selfMint()`, `sweepETH()`, dead error removal, `staking.depositEthYield{value}()`
- `AdvancedArcEscrow.sol` — PosterWins full refund, fee-split restructure

**Test baseline entering pass 3:** 119/119 passing  
**Prior passes:** pass1-intel-contracts.md, pass2-adversarial.md

---

## Methodology

Each new or changed surface was treated as a first-principles review (not a diff review). Each question below was answered with a code trace, not a pattern match.

---

## CONFIRMED BUG (MEDIUM): `requestUnstake` — Yield Debt Not Re-synced After Staked Decrease

**Severity:** MEDIUM  
**Contract:** `IntelStaking.sol`  
**Function:** `requestUnstake()`  
**Affects:** Both INTEL yield (`yieldDebt`) and ETH yield (`ethYieldDebt`)  

### Trace

```solidity
function requestUnstake(uint256 amount) external nonReentrant {
    _advanceEpochIfNeeded();
    _settleYield(msg.sender);      // (1) settles with s.staked = 100 → yieldDebt = 100*Y/PREC
    _settleEthYield(msg.sender);   // (2) settles with s.staked = 100 → ethYieldDebt = 100*Y/PREC

    StakerInfo storage s = stakers[msg.sender];
    s.staked -= amount;            // (3) now s.staked = 80
    totalStaked -= amount;
    s.pendingUnstake += amount;
    s.unstakeAvailableAt = block.timestamp + cooldown;
    // ← NO re-sync of yieldDebt / ethYieldDebt here
}
```

After step (3), `s.staked = 80` but `s.ethYieldDebt = 100 * accEthYieldPerShare / PRECISION`.

For the staker to earn any ETH yield on their remaining 80 tokens, the accumulator must grow by `>25%` beyond its current value:

```
next claim requires: 80 * Y' / PREC > 100 * Y / PREC
                     Y' > 1.25 * Y
```

Until then, the staker earns **zero** ETH yield even though they have 80 tokens staked. Once `Y'` crosses the threshold, the first claim yields:

```
80 * Y' / PREC - 100 * Y / PREC  =  80(Y'-Y)/PREC - 20Y/PREC
```

They lose `20Y/PREC` of yield — exactly the fraction corresponding to the 20-token difference anchored at the old rate.

**Impact:** Stakers who do a partial `requestUnstake` silently lose ETH (and INTEL) yield on their remaining staked position until the accumulator grows by enough to overcome the stale debt. For a 50% unstake, the staker loses 50% of the pre-unstake yield on their remaining position. Funds are not stolen — they remain in the pool and are redistributed to other stakers. But this is unfair and violates the expected invariant: *staking N tokens earns pro-rata yield on N tokens*.

**Root cause:** `stake()` correctly re-syncs yield debts after staked is updated (both `yieldDebt` and `ethYieldDebt`). `requestUnstake()` was not updated to do the same when the new ETH yield path was added.

**Compare with `stake()`:**
```solidity
function stake(uint256 amount) external nonReentrant {
    _settleYield(msg.sender);
    _settleEthYield(msg.sender);
    s.staked += amount;
    totalStaked += amount;
    // ← Correct: debts re-synced AFTER staked update
    s.yieldDebt    = (s.staked * accYieldPerShare)    / PRECISION;
    s.ethYieldDebt = (s.staked * accEthYieldPerShare) / PRECISION;
    ...
}
```

**Fix:**
```solidity
s.staked -= amount;
totalStaked -= amount;
s.pendingUnstake += amount;
s.unstakeAvailableAt = block.timestamp + cooldown;
// Re-sync debts to new staked position — mirrors stake() pattern
s.yieldDebt    = (s.staked * accYieldPerShare)    / PRECISION;
s.ethYieldDebt = (s.staked * accEthYieldPerShare) / PRECISION;
```

No double-count: `_settleYield`/`_settleEthYield` already captured yield for the full 100-token position up to the current accumulator. Re-syncing the debt downward simply anchors the new baseline correctly for the remaining 80 tokens.

**Status: FIXED in commit following pass3 (see below)**

---

## CLEAN: reentrancy guard — implementation correctness

```solidity
uint256 private _reentrancyStatus;
uint256 private constant _NOT_ENTERED = 1;
uint256 private constant _ENTERED = 2;

modifier nonReentrant() {
    require(_reentrancyStatus != _ENTERED, "IntelStaking: reentrant call");
    _reentrancyStatus = _ENTERED;
    _;
    _reentrancyStatus = _NOT_ENTERED;
}
```

- Initialized to `_NOT_ENTERED` (1) in constructor — not zero (safe against default storage slot collision with bool-style guards) ✓
- Uses `!= _ENTERED` not `== _NOT_ENTERED` — no gap if a third sentinel value were introduced ✓
- Applied to: `stake`, `requestUnstake`, `unstake`, `claimYield`, `claimEthYield` — all ETH-sending or state-critical paths ✓
- `depositEthYield` and `depositYield` are NOT nonReentrant — correct; they only write accumulators, no ETH is sent out ✓
- `receive()` is NOT nonReentrant — correct; it only calls `_handleEthYieldDeposit()` (no ETH out, no exploit path); reentrancy FROM an ETH yield recipient's fallback into `receive()` would only dilute the pool, harming no one except the reentrant caller ✓

---

## CLEAN: `_settleEthYield` — CEI ordering

```solidity
function _settleEthYield(address wallet) internal returns (uint256 claimed) {
    StakerInfo storage s = stakers[wallet];
    if (s.staked == 0) return 0;
    uint256 accumulated = (s.staked * accEthYieldPerShare) / PRECISION;
    if (accumulated > s.ethYieldDebt) {
        claimed = accumulated - s.ethYieldDebt;
        s.ethYieldDebt = accumulated;                       // state update FIRST
        (bool ok,) = wallet.call{value: claimed}("");       // interaction SECOND
        require(ok, "IntelStaking: ETH yield transfer failed");
    }
}
```

CEI is correct: `ethYieldDebt` is updated before the external call. Re-entrancy into `claimEthYield` → `_settleEthYield` is blocked by `nonReentrant`. ✓

---

## CLEAN: ETH yield accumulator — new staker isolation

A staker who joins AFTER ETH yield has already been distributed cannot claim past yield. Trace:

1. ETH deposited while `totalStaked = 100`: `accEthYieldPerShare += 1e18 * PRECISION / 100` → `Y = 1e16`
2. New staker calls `stake(50)`:
   - `_settleEthYield(msg.sender)` called → `s.staked == 0` → early return (no claim)
   - `s.staked = 50`, `totalStaked = 150`
   - `s.ethYieldDebt = (50 * Y) / PRECISION = 50 * 1e16 / 1e36 = 5e-19` → approximately 0, but correctly anchored at current `accEthYieldPerShare`
3. Future yield: `accEthYieldPerShare = Y'`. New staker earns `50 * (Y' - Y) / PRECISION` — correct.

New staker cannot claim retroactive yield. ✓

---

## CLEAN: `pendingEthYieldPool` — buffering and flush

When `depositEthYield()` is called with `totalStaked == 0`:
- ETH goes to `pendingEthYieldPool`
- Flushed at next `_advanceEpoch()` when `totalStaked > 0`
- If `totalStaked == 0` at epoch advance, pool stays buffered (correct)

First staker who joins does NOT inherit the buffered pool immediately — they must wait for epoch advance. This is intentional: prevents a "pool sniping" attack where someone stakes, claims buffered yield, then unstakes.

Edge case: If no epoch advance ever happens (e.g., `epochLength` is set to infinity), the buffered pool is never flushed. This is an operational risk, not a contract vulnerability. ✓

---

## CLEAN: `selfMint` — access control and allowance enforcement

```solidity
function selfMint(uint256 intelAmount, uint256 maxPrice) external payable {
    if (intelAmount == 0) revert ZeroAmount();
    uint256 price = mintPrice();
    if (price > maxPrice) revert SlippageExceeded(price, maxPrice);
    uint256 required = (price * intelAmount) / 1e18;
    if (msg.value < required) revert PriceTooLow(msg.value, required);
    uint256 allowanceLeft = staking.mintAllowance(msg.sender);
    if (intelAmount > allowanceLeft) {
        revert AllowanceInsufficient(msg.sender, intelAmount, allowanceLeft);
    }
    staking.consumeAllowance(msg.sender, intelAmount);
    intel.mint(msg.sender, intelAmount);
    ...
}
```

**Allowance sandwich:** Between `mintAllowance` read and `consumeAllowance` call, another tx could consume the remaining allowance. `consumeAllowance` will revert with `AllowanceExceeded` — caller gets a revert, not a free mint. ✓

**Price front-run:** `maxPrice` slippage guard protects against TWAP manipulation between tx submission and inclusion. ✓

**Proceeds routing — atomicity:** All ETH sends (`_sendEth` to polAddress, treasuryAddress; `depositEthYield` to staking) use `require(ok, ...)`. If any send fails, the entire tx reverts, including `consumeAllowance` and `intel.mint`. No partial state. ✓

**Excess refund:** Excess ETH is refunded to `msg.sender` after the mint and routing. If `msg.sender` is a contract that rejects ETH, the refund fails and tx reverts. Users calling `selfMint` should ensure they can receive ETH. This is a UX note, not a vulnerability. ✓

**No reentrancy guard on `selfMint`:** `selfMint` calls `_sendEth(polAddress, ...)` and `_sendEth(treasuryAddress, ...)`. If these addresses are contracts, they could re-enter `selfMint`. However:
- They would need `staking.mintAllowance(msg.sender)` to be nonzero again — impossible since `consumeAllowance` already consumed it
- `staking.depositEthYield{value}()` sends ETH to staking, not back to caller

**RECOMMENDATION (LOW) — FIXED:** `nonReentrant` guard added to `selfMint` as defense-in-depth. Current design is safe given the staking allowance model, but the guard costs only 200 gas and eliminates any future re-entrancy concern if polAddress/treasuryAddress are changed to contracts.

---

## CLEAN: `sweepETH` — cannot drain active mint proceeds

During `executeMint` / `selfMint`:
- Proceeds are routed atomically in the same transaction
- The contract does not hold ETH between transactions under normal operation
- `sweepETH` can only recover ETH that was sent directly (bare transfers, test accidents)

**Governance risk:** `sweepETH` is owner-only. A compromised owner could call it at any time and drain accidentally-held ETH. This is standard owner-key custody risk, not a contract vulnerability. ✓

---

## CLEAN: `AdvancedArcEscrow._resolveDispute` — PosterWins full refund

Old behavior: poster gets 81% of `m.amount` even on a "poster wins" dispute outcome — staker (9%) and treasury (10%) always extracted.

New behavior:
```solidity
if (resolution == DisputeResolution.PosterWins) {
    m.status = MilestoneStatus.Refunded;
    bool ok = IERC20(USDC).transfer(fund.poster, m.amount);
    if (!ok) revert TransferFailed();
    emit DisputeResolved(milestoneId, resolver, uint8(resolution), 0, m.amount);
}
```

- Status set to `Refunded` before transfer (CEI) ✓
- Full `m.amount` returned — `totalEscrowed -= m.amount` at top of function is correct (unconditional) ✓  
- `fund.available` is NOT updated — correct, because reserved amounts are tracked in `totalEscrowed`, not in `fund.available` (already decremented at reservation time; the direct transfer settles the obligation)
- Double-resolution impossible: `d.resolved = true` set before branching; subsequent calls revert at `if (d.resolved) revert InvalidDisputeResolution()` ✓
- WorkerWins/Split still apply 81/9/10 split — only PosterWins is fee-free, matching spec ✓

**Pass2 Q6 status:** The recommendation from pass2 to waive fees on PosterWins is now implemented. This closes the issue cleanly.

---

## INFO: ERC-20 staker share in `executeMintERC20` routes to POL, not staking

```solidity
// Staker share routes to POL in the ERC-20 path (Phase 2: POL keeper swaps
// payment token → INTEL and calls staking.depositYield() each epoch).
_transfer(paymentToken, polAddress, stakerShare);
```

Stakers do NOT earn yield from ERC-20 mints. Only ETH-path mints generate ETH yield for stakers. This is intentional (commented) but should be disclosed in the staker UI. Currently the StakingPage only shows ETH yield — acceptable for Phase 1.

---

## Summary

| ID | Severity | Status | Description |
|----|----------|--------|-------------|
| M-1 | MEDIUM | **FIXED** | `requestUnstake` yield debt not re-synced — stakers lose yield on remaining position |
| L-1 | LOW | **FIXED** | `selfMint` has no reentrancy guard — nonReentrant added as defense-in-depth |
| I-1 | INFO | OPEN (doc) | ERC-20 mint staker share goes to POL not staking — disclose in staker UI |
| — | CLEAN | — | `_settleEthYield` CEI correct |
| — | CLEAN | — | Reentrancy guard implementation correct |
| — | CLEAN | — | New staker cannot claim pre-stake ETH yield |
| — | CLEAN | — | `pendingEthYieldPool` buffering and flush logic correct |
| — | CLEAN | — | `selfMint` allowance enforcement and atomicity |
| — | CLEAN | — | `sweepETH` cannot drain active mint proceeds |
| — | CLEAN | — | PosterWins full refund — CEI correct, totalEscrowed accounting correct |

**Test status post-fix:** 120/120 (1 regression test added for M-1; L-1 fix adds no additional test — reentrancy guard is structural)
