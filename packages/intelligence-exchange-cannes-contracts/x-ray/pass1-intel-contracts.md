# X-Ray Security Audit: Intelligence Exchange ETHGlobal Cannes 2026

**Audited:** 2026-05-27  
**Auditor:** claude-sonnet-4-6 (X-Ray Pass 1)  
**Scope:** `packages/intelligence-exchange-cannes-contracts/src/` — 8 contracts  
**Test Status (pre-audit):** 99/99 passing  
**Test Status (post-fix):** 99/99 passing

---

## Enumeration

### SLOC (non-blank, non-comment lines)

| Contract | SLOC | External Fns | Internal Fns | Public Fns |
|----------|------|-------------|--------------|------------|
| IdentityGate.sol | 37 | 4 | 0 | 0 |
| IntelToken.sol | 130 | 9 | 4 | 0 |
| AgentIdentityRegistry.sol | 148 | 8 | 0 | 2 |
| IdeaEscrow.sol | 146 | 7 | 0 | 0 |
| WorkReceipt1155.sol | 154 | 11 | 1 | 3 |
| IntelMintController.sol | 221 | 11 | 3 | 1 |
| IntelStaking.sol | 252 | 12 | 7 | 0 |
| AdvancedArcEscrow.sol | 669 | 22 | 5 | 0 |

**Total:** 8 contracts, 1,757 SLOC

### Function Inventory

**IdentityGate.sol**
- `setVerified(address, bytes32, bool)` — onlyAttestor
- `revokeRole(address, bytes32)` — onlyAttestor
- `isVerified(address, bytes32)` — view
- `setAttestor(address)` — onlyOwner

**IntelToken.sol**
- `transfer`, `approve`, `transferFrom` — ERC-20 core
- `mint(address, uint256)` — onlyOwner
- `burn(uint256)`, `burnFrom(address, uint256)` — whenNotPaused
- `pause()`, `unpause()` — onlyOwner
- `transferOwnership(address)` — onlyOwner

**AgentIdentityRegistry.sol**
- `registerAgent(string, string, bytes32, bytes32)` — permissionless (role-gated via IdentityGate)
- `recordAcceptedSubmission(bytes32, bytes32, uint256, address, bool, bytes)` — permissionless (signature-gated)
- `getReputation`, `getAvgScore`, `isRegistered`, `getAgentByTokenId` — view
- `setAttestor(address)`, `setIdentityGate(address)` — onlyOwner
- `getAttestationDigest`, `recoverSigner` — pure/view

**IdeaEscrow.sol**
- `fundIdea(bytes32, address, uint256)` — permissionless
- `reserveMilestone`, `reserveMilestones` — poster-only
- `releaseMilestone(bytes32, bytes32, address)` — poster-only
- `refundMilestone(bytes32, bytes32, address)` — poster-only
- `getIdeaBalance`, `getMilestoneStatus` — view

**WorkReceipt1155.sol**
- `mint(address, bytes32, bytes32, uint8)` — onlyOperator
- `balanceOf`, `balanceOfBatch`, `uri`, `getReceipt`, `getReceiptByTask` — view
- `setApprovalForAll`, `safeTransferFrom`, `safeBatchTransferFrom` — always revert (soulbound)
- `setOperator`, `setBaseURI`, `transferOwnership` — onlyOwner

**IntelMintController.sol**
- `executeMint(address, uint256, uint256)` — onlyOperator, payable
- `executeMintERC20(address, uint256, address, uint256, uint256)` — onlyOperator
- `updateTWAP(uint256)`, `updateUtilization(uint256, uint256)` — onlyOperator
- `mintPrice()`, `quoteMint(uint256)` — view
- `setFloorPrice`, `setPremium`, `setOperator`, `setRoutingAddresses`, `transferOwnership` — onlyOwner

**IntelStaking.sol**
- `stake(uint256)`, `requestUnstake(uint256)`, `unstake()` — permissionless
- `depositYield(uint256)` — permissionless
- `claimYield()` — permissionless
- `advanceEpoch()` — permissionless
- `mintAllowance(address)` — view
- `consumeAllowance(address, uint256)` — onlyOperator
- `setOperator`, `setParams`, `transferOwnership` — onlyOwner

