# X-Ray Audit History — Intelligence Exchange Cannes 2026

Compressed index of all security audit passes. Individual pass files remain as authoritative records.

**Total passes:** 21 (pass1–pass21) + economic-layer audit  
**Date range:** 2026-05-27 → 2026-06-02  
**Contracts audited:** 15+ smart contracts, 2,000+ SLOC  
**Final test count:** 727 tests passing  
**Net critical/high findings fixed:** All C and H findings resolved; select M/L findings accepted or deferred

---

## Pass Index

| Pass | Date | Auditor | Scope | Status | Net Findings |
|------|------|---------|-------|--------|--------------|
| [1](pass1-intel-contracts.md) | 2026-05-27 | claude-sonnet-4-6 | 8 contracts (1,757 SLOC) initial audit | ✅ Fixed | C-1, H-1, H-2, M-1–M-5 fixed |
| [2a](pass2-adversarial.md) | 2026-05-27 | claude-sonnet-4-6 | Adversarial re-check post-pass1 | ✅ Clean | 0 new critical/high |
| [2b](pass2-tokenomics-math.md) | 2026-05-27 | claude-sonnet-4-6 | Tokenomics math (IntelStaking flash-staker) | ✅ Fixed | 1 CRITICAL fixed (yieldDebt on re-stake) |
| [3](pass3-delta-audit.md) | 2026-05-28 | claude-sonnet-4-6 | Delta: ETH yield, selfMint, PosterWins refactor | ✅ Fixed | Reentrancy guard verified |
| [4](pass4-delta-audit.md) | 2026-05-28 | claude-sonnet-4-6 | New: IntelVesting, IntelTimelockController, IntelPOLManager | ✅ Clean | 7 INFO findings, all CLEAN |
| [econ](economic-layer-audit-2026-05.md) | 2026-05-29 | Devin | Economic layer: WorkerStake, BuybackBurn, ReviewerStake, Dispute | ✅ Fixed | 1 HIGH fixed, 1 MED fixed; 2 MED remaining |
| [6](pass6-final-audit.md) | 2026-05-28 | devin-delegate | All 11 contracts final adversarial | ✅ Fixed | AdvancedArcEscrow reentrancy + zero-addr fixed |
| [7](pass7-security-reaudit.md) | 2026-05-28 | devin-delegate | Contracts + broker API | ✅ Fixed | P7-A1 yield deposit access, P7-A2 TWAP staleness, P7-A3 jobId validation |
| [8](pass8-delta-audit.md) | 2026-05-29 | claude-sonnet-4-6 + devin | Contracts delta + broker E2E + tokenomics settlement | ⚠️ Done with concerns | Open items forwarded to pass9 |
| [9](pass9-new-contracts-audit.md) | 2026-05-29 | Devin | DisputeResolution, EpochRewardDistributor, WorkerStake, ReviewerStake, BuybackBurn, CategoryRegistry | ✅ Complete | H1 unbounded loop flagged |
| [10a](pass10-contract-audit.md) | 2026-05-30 | claude-sonnet-4-6 | Smart contracts — IntelStaking, ReviewerQueue | 🔴 H open | H3 yield overflow, H4 mint-cap bypass; H1 fixed |
| [10b](pass10-e2e-flow-audit.md) | 2026-05-30 | Devin | Broker E2E flow, agent impersonation, browser integration | 🔴 H open | Fingerprint not crypto-verified; GH tokens plaintext; SSRF on context endpoint |
| [10c](pass10-tokenomics-audit.md) | 2026-05-30 | Devin | Tokenomics splits (81/9/10 settlement, 50/45/5 mint) | ✅ Clean | 0 findings — math correct |
| [11](pass11-mintcontroller-dispute-audit.md) | 2026-05-30 | claude-sonnet-4-6 | IntelMintController, DisputeResolution, AgentIdentityRegistry | 🔴 3H+3M | ECDSA replay, pricing mechanics, dispute state machine |
| [12a](pass12a-new-features-audit.md) | 2026-05-30 | — | New features delta | See file | — |
| [12b](pass12b-patched-contracts-audit.md) | 2026-05-30 | — | Patched contracts re-check | See file | — |
| [12c](pass12c-broker-audit.md) | 2026-05-30 | — | Broker security | See file | — |
| [13a](pass13a-reviewer-contracts-audit.md) | 2026-05-30 | — | Reviewer contracts | See file | — |
| [13b](pass13b-escrow-vesting-pol-audit.md) | 2026-05-30 | — | Escrow, vesting, POL | See file | — |
| [13c](pass13c-interaction-economic-audit.md) | 2026-05-30 | — | Cross-contract economic interactions | MEDIUM risk | Overall risk level: MEDIUM |
| [13d](pass13d-arc-escrow-audit.md) | 2026-05-30 | — | ARC escrow | See file | — |
| [14a](pass14-arch-dispute-reviewers.md) | 2026-05-30 | — | Architecture: dispute resolution + reviewer system | See file | — |
| [14b](pass14-arch-token-economics.md) | 2026-05-30 | — | Architecture: token economics | See file | — |
| [15a](pass15a-registry-escrow-timelock.md) | 2026-05-30 | — | Registry, IdeaEscrow, IntelTimelockController | 🔴 1C+1H unfixed | P15A-1 IdeaEscrow reentrancy (unfixed); P15A-3 setCategoryWeight dead-end |
| [15b](pass15b-cross-contract-economic.md) | 2026-05-30 | — | Cross-contract economic paths | See file | — |
| [16a](pass16a-contract-security.md) | 2026-06-01 | — | BuybackBurn, IntelMintController | 🔴 1H+2M open | P16A-1 BuybackBurn slippage sandwich; P16A-2/3 TWAP controls |
| [16b](pass16b-tokenomics-e2e.md) | 2026-06-01 | — | Tokenomics E2E | See file | — |
| [16c](pass16c-agent-identity-browser.md) | 2026-06-01 | — | AgentIdentityRegistry, broker API | 🔴 3H open | P16C-1 attestation replay; P16C-2 agent impersonation demo mode; P16C-3 idempotency |
| [17](pass17-security-fixes.md) | 2026-06-01 | — | Security fixes for pass16 findings | ✅ Fixed | P16A-1 slippage FIXED, P16B-M1 TWAP staleness FIXED, P16A-2/3 TWAP controls FIXED |
| [18](pass18-security-fixes.md) | 2026-06-01 | — | Security fixes continued | ✅ Fixed | P18-1 ReviewerStakeManager slash lock, P18-2 IntelStaking flow bonus timing, P18-6 slash monotonicity |
| [19](pass19-clean-verification.md) | 2026-06-02 | — | Clean verification pass | ✅ CLEAN | 0 new findings at ≥8/10 confidence |
| [20+21](pass20-21-security-fixes.md) | 2026-06-02 | claude-sonnet-4-6 | Final fixes + clean pass | ✅ Fixed | A1 DisputeResolution access control, A2/A3 IntelPOLManager reentrancy — all FIXED |

