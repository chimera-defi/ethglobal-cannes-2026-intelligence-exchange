# Pass 4 — Delta Audit Report

**Date:** 2026-05-28  
**Auditor:** Independent Claude subagent (claude-sonnet-4-6)  
**Scope:** IntelVesting, IntelTimelockController, IntelPOLManager (new); IntelStaking + IntelMintController (delta)  
**Previous audit:** pass3-delta-audit.md  
**Test baseline entering pass4:** 120/120 (post pass3 fix)

---

## IntelVesting — New Contract

### Entry points

| Function | Access | State mutation |
|----------|--------|----------------|
| `release()` | Permissionless | `released += amount`; transfers tokens to beneficiary |
| `revoke()` | `treasury` only | Sets `revoked = true`; transfers balance to treasury |
| `vestedAmount(timestamp)` | View | — |
| `releasable()` | View | — |

### Key invariants

- `released` only ever increases; never decreases.
- Once `revoked = true`, `vestedAmount()` returns `released` (no further vesting).
- `revoke()` can only be called before `cliff` (timestamp check is strict: `>=`).
- All token transfers use the safe low-level call pattern `data.length == 0 || abi.decode(data, (bool))`.

### Findings

**P4-V1 — INFO — CLEAN: `revoke()` after cliff correctly reverts**

```solidity
if (block.timestamp >= cliff) revert RevocationLockedAfterCliff();
```

Trace: `block.timestamp >= cliff` → `RevocationLockedAfterCliff`. No path exists for treasury to revoke after cliff.

**P4-V2 — INFO — CLEAN: Treasury cannot drain after cliff**

After cliff `revoke()` reverts (see P4-V1). The only funds-out function is `release()`, which always sends to the immutable `beneficiary`. Treasury has no function callable after cliff that moves funds to itself.

**P4-V3 — INFO — CLEAN: `release()` permissionless frontrun — no harm**

Anyone may call `release()`. Tokens always go to `beneficiary`. A third party calling `release()` early delivers tokens to the correct recipient faster than expected. No financial harm results. Tax-timing preference is outside smart contract scope. Intentional per NatDoc.

**P4-V4 — INFO — CLEAN: `_transfer` handles tokens that return no bool**

```solidity
function _transfer(address tok, address to, uint256 amount) internal returns (bool) {
    (bool success, bytes memory data) = tok.call(
        abi.encodeWithSignature("transfer(address,uint256)", to, amount)
    );
    return success && (data.length == 0 || abi.decode(data, (bool)));
}
```

Pattern `data.length == 0 || abi.decode(data, (bool))` correctly handles both no-return tokens (USDT-style) and standard bool-returning tokens. CLEAN.

**P4-V5 — INFO — CLEAN: `totalAllocation = 0` at construction**

No explicit guard. Consequence: `vestedAmount()` always returns 0, `releasable()` returns 0, `release()` reverts `NothingToRelease()`. The vesting schedule is inert but causes no asset loss or exploitable state. Revoke still works (transfers 0 with skipped transfer). Benign.

**P4-V6 — INFO — CLEAN: `vestedAmount` overflow**

```solidity
return (totalAllocation * elapsed) / duration;
```

With Solidity `^0.8.24`, overflow reverts. For realistic token allocations (up to 1 billion INTEL = `10^27` wei) and elapsed times up to 50 years (`~1.576e9` seconds), the product `~1.58e36` is well within `uint256` range (`~1.16e77`). Overflow can only occur with a pathological `totalAllocation > 2^254` — practically impossible given INTEL's `maxSupply` bound. Even if triggered, the call reverts cleanly (no silent corruption).

**P4-V7 — LOW — RESOLVED: `_duration == 0` reverts with wrong error**

> **Resolution (2026-05-28):** Dedicated `InvalidDuration()` error added to `IntelVesting.sol`, replacing the `ZeroAddress()` reuse. Correct selector now emitted on bad duration parameter.

~~Original finding:~~

```solidity
if (_duration == 0) revert ZeroAddress(); // reuse for "bad param"
```

Acknowledged in comment as a hack. Callers or tooling that decode revert selectors will see `ZeroAddress()` for a bad duration parameter, making debugging confusing. No security impact.

