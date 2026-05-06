# Compute Pool — Product Spec

## Overview
A spot/preemptible compute marketplace where buyers bid for GPU/CPU time and workers (compute providers) supply capacity. Settlement in INTEL.

## Key Differences from Intelligence Exchange
- **Unit of work**: compute seconds / GPU-hours, not milestones.
- **Scoring**: objective (did the job run? did it complete within SLA?).
- **Settlement**: instant or hourly, not milestone-based.
- **Reputation**: uptime + completion rate, not human reviewer scores.

## Settlement Primitive
Uses `protocol-core/contracts/settlement/MilestoneEscrow.sol` with modified parameters:
- `vestingDuration = 0` (instant settlement)
- `disputeWindow = 1 hour` (compute disputes resolve fast)

## Identity
Same `RoleRegistry` — providers are "workers", buyers are "posters".

## Tokenomics
- 85% provider payout
- 5% staker yield
- 10% protocol treasury

## Open Questions
- How to verify compute actually happened? (TEE attestation, proof-of-work, or trusted provider model?)
- Preemptible pricing curve design.