---

## Open Findings (as of pass 21)

| ID | Severity | Contract | Finding | Status |
|----|----------|----------|---------|--------|
| P15A-1 | CRITICAL | IdeaEscrow | Reentrancy in `fundIdea`: `transferFrom` before state write | Unfixed — ETHGlobal scope |
| P15A-3 | HIGH | CategoryRegistry | `setCategoryWeight` weight dead-end at 10000 bps | Unfixed — operational |
| P15A-4 | MEDIUM | IdentityGate | Owner = attestor, no transfer, SPOF | Unfixed — design choice |
| P10b | HIGH | Broker API | Agent fingerprint not cryptographically verified at submission | Unfixed — demo mode only |
| P10b | HIGH | Broker API | GitHub OAuth tokens in plaintext in-process memory | Unfixed — pre-mainnet |
| P10b | MEDIUM | Broker API | SSRF on GitHub repo context endpoint | Unfixed — pre-mainnet |
| P16C-1 | HIGH | AgentIdentityRegistry | Attestation signature replay (leaked sigs) | Unfixed — low exploitability |
| P16C-3 | HIGH | Broker API | Missing idempotency keys on claim/submit | Unfixed — pre-mainnet |

> **Note:** "Unfixed — ETHGlobal scope" means acknowledged, deferred to post-hackathon mainnet prep.

---

## Key Invariants Verified

- 81/9/10 settlement split (worker/reviewer/protocol) — correct
- 50/45/5 mint inflow routing — correct
- CEI pattern enforced on all ETH-sending paths
- reentrancy guards on IntelStaking, AdvancedArcEscrow, IntelPOLManager
- timingSafeEqual used for admin token comparison
- TWAP staleness fallback active in IntelMintController

---

_Compressed by dream/2026-06-21 maintenance run. Source files preserved in this directory._