**Recommendation:** Add a dedicated `ZeroDuration()` or `InvalidParam()` error.

---

## IntelTimelockController — New Contract

### Entry points

| Function | Access | Notes |
|----------|--------|-------|
| `queue()` | `onlyProposer` (or admin) | Schedules operation |
| `cancel()` | Proposer or admin | Cancels queued op |
| `execute()` | Permissionless | Runs ready op (delay elapsed, within GRACE_PERIOD) |
| `adminCancel()` | `onlyAdmin` | Emergency cancel without queue |
| `setDelay()` | `onlySelf` | Must go through timelock |
| `setProposer()` | `onlySelf` | Must go through timelock |
| `setAdmin()` | `onlySelf` | Must go through timelock |

### Key invariants

- `operationTimestamp[id]`: 0 = never queued, 1 = executed, `>1` = readyAt timestamp.
- `execute()` sets state to `1` **before** external call (CEI).
- `setDelay`, `setProposer`, `setAdmin` are `onlySelf` — must be executed via the timelock queue.
- `hashOperation` includes `block.chainid` preventing cross-chain replay after forks.

### Findings

**P4-T1 — INFO — CLEAN: `hashOperation` collision resistance**

```solidity
return keccak256(abi.encode(block.chainid, target, value, data, salt));
```

`abi.encode` (not `abi.encodePacked`) pads each argument to 32 bytes, eliminating head-collision ambiguity. keccak256 pre-image resistance makes practical collision impossible.

**P4-T2 — INFO — CLEAN: Cross-chain replay prevention**

`block.chainid` is included in the hash. An operation queued on chain A with id `X` produces a different hash on chain B (different chainid). Operations cannot replay across chain forks.

**P4-T3 — INFO — CLEAN: `execute()` before delay reverts**

```solidity
if (block.timestamp < readyAt)
    revert OperationNotReady(id, readyAt, block.timestamp);
```

No path exists to execute before delay. CLEAN.

**P4-T4 — INFO — CLEAN: `setDelay(0)` or `setDelay(MINIMUM_DELAY - 1)` blocked**

Direct admin call: blocked by `onlySelf` modifier.  
Via `execute()`: `setDelay(newDelay)` checks `if (newDelay < MINIMUM_DELAY) revert DelayTooShort(...)`. Both `0` and `MINIMUM_DELAY - 1` trigger this. Cannot bypass.

**P4-T5 — INFO — CLEAN: Self-call (`target == address(this)`) works correctly**

`execute()` calls `target.call{value}(data)`. When target is the timelock itself, it re-enters via `setDelay`, `setProposer`, or `setAdmin`. These are `onlySelf` — only callable when `msg.sender == address(this)`, which is exactly the re-entry context. Intended design, no issue.

**P4-T6 — INFO — CLEAN: Double-execution blocked**

After first execute: `operationTimestamp[id] = 1`.  
Second execute attempt: `readyAt = 1 <= 1` → `revert OperationNotQueued(id)`.  
Re-queue attempt: `if (operationTimestamp[id] == 1) revert OperationAlreadyExecuted(id)`.  
Both paths blocked.

**P4-T7 — INFO — CLEAN: Non-proposer cannot queue**

`queue()` is `onlyProposer`: `if (!isProposer[msg.sender] && msg.sender != admin) revert Unauthorized()`. CLEAN.

**P4-T8 — LOW — OPEN: `MINIMUM_DELAY = 15 minutes` is testnet-only**

Commented as "enough for testnets." For mainnet deployment, 15 minutes is far too short for multi-sig coordination and community reaction time. A compromised proposer could queue and execute a malicious governance action in 15 minutes with no community recourse.

`GRACE_PERIOD = 14 days` is appropriate. The ratio of `GRACE_PERIOD / MINIMUM_DELAY = 1344x` is large but harmless — it simply means operations stay executable for 14 days.

**Recommendation:** Set `MINIMUM_DELAY` to at least `24 hours` (ideally `48 hours`) for mainnet. The current value must be changed before mainnet deployment via a governance upgrade or constructor redeployment. This is a **mandatory** mainnet pre-launch action.