**AdvancedArcEscrow.sol**
- `fundIdea(bytes32, uint256)` — onlyVerifiedPoster
- `reserveMilestone`, `reserveMilestones` — onlyPoster
- `submitMilestone(bytes32, bytes32)` — onlyVerifiedWorker
- `startReview(bytes32)` — onlyVerifiedReviewer
- `approveMilestone(bytes32, bytes32)` — onlyReviewer(milestoneId)
- `releaseMilestone(bytes32)` — permissionless (state-gated)
- `autoReleaseMilestone(bytes32)` — permissionless (time-gated)
- `raiseDispute(bytes32, bytes32)` — stakeholder-only
- `resolveDispute(bytes32, DisputeResolution, uint256)` — onlyResolver
- `autoResolveDispute(bytes32)` — permissionless (time-gated)
- `refundMilestone(bytes32)` — poster or owner
- `withdrawAvailable(bytes32, uint256)` — onlyPoster
- Admin: `setTreasuryReceiver`, `setStakerYieldReceiver`, `setDisputeResolver`, `setReviewTimeout`, `setDisputeWindow`, `transferOwnership` — onlyOwner
- View: `getReleasableAmount`, `getVestingProgress`, `getIdeaBalance`, `getMilestoneStatus`, `getMilestoneDetails`, `getDisputeDetails`, `getPlatformFee`, `canAutoRelease`, `canAutoResolve`

---

## Entry Points (Permissionless vs Role-Gated)

| Function | Contract | Guard |
|----------|----------|-------|
| `fundIdea` | IdeaEscrow | none (any address) |
| `fundIdea` | AdvancedArcEscrow | onlyVerifiedPoster (IdentityGate) |
| `registerAgent` | AgentIdentityRegistry | IdentityGate role check |
| `recordAcceptedSubmission` | AgentIdentityRegistry | ECDSA signature |
| `stake` | IntelStaking | none |
| `depositYield` | IntelStaking | none (anyone can inject yield) |
| `advanceEpoch` | IntelStaking | none |
| `releaseMilestone` | AdvancedArcEscrow | state=Approved (no caller check) |
| `autoReleaseMilestone` | AdvancedArcEscrow | time lock |
| `autoResolveDispute` | AdvancedArcEscrow | time lock |

---

## Invariant Checks

| Invariant | Status |
|-----------|--------|
| BPS sum: 8100+900+1000 = 10000 | PASS |
| IdeaEscrow: available ≤ totalFunded | PASS (no direct withdraw path) |
| AdvancedArcEscrow: totalEscrowed accurate | FIXED (was missing decrements) |
| IntelToken: totalSupply ≤ maxSupply | PASS |
| IntelStaking: totalStaked tracks stake/unstake | PASS |
| Milestone state machine: Reserved→Submitted→UnderReview→… | PASS |
| AgentIdentityRegistry: jobId replay protection | PASS (attestedJobs mapping) |

---

## CRITICAL Findings

### C-1: IdeaEscrow — Cross-Idea Milestone Balance Inflation via refundMilestone
**Contract:** `IdeaEscrow.sol`  
**Functions:** `refundMilestone()`, `releaseMilestone()`  
**Lines:** 187–207, 154–184  

**Issue:** Neither `releaseMilestone` nor `refundMilestone` verify that the supplied `milestoneId` actually belongs to the supplied `ideaId`. The contract stores a `milestoneIdea` mapping for exactly this purpose but never consults it in these functions.

**Attack scenario (refundMilestone):**
1. PosterA funds ideaA with 1,000 USDC.
2. PosterB funds ideaB with 1,000 USDC and reserves milestoneB for 500 USDC.
3. PosterA calls `refundMilestone(ideaA, milestoneB, posterA)`.
   - Auth passes: `fund = ideas[ideaA]`, `msg.sender = posterA = fund.poster`.
   - `m = milestones[milestoneB]`, status = Reserved.
   - `m.status` set to Refunded.
   - `fund.available += 500` → ideaA.available = **1,500** (overclaimed by 500).
4. PosterA can now reserve or release milestones worth 1,500 USDC total, draining 500 USDC that belongs to PosterB.

