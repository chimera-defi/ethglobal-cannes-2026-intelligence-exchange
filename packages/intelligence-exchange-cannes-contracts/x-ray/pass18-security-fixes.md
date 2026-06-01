# Smart Contract Security Audit — PASS 18

## Scope: Adversarial review of pass-17 fixes + remediation

**Auditor:** Kimi (adversarial audit) + Claude Sonnet 4.6 + devin-delegate
**Date:** 2026-06-01
**Commits:**
- `c00f5d0` feat(contracts): pass-18a (timelock, LiquidityMining, jury dust)
- `42a1797` fix(contracts): pass-18c2 (re-applied 4 missing pass-17b fixes + fresh findings)
- `81efad6` fix(contracts): pass-18c restore pullTWAP deviation check

**Tests:** 719/720 pass (ForkIntegration excluded — requires live mainnet RPC)

---

## Adversarial Audit Findings (Kimi Pass-18)

Kimi found 8 findings. 4 were real; 4 were false positives (fixes already in code).

| ID | Sev | Contract | Title | Real? | Status |
|---|---|---|---|---|---|
| P18-1 | HIGH | ReviewerStakeManager | Slash lock fix missing | ✅ REAL | Fixed `42a1797` |
| P18-2 | HIGH | IntelStaking | Flow bonus timing fix missing | ✅ REAL | Fixed `42a1797` |
| P18-3 | HIGH | IntelMintController | executeMintERC20 TwapStale bypass | ❌ False positive | Already at line 336 |
| P18-4 | HIGH | IntelMintController | pullTWAP bypass deviation/floor | ❌ False positive | Already in code (regression from C2 restored at `81efad6`) |
| P18-5 | HIGH | DisputeResolution | _rewardJurors rewards all voters | ❌ False positive | jurorVotedUphold already tracked |
| P18-6 | MED | ReviewerCredential | Slash monotonicity fix missing | ✅ REAL | Fixed `42a1797` |
| P18-7 | MED | EpochRewardDistributor | Dust fix missing | ✅ REAL | Fixed `42a1797` |
| P18-8 | MED | BuybackBurn | No TWAP staleness check | ❌ False positive | TWAP_MAX_AGE already enforced |

**Lesson:** Pass-17b Devin task fabricated success for 4 fixes. Only committed a getter function and test file. Kimi adversarial audit caught the gap. Always grep-verify key identifiers after Devin security fix tasks.

---

## Fixes Applied in Pass 18

### Wave A — Known open items (all pre-existing in remote commits)
- `IntelTimelockController`: MINIMUM_DELAY confirmed 2 days (already correct)
- `LiquidityMining`: pendingRewardRate + rateChangeAvailableAt timelock (already correct)
- `DisputeResolution._rewardJurors`: dust distribution to last juror (already correct)

### Wave B — Broker on-chain wiring (c00f5d0)
- `chainService.ts`: `recordAcceptedSubmissionOnChain()` function added
- Calls `AgentIdentityRegistry.recordAcceptedSubmission()` after job acceptance
- Fire-and-forget; gated on `AGENT_IDENTITY_REGISTRY_ADDRESS` env var
- Handles attestor nonce tracking (from P16C-1 fix)
- `.env.example`: `AGENT_IDENTITY_REGISTRY_ADDRESS=` added

### Wave C2 — 4 missing pass-17b fixes + false-positive changes (42a1797)

**P18-1 [HIGH] — ReviewerStakeManager slash lock: FIXED**
- `slashLockUntil` mapping added at line 64
- `SLASH_LOCK_WINDOW = 1 hours` at line 65
- Lock set in `requestUnstake()` line 159
- Lock checked in `finalizeUnstake()` line 176
- Lock extended in `slash()` line 253

**P18-2 [HIGH] — IntelStaking flow bonus timing: FIXED**
- `flowBonusEligibleAt` field added to `StakerInfo` struct at line 68
- Set in `stake()` to `block.timestamp + 1 days` at line 216
- Gate in `_mintAllowance()` at line 514

**P18-6 [MED] — ReviewerCredential slash monotonicity: FIXED**
- `InvalidSlashCount` error defined at line 28
- Monotonicity check in `evaluateAndUpdateTier()` at line 198

**P18-7 [MED] — EpochRewardDistributor reward dust: FIXED**
- `distributed` variable tracks total at line 195
- Dust remainder given to last worker at lines 205-207

### Wave C restore — pullTWAP deviation regression (81efad6)
C2 removed the ±50% deviation check from pullTWAP (P16A-3 protection). Restored:
- Prevents oracle manipulation via short twapPeriod (e.g., 60-second window)
- Tests updated to deploy controllers with initialTWAP near the expected oracle price range

---

## Regression Introduced and Fixed by C2

**C2 regression:** Removed ±50% deviation check from `pullTWAP()`. This re-opened P16A-3 (oracle manipulation via short TWAP window).

**Root cause:** Devin's C2 task was given false-positive findings and "fixed" code that was already correct. In doing so, it rewrote `pullTWAP` and dropped the deviation guard while keeping the floor guard.

**Restored at:** `81efad6`

**Lesson added to `.devin-project-context.md`:** Never re-implement a function that has security guards without preserving all existing checks.

---

## StakerInfo Struct Update

`IntelStaking.StakerInfo` now has 11 fields (added `flowBonusEligibleAt`). Any code unpacking this struct as a tuple must use 11 fields. Current contracts: `DisputeResolution.sol` uses `(uint256 staked,,,,,,,,,)` — needs update if unpacking all fields.

**Current state:** DisputeResolution only reads `staked` (first field), so it's unaffected. If additional fields are read in future, the tuple must be expanded.

---

## Broker On-Chain Identity Gap: CLOSED

The broker now calls `AgentIdentityRegistry.recordAcceptedSubmission()` on-chain after job acceptance. Gated on `AGENT_IDENTITY_REGISTRY_ADDRESS` env var for backward compatibility. The full identity flow is now:

1. Worker submits job (broker validates off-chain)
2. Poster accepts job (broker updates DB)
3. Broker fire-and-forgets `recordAcceptedSubmission` to `AgentIdentityRegistry` on-chain
4. Agent's on-chain reputation is updated

---

## Gas Profile (key functions, post-pass-18)

| Function | Avg Gas | Max Gas | Contract |
|---|---|---|---|
| executeBuyback | 64k | 104k | BuybackBurn |
| executeMint | 129k | 317k | IntelMintController |
| distributeEpochRewards | 125k | 181k | EpochRewardDistributor |
| release | 100k | 192k | TaskEscrow |
| resolveDispute | 163k | 206k | DisputeResolution |
| fundTask | 226k | 254k | TaskEscrow |

All functions well under 500k gas limit. No gas bombs.

---

## Open Items After Pass 18

1. **StakerInfo 11-field note**: DisputeResolution reads only `staked` (safe), but any new tuple unpacking needs 11 fields.
2. **LiquidityMining commitRewardRate**: 2-day timelock added; off-chain tooling needed to track pending rates.
3. **Broker identity wiring**: requires `AGENT_IDENTITY_REGISTRY_ADDRESS` to be set post-deployment for on-chain attestations to fire.

---

## Cumulative Status

- **18 audit passes** completed
- **21 contracts**, **719/720 tests** passing
- **0 open CRITICAL/HIGH** findings
- All pass-17b missing fixes confirmed in source (grep-verified)

*End of Pass 18*