---

## IntelPOLManager — New Contract

### Entry points

| Function | Access | Notes |
|----------|--------|-------|
| `withdrawEth(to, amount)` | `onlyOwner` + `nonReentrant` | Sends ETH to `to` |
| `withdrawIntel(to, amount)` | `onlyOwner` | Transfers INTEL to `to` |
| `enablePhase2()` | `onlyOwner` | One-way switch, sets `phase2Enabled = true` |
| `deployToUniV3(pool, intelAmt, ethAmt, tickLower, tickUpper)` | `onlyOwner` + `nonReentrant` | Phase 2 stub |
| `transferOwnership(newOwner)` | `onlyOwner` | Ownable2Step — initiates transfer |
| `acceptOwnership()` | `pendingOwner` | Completes ownership transfer |
| `ethBalance()` | View | — |
| `intelBalance()` | View | — |
| `receive()` | Payable | Tracks `totalEthReceived`, emits event |

### Key invariants

- `phase2Enabled` is one-way (`true` only, no disable function).
- ETH withdrawal protected by `nonReentrant` + balance check.
- INTEL transfer uses the safe low-level call pattern.

### Findings

**P4-P1 — INFO — CLEAN: `withdrawEth` cannot drain more than balance**

```solidity
if (amount > address(this).balance)
    revert InsufficientBalance(address(this).balance, amount);
```

Balance check present. The ETH send happens after the check. `nonReentrant` prevents a re-entrant call from passing the check twice before balance updates (natural ETH balance decrement happens atomically with the send anyway). CLEAN.

**P4-P2 — INFO — CLEAN: `withdrawEth` reentrancy**

`nonReentrant` guard applied. State check (`address(this).balance > amount`) is performed before the call. ETH `call{value}` happens under the mutex. CLEAN.

**P4-P3 — INFO — CLEAN: `deployToUniV3` before `enablePhase2` reverts**

```solidity
if (!phase2Enabled) revert Phase2NotEnabled();
```

CLEAN.

**P4-P4 — INFO — CLEAN: `enablePhase2` is one-way only**

```solidity
function enablePhase2() external onlyOwner {
    phase2Enabled = true;
    emit Phase2Enabled();
}
```

No `disablePhase2` exists. The flag can only ever go `false → true`. CLEAN.

**P4-P5 — MEDIUM — RESOLVED: `deployToUniV3` emits `UniV3Deployed` event but performs no actual deployment**

> **Resolution (2026-05-28):** Full Uniswap V3 `mint()` integration implemented in `IntelPOLManager.deployToUniV3()`. The function now calls the V3 NonfungiblePositionManager with the supplied tick range and amounts. The stub path and misleading event emission have been replaced with real on-chain liquidity provisioning logic.

~~Original finding:~~

When `phase2Enabled = true`, `deployToUniV3` performs only balance checks, then emits `UniV3Deployed(pool, intelAmount, ethAmount, tickLower, tickUpper)`. No tokens are moved, no Uniswap position is created, and no ETH or INTEL leaves the contract.

The event name and parameters imply a completed on-chain action. Off-chain indexers, subgraphs, and front-ends that listen to this event will record false liquidity deployments. This can create misleading TVL/liquidity metrics and may expose the protocol to reputational or regulatory risk if `enablePhase2()` is called before the implementation is complete.

**Root cause:** The Phase 2 implementation body is a `TODO` comment with a reference implementation.

**Impact:** If an operator calls `enablePhase2()` and then `deployToUniV3()`:
1. Transaction succeeds silently.
2. Event is emitted claiming deployment happened.
3. POL ETH and INTEL remain in the contract.
4. No actual Uniswap liquidity exists.

**Recommendation:** Add a `revert Phase2NotImplemented()` inside `deployToUniV3` unconditionally, and only remove it when the implementation is complete. Alternatively, change the event to `UniV3DeployQueued` to clarify it is a stub. Do **not** call `enablePhase2()` on mainnet until the implementation is audited and deployed.

**P4-P6 — LOW — RESOLVED: `withdrawIntel(to, 0)` silently succeeds**

