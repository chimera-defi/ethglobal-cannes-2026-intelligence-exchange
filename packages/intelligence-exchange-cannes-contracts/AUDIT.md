# Contract Audit — Intelligence Exchange

**Branch:** alliance-dao-positioning  
**Date:** 2026-05-27  
**Auditor:** claude-sonnet-4-6  
**Spec reference:** `spec/tokenomics/INTEL_LAUNCH_ARCHITECTURE.md`

---

## 1. IdeaEscrow.sol

### What it does
Minimal USDC escrow for ideas and milestones. State machine: `funded → reserved → released / refunded`. Poster-controlled milestone reservation and release. Uses any ERC-20 (USDC on Arc).

### Settlement split — 81/9/10?
**NO.** `releaseMilestone()` transfers the full reserved amount directly to the worker with no split whatsoever. There is no staker yield deduction, no treasury deduction. The full `amount` goes to `worker`.

### Missing vs spec
- No 81/9/10 settlement split on acceptance.
- USDC-denominated, not INTEL-native (hard launch constraint #1 violated for this contract).
- No staker yield pool routing.
- No treasury routing.
- No `withdrawIdea()` function (noted as future feature in comments).
- No epoch tracking, no mint integration.

### Assessment: **Incomplete for INTEL-native spec.**

---

## 2. AdvancedArcEscrow.sol

### What it does
Advanced USDC-native escrow with conditional release, dispute mechanism, auto-release timeout, programmable vesting, and 10% platform fee. Uses `IdentityGate` for role verification. Arc testnet / USDC-specific.

### Direct mint inflow routing — 50/45/5?
**NO.** This contract handles USDC task settlement, not direct INTEL mint inflow. Mint inflow routing is entirely absent from both escrow contracts. The contract applies a flat 10% platform fee, which partially overlaps the spec's treasury 10% for task settlement, but:
- Workers receive 90% (not 81%).
- Staker yield (9%) is not extracted.
- The 1% discrepancy between spec's 81%+9%+10%=100% and the current 90%+10% is a material gap.
- POL routing (50/45/5 for mint inflows) is completely absent.

### Missing vs spec
- Worker gets 90% at release instead of spec's 81%.
- No 9% routed to staker yield pool.
- No direct mint inflow routing (50% POL / 45% staker yield / 5% treasury).
- Hardcoded to USDC at Arc address `0x3600...0000`, not INTEL-native.
- No epoch awareness.
- No utilization multiplier input.

### Assessment: **Partially aligned (has treasury fee) but structurally mismatched with INTEL-native spec.**

---

## 3. IntelToken.sol

### What it does
Standard ERC-20 with max supply, burn, burn-from, pause, and owner-only mint.

### Missing vs spec
- No epoch mint caps (`allowancePerEpoch`).
- No staking integration — mint is entirely owner-controlled, no concept of staking position.
- No utilization multiplier pricing.
- No yield distribution.

### Assessment: **Base token only. Needs external contracts for staking/mint mechanics.**

---

## 4. AgentIdentityRegistry.sol

### Assessment: **Complete.** Handles agent fingerprint registration, role-based access via `IdentityGate`, and attested reputation updates with ECDSA signature verification. No spec gaps identified.

---

## 5. IdentityGate.sol

### Assessment: **Complete.** Role verification mirror for backend World verification. Clean `owner`/`attestor` pattern. No spec gaps identified.

---

## 6. Gap Summary

| Spec Mechanic | Status | Gap |
|---|---|---|
| 81/9/10 settlement split | Missing | IdeaEscrow and AdvancedArcEscrow both skip staker yield |
| 50/45/5 mint inflow routing | Missing | No contract implements this |
| Epoch mint caps (`k * sqrt(staked)`) | Missing | IntelToken has no cap logic |
| Staking with cooldown + time-weighting | Missing | No staking contract |
| TWAP + utilizationMultiplier pricing | Missing | No mint controller |
| Anti-reflexivity brake (demand surge → higher price) | Missing | No mint controller |
| Staker yield pool (receives from settlement) | Missing | No yield pool contract |

---

## 7. Contracts to Implement

Priority order per spec:

1. **`IntelStaking.sol`** — Stake INTEL, track staking positions, epoch allowances (`k * sqrt(staked)`), cooldown, time-weighted rewards, yield distribution.
2. **`IntelMintController.sol`** — TWAP oracle interface, utilization multiplier, `mintPrice()`, `executeMint()` with 50/45/5 routing.
3. **`WorkReceipt1155.sol`** — Soulbound ERC-1155 per accepted milestone (time-permitting).
