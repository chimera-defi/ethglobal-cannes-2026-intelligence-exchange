# Decentralized MVP Gap Analysis — Intelligence Exchange

**Date:** 2026-05-28  
**Branch:** alliance-dao-positioning  
**Audience:** Alliance DAO reviewers, technical due diligence

This document catalogues everything between the current ETHGlobal Cannes build and a production-ready decentralized MVP. Items are ordered by dependency — each phase unlocks the next.

---

## What Exists and Is Verified Today

| Component | Status | Evidence |
|-----------|--------|---------|
| 6-step E2E loop (fund → claim → submit → accept → attest → reputation) | ✅ Working | Verified 2026-05-27 |
| 81/9/10 settlement split (worker/staker/treasury) | ✅ On-chain | IdeaEscrow.sol, AdvancedArcEscrow.sol |
| INTEL staking + ETH yield accumulator | ✅ On-chain | IntelStaking.sol, 120 tests |
| Anti-reflexivity mint pricing (TWAP × utilization multiplier) | ✅ On-chain | IntelMintController.sol |
| Soulbound work receipts (ERC-1155) | ✅ Contract | WorkReceipt1155.sol — not yet wired to broker |
| Agent identity + reputation attestation | ✅ On-chain | AgentIdentityRegistry.sol on Worldchain |
| Dispute resolution with PosterWins full refund | ✅ Fixed | AdvancedArcEscrow.sol |
| Minter role separated from token owner | ✅ Fixed | IntelToken.setMinter() |
| Ownable2Step (two-step ownership transfer) | ✅ Fixed | IntelStaking, IntelMintController, IntelToken |
| Deploy script wiring (minter, operator grants) | ✅ Fixed | Deploy.s.sol post-deployment section |
| Reentrancy guard on all ETH-sending staking functions | ✅ Fixed | IntelStaking.sol nonReentrant |
| Yield debt re-sync on partial unstake (M-1) | ✅ Fixed | IntelStaking.sol requestUnstake() |

---

## Phase 1 — Public deployment (unlocks testnet demo)

**Effort: 1–2 days**

### P1.1 — Track D deploy
- Vercel deploy for web app  
- Railway deploy for broker + Postgres  
- Sepolia + Worldchain Sepolia testnet contract deployment  
- Update `APPLICATION.md` with live URLs

### P1.2 — WorkReceipt1155 wired to broker
**Status: Contract exists, broker does not call it.**  
On task acceptance, the broker's `chainService.ts` should call `workReceipt.mint(workerAddress, taskId, workerFingerprint, score)`.  
This produces an on-chain, soulbound artifact for every accepted job — queryable by any downstream protocol.

```typescript
// apps/intelligence-exchange-cannes-broker/src/services/chainService.ts
// After recordAcceptedSubmission call, add:
const receipt = new ethers.Contract(WORK_RECEIPT_ADDRESS, workReceiptAbi, signer);
await receipt.mint(workerAddress, taskId, workerFingerprint, score);
```

**Why it matters:** Work receipts are the tangible "proof of output" artifact. Without them, the AIU index has no tamper-evident on-chain backing beyond reputation scores.

### P1.3 — On-chain attestation write (AgentIdentityRegistry)
**Status: Broker signs attestation locally, `recordAcceptedSubmission()` NOT called on-chain.**  
`chainService.ts` has this call commented/deferred. Wiring it makes reputation data truly on-chain.

---

## Phase 2 — Decentralization of oracle and governance

**Effort: 1–2 weeks**

### P2.1 — TWAP oracle replacement
**Current:** `IntelMintController.updateTWAP(newTWAP)` is operator-called (manual, centralized).  
**Target:** Pull TWAP from a Uniswap V3 observation window on the INTEL/WETH pool.

```solidity
// Phase 2: replace updateTWAP() with:
function _pullTWAP() internal view returns (uint256) {
    // IUniswapV3Pool.observe([1800, 0]) → 30-min TWAP
    // Convert tick → price in payment token units
}
```

**Prerequisite:** INTEL/WETH Uniswap V3 pool must exist with sufficient liquidity (funded by POL allocations from mint proceeds).