> **Resolution (2026-05-28):** `if (amount == 0) revert ZeroAmount();` guard added at the top of `IntelPOLManager.withdrawIntel()`. Zero-amount calls now revert immediately, eliminating noisy zero-value event emissions.

~~Original finding:~~

```solidity
function withdrawIntel(address to, uint256 amount) external onlyOwner {
    if (to == address(0)) revert ZeroAddress();
    uint256 bal = _intelBalance();
    if (amount > bal) revert InsufficientBalance(bal, amount);
    // ← No: if (amount == 0) revert ZeroAmount()
    bool ok = _transferIntel(to, 0);
    ...
    emit IntelWithdrawn(to, 0);
}
```

`_transferIntel(to, 0)` calls `intel.transfer(to, 0)`. `IntelToken._transfer` allows amount=0 (uint underflow guard: `0 < fromBalance` is always true). The call succeeds and emits a `Transfer(this, to, 0)` event plus an `IntelWithdrawn(to, 0)` event. No funds are lost but the emitted events are noise that could confuse monitoring.

**Recommendation:** Add `if (amount == 0) revert ZeroAmount();` at the top of `withdrawIntel`.

---

## IntelStaking — Delta (pause + deposit cap)

### New surface

| Addition | Description |
|----------|-------------|
| `bool public paused` | Circuit breaker flag |
| `uint256 public maxStakePerDeposit` | Per-call stake cap (default: 100,000 INTEL) |
| `modifier whenNotPaused()` | Reverts `ContractPaused` if `paused` |
| `pause()` | `onlyOwner` — sets `paused = true` |
| `unpause()` | `onlyOwner` — sets `paused = false` |
| `setMaxStakePerDeposit(newCap)` | `onlyOwner` — cap can only increase or be removed (0) |

### Findings

**P4-S1 — INFO — CLEAN: `whenNotPaused` covers all value-flow functions**

Checked each function:

| Function | `whenNotPaused`? |
|----------|-----------------|
| `stake()` | YES |
| `requestUnstake()` | YES |
| `unstake()` | YES |
| `claimYield()` | YES |
| `claimEthYield()` | YES |
| `depositYield()` | NO (intentional — yield should still be depositable) |
| `depositEthYield()` | NO (intentional — same reason) |
| `advanceEpoch()` | NO (intentional — epoch advancement is informational) |
| `consumeAllowance()` | NO (operator-only, but minting is separately paused by IntelMintController) |

All user value-flow functions (stake, unstake, claim) are correctly gated. Yield inflow not gated (correct — accumulated yield is still claimable once unpaused). CLEAN.

**P4-S2 — INFO — CLEAN: `setMaxStakePerDeposit(0)` removes cap**

```solidity
// stake():
if (maxStakePerDeposit > 0 && amount > maxStakePerDeposit) {
    revert DepositTooLarge(amount, maxStakePerDeposit);
}
```

When `maxStakePerDeposit == 0`, the condition short-circuits (`> 0` is false), no cap applied. CLEAN.

**P4-S3 — INFO — CLEAN: `setMaxStakePerDeposit` enforces non-decrease**

```solidity
require(newCap == 0 || newCap >= maxStakePerDeposit, "CannotDecreaseCap");
```

Cap can only increase or be reset to 0. NatDoc documents this as intentional (prevents owner from trapping existing stakers). CLEAN for stated purpose.

**P4-S4 — LOW — OPEN: Cap cannot be tightened in an emergency without removing it entirely**

The non-decrease constraint means if a vulnerability or economic exploit requires reducing the per-deposit cap (e.g., from 100k to 10k), the owner has only two options: `setMaxStakePerDeposit(0)` (removes cap entirely) or `pause()` (blocks all staking). Neither allows a precise cap reduction.

This is a design trade-off (protecting stakers from governance abuse vs. emergency flexibility). In practice, `pause()` is the correct emergency lever. Noted as LOW severity since the pause mechanism exists.

**P4-S5 — INFO — CLEAN: Owner cannot extract user funds via pause**

`pause()` and `unpause()` modify only the `paused` flag. There is no `sweep()`, `withdraw()`, or owner-only transfer function in IntelStaking. Owner cannot pull staked tokens while the contract is paused. User funds are only released to users via `unstake()` (after cooldown) and `claimYield()` / `claimEthYield()`.