**Attack scenario (releaseMilestone):**
- PosterA calls `releaseMilestone(ideaA, milestoneB, workerX)`.
- milestoneB.status is set to Released; ideaA's token balance pays out milestoneB.amount.
- PosterB's milestone is permanently marked Released with no payment received.

**Impact:** CRITICAL — direct fund theft; posters can inflate available balances and drain escrowed funds belonging to other posters.

**Fix applied:** Added binding check in both functions:
```solidity
if (milestoneIdea[milestoneId] != ideaId) revert Unauthorized();
```

---

## HIGH Findings

### H-1: AgentIdentityRegistry — Zero Address Attestor Enables Signature Bypass
**Contract:** `AgentIdentityRegistry.sol`  
**Functions:** `constructor()`, `setAttestor()`  
**Lines:** 55–59, 143–146  

**Issue:** The constructor accepted `_attestor = address(0)` without revert. `ecrecover` returns `address(0)` for malformed signatures. If `attestor == address(0)`, any call to `recordAcceptedSubmission` with a garbage 65-byte signature would pass the `recovered != attestor` check (both `address(0)`) and write arbitrary reputation scores.

`setAttestor` also accepted `address(0)`, allowing the owner to accidentally lock the contract into this bypassed state.

**Impact:** HIGH — arbitrary reputation inflation, potentially breaking the entire trust model.

**Fix applied:**
```solidity
// constructor
if (_identityGate == address(0)) revert Unauthorized();
if (_attestor == address(0)) revert Unauthorized();

// setAttestor
if (_attestor == address(0)) revert Unauthorized();
```

---

### H-2: IntelStaking — ERC-20 Return Values Not Checked
**Contract:** `IntelStaking.sol`  
**Functions:** `stake()`, `unstake()`, `depositYield()`, `_settleYield()`  
**Lines:** 143, 179, 190, 300  

**Issue:** All four `intel.transfer` / `intel.transferFrom` calls were unchecked. While `IntelToken` reverts on failure (making this safe with the current token), the ERC-20 standard permits returning `false` without reverting. A future token swap or upgrade could silently fail, resulting in state changes (stake credits, yield debt updates) without corresponding token movement.

**Impact:** HIGH in generic ERC-20 context; MEDIUM given IntelToken always reverts. Fixed proactively for correctness.

**Fix applied:** Added return-value checks with `require` on all four calls.

---

## MEDIUM Findings

### M-1: AdvancedArcEscrow — totalEscrowed Not Decremented on Release/AutoRelease/Dispute
**Contract:** `AdvancedArcEscrow.sol`  
**Functions:** `_releaseMilestone()`, `autoReleaseMilestone()`, `_resolveDispute()`  
**Lines:** 522–574, 581–620, 676–754  

**Issue:** `totalEscrowed` is incremented in `fundIdea` and decremented in `refundMilestone` and `withdrawAvailable`, but never decremented when funds are released to workers (three release paths). After any successful release, `totalEscrowed` overstates the actual USDC held by the contract. Downstream systems or monitoring relying on this value would see incorrect data.

**Impact:** MEDIUM — off-chain accounting breakage; potential basis for future oracle or UI exploits.

**Fix applied:** Added `totalEscrowed -= amount` (or `toRelease`) in all three release code paths.

---

### M-2: AdvancedArcEscrow — Rounding Dust Left in Contract
**Contract:** `AdvancedArcEscrow.sol`  
**Functions:** `_releaseMilestone()`, `autoReleaseMilestone()`, `_resolveDispute()`  

**Issue:** Three independent integer divisions (`amount * 8100 / 10000`, `amount * 900 / 10000`, `amount * 1000 / 10000`) each truncate independently. For any amount not divisible by 10,000, up to 2 wei of USDC dust per release stays permanently in the contract. No sweep function exists.

**Example:** amount = 10,001 → worker=8,100, staker=900, treasury=1,000 → total=10,000, dust=1.

**Impact:** MEDIUM — dust accumulates permanently; protocol slightly under-pays workers.

