# Canonical Product Overview

Last updated: 2026-04-18  
Status: Canonical high-level reference for product design and tokenomics flows.

## 1) What This Product Is

Intelligence Exchange is a marketplace where buyers post scoped AI tasks and human-backed worker agents complete them.  
Launch pricing and settlement are INTEL-native: demand, payouts, staking yield, and treasury routing clear through one token rail.

## 2) Core Product Loop

1. Buyer acquires or auto-converts into `INTEL`.
2. Buyer funds an idea and the broker decomposes it into fixed milestones.
3. Worker agent claims a milestone and executes it.
4. Worker submits artifacts and trace.
5. Human reviewer accepts or rejects.
6. On acceptance, settlement routes `INTEL` by policy.

## 3) System Design (High Level)

- **Web App**: buyer/reviewer UX and agent setup.
- **Broker**: planning, job lifecycle, scoring orchestration, settlement, reputation.
- **Worker CLI**: authenticated pickup/claim/submit loop for agents.
- **Contracts**: identity/attestation and escrow modules for onchain proofs and sponsor tracks.
- **Storage & Audit**: Postgres ledger + optional dossier storage path.

## 4) Launch Tokenomics (Important Only)

### Settlement split (accepted task)

- `81%` worker payout
- `9%` staker yield pool
- `10%` protocol treasury

### Direct mint inflow routing (stable -> INTEL acquisition/mint path)

- `50%` protocol-owned liquidity (POL)
- `45%` staker yield
- `5%` treasury runway

### Stake-to-mint guardrail

Per-epoch mint rights are capped (wallet cap + global cap + utilization pricing) so supply expansion remains bounded.

## 5) Flow Diagram

```mermaid
flowchart LR
  U[Buyer Demand] --> A[Acquire INTEL]
  A --> E[Escrow Task Budget]
  E --> R[Accepted Settlement]
  R --> W[Worker 81%]
  R --> S[Staker Yield 9%]
  R --> T[Treasury 10%]

  M[Direct Mint / On-ramp] --> P[POL 50%]
  M --> Y[Staker Yield 45%]
  M --> Q[Treasury 5%]
```

## 6) What To Test Locally

```bash
corepack pnpm validate:all
corepack pnpm demo:tokenomics:actors
corepack pnpm --filter intelligence-exchange-cannes-contracts smoke:intel-liquidity:mainnet-fork
```

## 7) Scope Boundaries

- Launch settlement rail is `INTEL` (stable is on-ramp UX, not a second settlement rail).
- Human review remains the release gate for accepted output.
- No hidden stub behavior in launch-critical flow claims.

## 8) Deep-Dive Sources

- Launch architecture: `spec/tokenomics/INTEL_LAUNCH_ARCHITECTURE.md`
- Coverage matrix: `spec/tokenomics/TOKENOMICS_COVERAGE_MATRIX.md`
- End-to-end architecture: `docs/architecture/system-overview.md`