---

## IntelMintController — Delta (mintPaused + epochMintCap)

### New surface

| Addition | Description |
|----------|-------------|
| `bool public mintPaused` | Minting circuit breaker |
| `uint256 public epochMintCap` | Global INTEL cap per epoch (default: 500,000) |
| `uint256 public epochMinted` | INTEL minted in current epoch |
| `uint256 public lastCapEpoch` | Staking epoch number when `epochMinted` was last reset |
| `pauseMinting()` | `onlyOwner` |
| `unpauseMinting()` | `onlyOwner` |
| `setEpochMintCap(newCap)` | `onlyOwner` — cap can only increase or be set to 0 |
| `_checkAndUpdateEpochMinted(intelAmount)` | Internal — checks cap, resets on epoch advance |

### Findings

**P4-M1 — INFO — CLEAN: `_checkAndUpdateEpochMinted` called on all mint paths**

| Mint path | Calls `_checkAndUpdateEpochMinted`? |
|-----------|-----------------------------------|
| `selfMint()` → `_doMint()` | YES (line 424) |
| `executeMint()` → `_doMint()` | YES (line 424) |
| `executeMintERC20()` | YES (line 254, inline) |

All three mint entry points enforce the epoch cap. CLEAN.

**P4-M2 — INFO — CLEAN: Epoch cap bypass via `staking.advanceEpoch()` is intentional**

`_checkAndUpdateEpochMinted` reads `staking.epoch()`. When a new staking epoch begins (triggered by anyone via `advanceEpoch()` after `epochLength` has elapsed), `epochMinted` resets. This is correct and intended behavior — caps are per-epoch, not lifetime. An attacker cannot advance the epoch prematurely; `advanceEpoch()` requires the full `epochLength` (default 7 days) to have elapsed.

**P4-M3 — INFO — CLEAN: `epochMintCap = 0` disables cap check**

```solidity
if (epochMintCap > 0 && epochMinted + intelAmount > epochMintCap) {
    revert EpochMintCapExceeded(...);
}
```

When `epochMintCap == 0`, the condition short-circuits at `> 0`. Cap is disabled. CLEAN.

**P4-M4 — INFO — CLEAN: `lastCapEpoch` initialized correctly**

```solidity
// constructor:
lastCapEpoch = staking.epoch();  // returns 1 (IntelStaking initializes currentEpoch = 1)
```

First mint in epoch 1: `currentEpoch(1) > lastCapEpoch(1)` is false → no spurious reset → `epochMinted` starts at 0 and accumulates correctly.

First mint in epoch 2 (after advance): `2 > 1` → reset `epochMinted = 0`, `lastCapEpoch = 2`. Correct.

**P4-M5 — LOW — RESOLVED: `executeMintERC20` missing `nonReentrant` guard**

> **Resolution (2026-05-28):** `nonReentrant` modifier added to `IntelMintController.executeMintERC20()`, consistent with `executeMint` and `selfMint`. Defense-in-depth against malicious ERC-20 re-entry via `transferFrom` hook is now in place.

~~Original finding:~~

`executeMint` and `selfMint` both carry `nonReentrant`. `executeMintERC20` does not, despite making multiple external calls:

1. `staking.consumeAllowance(to, intelAmount)`
2. `_transferFrom(paymentToken, to, address(this), required)` — pulls arbitrary ERC-20
3. `intel.mint(to, intelAmount)`
4. `_transfer(paymentToken, polAddress, polShare)` ×2
5. `_transfer(paymentToken, treasuryAddress, treasuryShare)`

Re-entry via a malicious `paymentToken.transferFrom` hook is the primary vector. If re-entered at step 2:
- `staking.consumeAllowance` was already called → re-entry at allowance check would revert `AllowanceInsufficient`. So double-minting is blocked.
- `_checkAndUpdateEpochMinted` was already called → `epochMinted` is already updated. But wait: the epoch cap check happens at step 2 (before `intel.mint`). If re-entry happens after step 1 but before step 3, `epochMinted` is incremented twice but `intel.mint` may only be called once on the re-entrant path (if allowance check blocks it). The outer call would then fail or succeed depending on state.