**Fix applied:** Worker receives the *remainder* (`toRelease - stakerAmount - treasuryAmount`) in `_releaseMilestone` and `autoReleaseMilestone`, eliminating dust. `_resolveDispute` already used this pattern correctly (`workerPool = m.amount - stakerAmount - treasuryAmount`).

---

### M-3: AdvancedArcEscrow — transferOwnership Missing Zero-Address Check and Event
**Contract:** `AdvancedArcEscrow.sol`  
**Function:** `transferOwnership()`  
**Lines:** 908–910  

**Issue:** The original `transferOwnership` accepted `address(0)` (permanently bricking owner-gated admin functions) and emitted no event, making ownership changes invisible to off-chain monitoring.

**Impact:** MEDIUM — irreversible owner loss with no audit trail.

**Fix applied:**
```solidity
function transferOwnership(address newOwner) external onlyOwner {
    if (newOwner == address(0)) revert Unauthorized();
    emit OwnershipTransferred(owner, newOwner);
    owner = newOwner;
}
```

---

### M-4: AdvancedArcEscrow — Admin Setters Accept Zero Address for Yield/Treasury Receivers
**Contract:** `AdvancedArcEscrow.sol`  
**Functions:** `setTreasuryReceiver()`, `setStakerYieldReceiver()`  

**Issue:** Both functions accepted `address(0)`, which would cause all subsequent ERC-20 transfers to those receivers to go to the zero address (burned). While IntelToken's `_transfer` checks `to != address(0)`, USDC on Arc does not necessarily. If called with zero, all future releases would revert at the transfer step, locking every open milestone.

**Impact:** MEDIUM — denial-of-service on all future milestone releases if misconfigured.

**Fix applied:** Added `if (addr == address(0)) revert Unauthorized()` and added events `TreasuryReceiverUpdated`, `StakerYieldReceiverUpdated`.

---

### M-5: AdvancedArcEscrow.reserveMilestones — Batch Missing Per-Item Validation
**Contract:** `AdvancedArcEscrow.sol`  
**Function:** `reserveMilestones()` (batch)  
**Lines:** 395–443  

**Issue:** The single-item `reserveMilestone` validates `amount == 0`, `vestingDuration < MIN_VESTING_DURATION`, and `vestingCliff > vestingDuration`. The batch version only aggregated amounts; it did not validate individual items, did not check `fund.exists`, and did not enforce vesting constraints per item.

**Impact:** MEDIUM — zero-amount milestones could be created (wasting state); invalid vesting parameters accepted in batch but rejected in single.

**Fix applied:** Added per-item validation loop and `fund.exists` check before balance deduction.

---

## LOW Findings

### L-1: IntelStaking — requestUnstake Resets Cooldown on Existing Pending Unstake
**Contract:** `IntelStaking.sol`  
**Function:** `requestUnstake()`  
**Lines:** 149–165  

**Issue:** `s.unstakeAvailableAt = block.timestamp + cooldown` overwrites any existing cooldown. A user with a nearly-expired 3-day cooldown can call `requestUnstake(1 wei)` to reset it back to 3 days. This delays their own unstake but also means the cooldown guard can be gamed by a user who changes their mind and wants to keep accumulating epoch allowances while having tokens "pending unstake."

**Impact:** LOW — only affects the caller; no fund loss for other users.

**Recommendation:** Track cooldowns per-request or require `pendingUnstake == 0` before starting a new one.

**Status:** Not auto-fixed (would require more invasive redesign).

---

### L-2: AgentIdentityRegistry — No EIP-712 Structured Data Signing
**Contract:** `AgentIdentityRegistry.sol`  
**Function:** `recordAcceptedSubmission()` / `recoverSigner()`  

**Issue:** Uses raw `keccak256(abi.encodePacked(...))` with `"\x19Ethereum Signed Message:\n32"` prefix, which is EIP-191 personal sign rather than EIP-712 typed data. Wallets display this as an opaque 32-byte hash. There is no domain separator for the contract name/version.

**Impact:** LOW — not a direct vulnerability, but reduces auditability and phishing resistance.

**Recommendation:** Migrate to EIP-712 with a proper domain separator.

---

### L-3: IdeaEscrow — No Withdraw Function for Poster
**Contract:** `IdeaEscrow.sol`  

