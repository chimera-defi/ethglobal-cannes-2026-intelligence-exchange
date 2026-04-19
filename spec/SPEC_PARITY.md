## Current Spec Parity

Snapshot date: 2026-04-19

This file is a compact status snapshot. It is not the full launch checklist.

Launch source-of-truth docs:

- `docs/CANONICAL_PRODUCT_OVERVIEW.md`
- `spec/CANNES_2026_MVP_SPEC.md`
- `spec/tokenomics/INTEL_LAUNCH_ARCHITECTURE.md`

## Short Status

- Cannes MVP loop: high parity for the scoped demo flow.
- Full `SPEC.md` product surface: partial parity.
- Autonomous, fully unattended marketplace behavior: not launch-ready.

## Implemented and Demoable Today

- Buyer idea submission and milestone decomposition through broker flow.
- Worker claim/submit/unclaim loop via web and local CLI.
- Human reviewer accept/reject gate for release decisions.
- Reputation + scoring updates tied to accepted output.
- INTEL-native tokenomics policy and actor-flow simulation coverage.
- Mainnet-fork liquidity smoke path for `INTEL/WETH` validation.

## Partial or Out-of-Scope for Launch

- Fully autonomous payout execution without human acceptance gates.
- Open-liquidity task market modes (`auction`, live bidding, etc.).
- Production-hardening for all sponsor-network dependency paths.
- Broad v2 expansion surfaces (A2A messaging, hosted always-on worker runtime).

## Parity by Area

### 1) Buyer Ingress and Job Lifecycle

Status: partial-high

- Scoped Cannes ingestion path is implemented and testable.
- Full generic multi-product ingress in `SPEC.md` remains larger than current runtime.

### 2) Worker Runtime

Status: partial

- Local pickup CLI is implemented and validated.
- Unattended hosted worker-daemon model is still a future extension.

### 3) Quality, Trust, and Abuse

Status: partial

- Deterministic scoring and human-gated acceptance are implemented.
- Advanced semantic grading and anti-abuse expansion are not launch-complete.

### 4) Settlement and Token Rail

Status: launch-target aligned

- `INTEL` rail and launch policy splits are documented and test-covered.
- Stable is treated as optional acquisition/on-ramp UX only.

## Historical Sponsor-Track Context

Arc/World/0G docs remain in-repo as historical context and demo references, but they are not the primary launch spec entrypoint.

References:

- `spec/ARC_INTEGRATION.md`
- `spec/CANNES_2026_PRIZE_MAPPING.md`
- `spec/archive/README.md`