The attack is constrained by `onlyOperator` access — only whitelisted operators can call `executeMintERC20`, significantly reducing attack surface. But `nonReentrant` is a zero-cost defense.

**Recommendation:** Add `nonReentrant` to `executeMintERC20` for consistency and defense-in-depth.

---

## Summary Table

| ID | Contract | Severity | Status | Finding |
|----|----------|----------|--------|---------|
| P4-P5 | IntelPOLManager | MEDIUM | RESOLVED | `deployToUniV3` stub emits false `UniV3Deployed` event; full V3 implementation added |
| P4-V7 | IntelVesting | LOW | RESOLVED | `_duration == 0` reverts `ZeroAddress()` — dedicated `InvalidDuration()` error added |
| P4-T8 | IntelTimelockController | LOW | OPEN | `MINIMUM_DELAY = 15 minutes` is testnet-only; **must be raised to ≥24h before mainnet** |
| P4-S4 | IntelStaking | LOW | OPEN | `setMaxStakePerDeposit` cannot decrease — cannot tighten cap without removing it entirely |
| P4-P6 | IntelPOLManager | LOW | RESOLVED | `withdrawIntel(to, 0)` — `ZeroAmount()` guard added |
| P4-M5 | IntelMintController | LOW | RESOLVED | `executeMintERC20` — `nonReentrant` guard added |
| P4-V1 | IntelVesting | INFO | CLEAN | `revoke()` after cliff correctly reverts `RevocationLockedAfterCliff` |
| P4-V2 | IntelVesting | INFO | CLEAN | Treasury cannot drain after cliff |
| P4-V3 | IntelVesting | INFO | CLEAN | `release()` frontrun: permissionless, no financial harm, intentional |
| P4-V4 | IntelVesting | INFO | CLEAN | `_transfer` safe-ERC20 pattern handles no-bool tokens |
| P4-V5 | IntelVesting | INFO | CLEAN | `totalAllocation = 0`: benign — `release()` reverts `NothingToRelease` |
| P4-V6 | IntelVesting | INFO | CLEAN | `vestedAmount` overflow: only with pathological allocation (>2^254); reverts safely in 0.8.x |
| P4-T1 | IntelTimelockController | INFO | CLEAN | `hashOperation` collision-resistant via `keccak256(abi.encode(...))` |
| P4-T2 | IntelTimelockController | INFO | CLEAN | `block.chainid` in hash prevents cross-chain replay |
| P4-T3 | IntelTimelockController | INFO | CLEAN | `execute()` before delay reverts `OperationNotReady` |
| P4-T4 | IntelTimelockController | INFO | CLEAN | `setDelay(0)` and `setDelay(MINIMUM_DELAY - 1)` both blocked (onlySelf + DelayTooShort) |
| P4-T5 | IntelTimelockController | INFO | CLEAN | Self-call (`target == address(this)`) works correctly for governance ops |
| P4-T6 | IntelTimelockController | INFO | CLEAN | Double-execution blocked: `readyAt = 1` causes `OperationNotQueued` on second attempt |
| P4-T7 | IntelTimelockController | INFO | CLEAN | Non-proposer cannot queue: `Unauthorized` revert |
| P4-P1 | IntelPOLManager | INFO | CLEAN | `withdrawEth` balance check present; cannot drain more than balance |
| P4-P2 | IntelPOLManager | INFO | CLEAN | `withdrawEth` reentrancy: `nonReentrant` guard applied |
| P4-P3 | IntelPOLManager | INFO | CLEAN | `deployToUniV3` before `enablePhase2` reverts `Phase2NotEnabled` |
| P4-P4 | IntelPOLManager | INFO | CLEAN | `enablePhase2` is one-way: no `disablePhase2` exists |
| P4-S1 | IntelStaking | INFO | CLEAN | `whenNotPaused` covers all value-flow functions (stake, requestUnstake, unstake, claimYield, claimEthYield) |
| P4-S2 | IntelStaking | INFO | CLEAN | `setMaxStakePerDeposit(0)` correctly removes cap |
| P4-S3 | IntelStaking | INFO | CLEAN | Cap non-decrease enforced |
| P4-S5 | IntelStaking | INFO | CLEAN | Owner cannot extract user funds via pause/unpause |
| P4-M1 | IntelMintController | INFO | CLEAN | `_checkAndUpdateEpochMinted` called on all three mint paths |
| P4-M2 | IntelMintController | INFO | CLEAN | Epoch cap reset via `advanceEpoch` is intentional; not exploitable (requires full epochLength) |
| P4-M3 | IntelMintController | INFO | CLEAN | `epochMintCap = 0` correctly disables cap |
| P4-M4 | IntelMintController | INFO | CLEAN | `lastCapEpoch` initialized to `staking.epoch()` at construction; no stale comparison |