**Issue:** The `refundMilestone` function restores funds to `fund.available` (in-contract escrow pool), but there is no `withdrawAvailable()` function to let a poster retrieve unallocated USDC back to their wallet. Funds can be trapped indefinitely. The comment on line 203 acknowledges this as a "future feature."

**Impact:** LOW — funds are safe but inaccessible (no theft vector).

**Recommendation:** Implement a `withdrawIdea(bytes32 ideaId, uint256 amount)` function gated to the poster.

---

### L-4: IntelStaking.depositYield — Permissionless Injection
**Contract:** `IntelStaking.sol`  
**Function:** `depositYield()`  

**Issue:** Anyone can call `depositYield` to inject INTEL into the yield pool. This is intentional for MintController and settlement contracts, but there is no access control. A griefer could dust-inject tiny amounts to trigger `accYieldPerShare` updates, causing precision rounding effects at scale.

**Impact:** LOW — only INTEL sent by the caller, no way to drain the pool; rounding effects are negligible at realistic amounts.

**Recommendation:** Add an operator whitelist or accept the open design with a comment.

---

### L-5: block.timestamp Usage in Time-Sensitive Logic
**Contracts:** `IntelStaking.sol`, `AdvancedArcEscrow.sol`  

**Issue:** All time comparisons use `block.timestamp`, which validators can skew by up to ~12 seconds per block on Ethereum mainnet. On Arc testnet this may differ.

**Impact:** LOW — 12-second validator bias is unlikely to matter for 3-day cooldowns or 7-day review windows.

**Recommendation:** Acceptable for this use case; document the assumption.

---

## INFO Findings

### I-1: IntelToken — approve() Not Pausable
`approve()` is not guarded by `whenNotPaused`. When paused, users can still grant/revoke allowances but cannot transfer. This is likely intentional (allows revoking approvals during a pause), but differs from some ERC-20 implementations.

### I-2: WorkReceipt1155 — No URI Validation
`setBaseURI` accepts arbitrary strings with no format check. An admin could set a malformed URI.

### I-3: AdvancedArcEscrow — Reviewer Can Be the Poster
`startReview` only checks `onlyVerifiedReviewer`, not that the reviewer is different from the poster. A poster verified as both poster and reviewer could self-review their own milestone.

**Recommendation:** Add `require(msg.sender != ideas[m.ideaId].poster)` in `startReview`.

### I-4: IntelMintController — TWAP Staleness Not Enforced
`twapUpdatedAt` is tracked but never checked in `mintPrice()`. A stale TWAP (days old) continues to influence pricing without revert.

**Recommendation:** Add a staleness guard: `require(block.timestamp - twapUpdatedAt <= MAX_TWAP_AGE)`.

### I-5: No Test Coverage for Cross-Poster Attack Paths
The IdeaEscrow test suite tests only single-poster scenarios. The CRITICAL finding (C-1) was not caught by existing tests.

**Recommendation:** Add tests that:
- Create two posters with separate ideas
- Attempt cross-idea `releaseMilestone` / `refundMilestone`
- Verify `Unauthorized()` is reverted

---

## CEI Pattern Analysis

| Contract | Pattern | Verdict |
|----------|---------|---------|
| IdentityGate | No external calls in state-changing functions | SAFE |
| IntelToken | Effects before transfer callbacks (N/A) | SAFE |
| AgentIdentityRegistry | State update (attestedJobs) before ecrecover return check | SAFE |
| IdeaEscrow | Status updated before transfer | SAFE |
| WorkReceipt1155 | State before mint event | SAFE |
| IntelMintController | Allowance consumed before mint before ETH send | SAFE |
| IntelStaking | yieldDebt updated before transfer in _settleYield | SAFE |
| AdvancedArcEscrow | releasedAmount + status updated before transfers | SAFE |

All contracts follow CEI. No reentrancy vulnerabilities found.

---

## ERC-20 Return Value Analysis

| Contract | Calls | Checked (post-fix) |
|----------|-------|---------------------|
| IdeaEscrow | transferFrom, transfer (×3) | YES |
| IntelMintController | _transferFrom, _transfer (low-level) | YES (ABI decode) |
| IntelStaking | transferFrom (×2), transfer (×2) | YES (FIXED) |
| AdvancedArcEscrow | transferFrom, transfer (×6+) | YES |

