# Roadmap

**Last updated:** 2026-05-08  
**Status:** Post-Cannes planning phase

## Phase 1: Cannes 2026 (Current — Locked)

**Goal:** ETHGlobal Cannes 2026 hackathon submission. One-shot buildable, judgeable in under 5 minutes.

### Delivered
- [x] Milestone marketplace (brief/tasks/scaffold/review)
- [x] Human review gate before payout
- [x] `INTEL`-native settlement (81/9/10 split)
- [x] World ID proof-of-human gating
- [x] Arc escrow contract (AdvancedArcEscrow)
- [x] 0G dossier storage
- [x] Tokenomics actor-flow tests (8/8 covered)
- [x] CI validation gates
- [x] Local deterministic fallback mode
- [x] EscrowStatusPanel + DossierPanel + agent spend visibility

### Demo Checklist
- [ ] Arc testnet contract deployed with real tx
- [ ] Testnet rehearsal script runs end-to-end
- [ ] 0G dossier upload produces retrievable testnet URI
- [ ] Judge flow: submit idea → fund → plan → claim → submit → accept → release → dossier

## Phase 2: Post-Cannes Expansion (Q3 2026)

**Goal:** Launch two adjacent marketplaces reusing the protocol core.

### 2.1 Compute Pool
- Spot/preemptible GPU/CPU marketplace
- TEE attestation (v1: trusted provider, v2: SGX/SEV)
- Instant settlement, 85/5/10 split
- Deliverable: `apps/compute-pool/`, `ComputePool` contract, provider CLI

### 2.2 Inference Market
- Model inference routing marketplace
- LLM-as-judge scoring
- Per-request micro-payments, batched settlement
- 80/10/10 split
- Deliverable: `apps/inference-market/`, `InferenceBatcher` contract, provider SDK

### 2.3 Protocol Core Hardening
- Extract `protocol-core` to standalone installable package
- Full test coverage for `MilestoneEscrow`, `IntelToken`, `IdentityGate`
- Slither/echidna invariant testing
- External audit (if funding available)

## Phase 3: Open Marketplace (Q4 2026)

**Goal:** Remove artificial constraints and grow to a real marketplace.

### 3.1 Open Worker Liquidity
- Remove "one active claim per milestone" restriction
- Add reputation-weighted claim priority
- Worker staking for boosted visibility

### 3.2 Autonomous Payouts
- Optional: remove human review gate for low-stakes milestones
- Automated scoring becomes the release trigger
- Human review remains available for high-stakes work

### 3.3 On-Chain Dispute Court
- Replace offchain dispute resolution with on-chain arbitration
- Staked jurors, slashing for bad votes
- Integrate with Arc dispute mechanism

### 3.4 Cross-Chain Settlement
- Settle on Arc (USDC-native) + Worldchain (identity) + Base (liquidity)
- INTEL bridges between chains
- Unified reputation across chains

## Phase 4: Protocol Governance (2027)

**Goal:** Transition from team-controlled to community-governed protocol.

### 4.1 Treasury Governance
- DAO controls treasury spend
- Proposal system for protocol fee changes
- Staker voting on parameter updates

### 4.2 Token Distribution
- Fair launch: no team premine
- Retroactive grants for early workers and buyers
- Liquidity mining for POL

### 4.3 Ecosystem Grants
- Fund third-party marketplaces built on protocol-core
- SDK grants for agent builders
- Research grants for TEE verification and decentralized judging

## Decision Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-04-18 | INTEL-only settlement rail | Simplifies launch, avoids dual-rail complexity |
| 2026-04-29 | Human review mandatory for v1 | Hackathon safety; autonomous payouts are v3 |
| 2026-05-06 | Security audit + protocol suite refactor | Pre-launch hardening; CSO scan findings |
| 2026-05-08 | Supersede PR #40/#41 with cherry-picks | Conflicts with main; faster resolution than rebase |

## Risk Register

| Risk | Phase | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Arc testnet unavailable for demo | 1 | Medium | High | Local deterministic fallback rehearsed |
| 0G SDK breaking change | 2 | Medium | Medium | Pin version; add runtime check |
| No real GPU providers for compute pool | 2 | High | High | Start with trusted provider model |
| LLM judge cost exceeds inference revenue | 2 | Medium | High | Batch scoring; sample-based judging |
| Smart contract exploit | 3 | Low | Critical | External audit before open marketplace |
| Regulatory uncertainty | 4 | Medium | High | Legal review before DAO launch |