### P2.2 — TimelockController for admin actions
All admin functions (`setParams`, `setFloorPrice`, `setMinter`, `transferOwnership`) should be gated behind a 24–48h timelock for mainnet. OpenZeppelin `TimelockController` is the standard implementation.

```
Owner (multisig) → TimelockController (48h delay) → IntelStaking / IntelMintController
```

### P2.3 — Gnosis Safe multisig for admin keys
Replace single-EOA `owner` with a 2-of-3 or 3-of-5 Gnosis Safe on each admin key (token owner, staking owner, controller owner).

### P2.4 — EIP-2612 permit on IntelToken
`permit()` enables gasless approvals for staking and minting — eliminates the two-tx UX (approve + stake) into one. Standard for production DeFi tokens.

```solidity
// Add to IntelToken:
bytes32 public DOMAIN_SEPARATOR;
mapping(address => uint256) public nonces;
function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external { ... }
```

### P2.5 — EIP-712 structured signing for attestations
**Current:** `AgentIdentityRegistry.getAttestationDigest()` uses raw `keccak256(abi.encodePacked(...))`.  
**Target:** EIP-712 domain separator + typed data hash. Makes attestations wallet-displayable and cross-chain unambiguous.

```solidity
bytes32 public constant ATTESTATION_TYPEHASH = keccak256(
    "Attestation(bytes32 fingerprint,bytes32 jobId,uint256 score,address reviewer,bool payoutReleased)"
);
```

---

## Phase 3 — Marketplace scale (pre-derivatives)

**Effort: 4–8 weeks**

### P3.1 — INTEL/WETH Uniswap V3 pool bootstrap
POL address currently collects 50% of mint proceeds in ETH. These funds should be deployed as INTEL/WETH concentrated liquidity (±20% range around current price) each epoch by a keeper. This is the on-chain price discovery mechanism.

### P3.2 — Keeper for epoch automation
Automate: `advanceEpoch()`, `updateUtilization()`, `updateTWAP()`, POL liquidity deployment. A simple Gelato or Keeper Network job is sufficient.

### P3.3 — AgentIdentityRegistry composability
Document the `getReputation(fingerprint)` interface for downstream protocols. The value proposition is that any protocol can gate on verified AI output without depending on the IEX marketplace to remain operational. This requires the registry to be immutable or have a Timelock-gated upgrade path.

### P3.4 — Staking allowance calibration
The current `k * sqrt(staked)` formula produces tiny allowances (10,000 INTEL staked → ~316e9 wei allowance). Calibration is needed for real token amounts. Suggested: `k = 1e9` so 10,000 INTEL staked → ~316e12 = ~0.000316 INTEL allowance. This still implies ~3M staked for 1 INTEL of allowance — extremely conservative. Recommend setting `walletCap` aggressively to be the practical limit and using `k` as a floor-shaping parameter only.

---

## Phase 4 — Intelligence derivatives (12+ months)

This is documented in `APPLICATION.md §3` — the AIU perpetuals layer. Prerequisite: 6+ months of on-chain index history from Phase 3.

---

## Prioritized "must-do before Alliance DAO funding" list

If Alliance DAO reviews the repo before a public demo is live, the following items are the minimum credibility bar:

1. **P1.3** — Wire on-chain attestation write (proves Layer 1 data generation works end-to-end on-chain)
2. **P1.2** — Wire WorkReceipt1155 mint on acceptance (tangible on-chain artifact per job)
3. **P1.1** — Public deploy with live URLs (testnet is fine, but "click here to see it" is required)
4. **P2.1** — Document TWAP oracle path (even if not implemented, a clear migration plan shows architectural seriousness)
5. **P2.2 + P2.3** — Timelock + multisig plan (investors need to know how admin key risk is managed)

---

## What NOT to do before funding

- Do not implement AIU derivatives before marketplace data exists
- Do not build a DAO governance token — INTEL is not a governance token and adding voting risks misalignment
- Do not add cross-chain bridges before the reputation primitive is composable on a single chain
- Do not add a custodial stablecoin on-ramp — keep the stack chain-native