---

## Recommendations

### Must-fix before mainnet

1. **P4-T8 (LOW → BLOCKER for mainnet):** Redeploy or upgrade `IntelTimelockController` with `MINIMUM_DELAY >= 24 hours`. The current 15-minute value is explicitly a testnet placeholder and provides insufficient governance safety on mainnet.

2. **P4-P5 (MEDIUM):** Add `revert Phase2NotImplemented()` inside `deployToUniV3` unconditionally until the Uniswap V3 integration is fully implemented and audited. Remove the `UniV3Deployed` event emission from the stub path, or rename the event to `UniV3DeployStub` to avoid misleading indexers. Do not call `enablePhase2()` on mainnet until the implementation is audited.

### Should-fix

3. **P4-M5 (LOW):** Add `nonReentrant` to `executeMintERC20` to match `executeMint` and `selfMint`.

4. **P4-P6 (LOW):** Add `if (amount == 0) revert ZeroAmount();` to `withdrawIntel`.

5. **P4-V7 (LOW):** Add `ZeroDuration()` error to `IntelVesting` and use it for the `_duration == 0` check.

### Nice-to-have

6. **P4-S4 (LOW):** Consider adding a separate `emergencySetMaxStakePerDeposit(uint256 newCap)` function (owner-only, no non-decrease constraint, with a time delay or multi-sig requirement) for emergency cap reduction. Current workaround is `pause()`.

---

## Status Update (2026-05-28)

| Finding | Status |
|---------|--------|
| P4-V7 — `_duration == 0` wrong error | ✅ **RESOLVED** — `InvalidDuration()` error added |
| P4-T8 — `MINIMUM_DELAY = 15 minutes` testnet-only | ⚠️ **KNOWN** — documented in code; must raise to ≥24h before mainnet |
| P4-P5 — `deployToUniV3` stub | ✅ **RESOLVED** — full Uniswap V3 implementation with `MockPositionManager` tests |
| P4-P6 — `withdrawIntel(to, 0)` silent | ✅ **RESOLVED** — `amount == 0 || amount > bal` guard added |
| P4-S4 — cap can't decrease | ⚠️ **BY DESIGN** — one-directional cap increase is an intentional safety property |
| P4-M5 — `executeMintERC20` nonReentrant | ✅ **RESOLVED** — `nonReentrant` added |

---

## Pass 5 Findings (2026-05-28)

| ID | Contract | Severity | Status | Description |
|----|----------|----------|--------|-------------|
| P5-T1 | IntelToken | MEDIUM | ✅ RESOLVED | `mint()` not guarded by `whenNotPaused` — emergency pause did not halt minting. Fixed: `whenNotPaused` added to `mint()`. |
| P5-W1 | WorkReceipt1155 | LOW | ✅ RESOLVED | Single-step `transferOwnership` — typo in newOwner would lock contract. Fixed: upgraded to Ownable2Step (`pendingOwner + acceptOwnership`). |
| P5-COV1 | IntelToken | INFO | ✅ RESOLVED | Zero test coverage. Fixed: 62 tests added in `test/IntelToken.t.sol`. |
| P5-COV2 | WorkReceipt1155 | INFO | ✅ RESOLVED | Zero test coverage. Fixed: 56 tests added in `test/WorkReceipt1155.t.sol`. |

**Total tests after Pass 5:** 356 (0 failed)
