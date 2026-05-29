# Compute Pool — Architecture

**Status:** Design draft  
**Last updated:** 2026-05-08  
**Depends on:** `packages/protocol-core/` settlement primitives

## Overview

A spot/preemptible compute marketplace where buyers bid for GPU/CPU time and workers (compute providers) supply capacity. Settlement in `INTEL`.

## Key Differences from Intelligence Exchange

| Dimension | Intelligence Exchange | Compute Pool |
|---|---|---|
| Unit of work | Milestone (brief/tasks/scaffold/review) | Compute seconds / GPU-hours |
| Scoring | Human reviewer + deterministic rubric | Objective (job ran? within SLA?) |
| Settlement | Milestone-based with vesting | Instant or hourly |
| Reputation | Human reviewer scores, accepted count | Uptime + completion rate |
| Claim model | Worker claims milestone | Provider registers capacity; broker routes |

## Settlement Primitive

Reuses `protocol-core/contracts/settlement/MilestoneEscrow.sol` with modified parameters:

- `vestingDuration = 0` (instant settlement)
- `disputeWindow = 1 hour` (compute disputes resolve fast)
- Batch multiple compute jobs into a single escrow milestone for gas efficiency

## System Components

### 1. Capacity Registry

Providers register:
- GPU/CPU type and count
- Region/availability zone
- Pricing curve (spot vs. on-demand)
- TEE capability flag

### 2. Job Router

- Buyer submits compute job with resource requirements and max price
- Broker matches to cheapest available provider within SLA
- Preemptible jobs can be evicted if higher-priority job arrives

### 3. Execution Monitor

- Heartbeat from provider every 30s
- Job completion webhook
- SLA violation detection (job exceeded max runtime)

### 4. TEE Attestation (Future)

- Verify compute actually happened inside a trusted execution environment
- Attestation quote submitted with job completion
- Fallback: trusted provider model for v1

### 5. Settlement Engine

- Per-hour or per-job micro-payments
- 85% provider payout / 5% staker yield / 10% treasury
- Batch settlements to reduce gas

## Data Model

### `ComputeJob`
- `jobId`
- `buyerId`
- `resourceType` (gpu-cuda, cpu-x86, etc.)
- `resourceCount`
- `maxPricePerHourIntel`
- `maxDurationMinutes`
- `status` (pending, assigned, running, completed, failed, preempted)
- `assignedProviderId`
- `startedAt`, `completedAt`

### `ProviderCapacity`
- `providerId`
- `resourceType`
- `totalUnits`
- `availableUnits`
- `pricePerHourIntel`
- `region`
- `uptimePercentage`
- `teeEnabled`

## Open Questions

1. **TEE verification**: Is TEE attestation a v1 requirement or v2? If v1, which TEE stack (Intel SGX, AMD SEV, ARM TrustZone)?
2. **Preemptible pricing curve**: How to model spot pricing? Simple auction vs. AMM-style bonding curve?
3. **Provider bonding**: Should providers stake INTEL as a security deposit against SLA violations?
4. **Job eviction policy**: FIFO, priority-weighted, or price-weighted?

## Integration with Protocol Core

```
Buyer demand → Capacity Registry → Job Router → Provider execution
     ↓                ↓               ↓                ↓
  INTEL mint    Provider stake   Batch escrow    MilestoneEscrow
     ↓                ↓               ↓                ↓
  POL + yield   Slashing logic   Hourly batch    Instant release
```

## Migration Path from Cannes

1. Extract `protocol-core` to standalone package (already done)
2. Create `apps/compute-pool/` with capacity registry + router
3. Reuse `packages/protocol-sdk` for settlement calls
4. Add `compute` role to `RoleRegistry`
5. Deploy new `ComputePool` contract extending `MilestoneEscrow`

## Risks

- **Demand uncertainty**: GPU compute demand is lumpy; idle provider capacity is wasteful
- **Provider onboarding**: Getting real GPU providers is harder than getting agent workers
- **SLA enforcement**: Without TEE, "compute happened" is a trust assumption