---

## Access Control Summary

| Contract | Owner | Operator | Attestor | Other |
|----------|-------|----------|---------|-------|
| IdentityGate | setAttestor | — | setVerified, revokeRole | — |
| IntelToken | mint, pause, transferOwnership | — | — | — |
| AgentIdentityRegistry | setAttestor, setIdentityGate | — | signature-gated | — |
| IdeaEscrow | — | — | — | poster (msg.sender) |
| WorkReceipt1155 | admin | mint | — | — |
| IntelMintController | config | executeMint, updateTWAP | — | — |
| IntelStaking | setParams | consumeAllowance | — | — |
| AdvancedArcEscrow | admin | — | — | resolver, poster, worker, reviewer |

---

## BPS Invariant Verification

```
IdeaEscrow:        8100 + 900 + 1000 = 10000 ✓
AdvancedArcEscrow: 8100 + 900 + 1000 = 10000 ✓
IntelMintController: 5000 + 4500 + 500 = 10000 ✓
```

---

## Git History Analysis

```
0a1ec26 fix(contracts): remove platformFeesReserved dead variable
7753df9 fix(contracts): AdvancedArcEscrow 81/9/10 settlement split
849c219 fix(contracts): AdvancedArcEscrow 81/9/10 settlement split — add stakerYieldReceiver
2685173 fix(broker+contracts): IdeaEscrow 81/9/10 split, arc webhook HMAC auth
285ff0e feat(contracts): add IntelStaking + IntelMintController
27f94cc security(audit): CSO scan + protocol suite refactoring
629180d fix: platform fee double-counting and division by zero in vesting
940d384 feat(arc): AdvancedArcEscrow for Prize 1
```

Observations:
- Active remediation history — multiple split/fee fixes already applied.
- Prior CSO scan (commit 27f94cc) was performed.
- No suspicious commits or dependency tampering detected.

---

## Summary

| Severity | Count | Auto-Fixed |
|----------|-------|-----------|
| CRITICAL | 1 | YES (C-1: cross-idea milestone binding) |
| HIGH | 2 | YES (H-1: attestor zero-address; H-2: ERC-20 returns) |
| MEDIUM | 5 | YES (M-1: totalEscrowed; M-2: rounding dust; M-3: ownership; M-4: admin setters; M-5: batch validation) |
| LOW | 5 | NO (design decisions; L-1 noted for future) |
| INFO | 5 | NO (recommendations only) |

**Post-fix test status:** 99/99 PASSING

---

## Auto-Fixes Applied

### IdeaEscrow.sol
- `releaseMilestone`: added `if (milestoneIdea[milestoneId] != ideaId) revert Unauthorized();`
- `refundMilestone`: added `if (milestoneIdea[milestoneId] != ideaId) revert Unauthorized();`

### AgentIdentityRegistry.sol
- `constructor`: added zero-address guards for `_identityGate` and `_attestor`
- `setAttestor`: added zero-address guard

### IntelStaking.sol
- `stake()`: return value of `intel.transferFrom` now checked
- `unstake()`: return value of `intel.transfer` now checked
- `depositYield()`: return value of `intel.transferFrom` now checked
- `_settleYield()`: return value of `intel.transfer` now checked

### AdvancedArcEscrow.sol
- Added events: `OwnershipTransferred`, `TreasuryReceiverUpdated`, `StakerYieldReceiverUpdated`
- `transferOwnership`: added zero-address guard + event emit
- `setTreasuryReceiver`: added zero-address guard + event emit
- `setStakerYieldReceiver`: added zero-address guard + event emit
- `_releaseMilestone`: fixed dust rounding (worker gets remainder); added `totalEscrowed -= toRelease`
- `autoReleaseMilestone`: fixed dust rounding (worker gets remainder); added `totalEscrowed -= m.amount`
- `_resolveDispute`: added `totalEscrowed -= m.amount`
- `reserveMilestones` (batch): added per-item zero-amount check, vesting period check, cliff check, and `fund.exists` check
