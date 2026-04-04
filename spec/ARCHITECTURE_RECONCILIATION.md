# Architecture vs Code Reconciliation

## Status: 2026-04-04

This document reconciles claims in the README/architecture with actual code implementation.

## ✅ Fully Implemented

### ERC-8004 Agent Identity
| Component | Status | Location |
|-----------|--------|----------|
| Fingerprint-based identity | ✅ | `AgentIdentityRegistry.registerAgent()` |
| Token ID assignment | ✅ | Auto-incrementing `nextTokenId` |
| Role-based permissions | ✅ | `POSTER_ROLE`, `WORKER_ROLE` |
| Permissions hash | ✅ | Stored in `AgentIdentity` struct |
| Operator verification | ✅ | Via `IdentityGate` before registration |

### AgentBook Integration (Agent Kit)
| Component | Status | Location |
|-----------|--------|----------|
| Human verification | ✅ | `lookupAgentBookHuman()` in `agentkitService.ts` |
| Nonce replay protection | ✅ | `agentkitNonces` table |
| Usage counters | ✅ | `agentkitUsageCounters` table |
| Protected routes | ✅ | `/v1/cannes/agentkit/*` endpoints |

### Reputation Tracking
| Component | Status | Location |
|-----------|--------|----------|
| Acceptance counting | ✅ | `acceptedCount` in Postgres |
| Score averaging | ✅ | `avgScore` calculated from attestations |
| Attestation signatures | ✅ | `issueAcceptedSubmissionAttestation()` |
| Chain sync events | ✅ | `accepted_submission_attested` event type |

## ⚠️ Partial Implementation

### On-Chain Reputation Updates
**What the README says**: "attested reputation updates"

**What's implemented**:
- ✅ Broker creates signed attestations
- ✅ Broker updates reputation in Postgres
- ✅ Smart contract has `recordAcceptedSubmission()` ready
- ❌ **No automatic on-chain sync** - requires separate transaction

**The Flow**:
```
Job Accepted
    ↓
Broker creates attestation (signature stored in Postgres)
    ↓
Postgres reputation updated (acceptedCount++, avgScore recalculated)
    ↓
[MANUAL STEP NEEDED] Submit attestation to AgentIdentityRegistry
    ↓
On-chain reputation updated (if attestation submitted)
```

**Why this design?**
- Gas optimization: Not every acceptance needs on-chain storage
- Attestations can be batch-submitted or challenged
- Postgres serves as "hot" reputation, on-chain as "cold" attested backup

**To complete on-chain sync**:
```typescript
// After job acceptance, additionally call:
AgentIdentityRegistry.recordAcceptedSubmission(
  fingerprint,
  jobIdHash,
  score,
  reviewerAddress,
  payoutReleased,
  signature  // From attestation
)
```

## 🔍 Clarifications

### Reputation Based on Earnings
**README claim**: "reputation increments depending on their earnings"

**Actual implementation**: Reputation increments on **accepted work count and quality score**, not directly earnings.

**Why**: 
- Job budgets vary widely
- A $10 job and $1000 job both count as "1 acceptance"
- Quality score (0-100) is the differentiator
- High-earners will naturally have high acceptance counts

**If earnings-based reputation is desired**, the formula would be:
```
reputation_score = (acceptedCount * avgScore) + (totalEarnings / normalizationFactor)
```

### AgentBook Data Flow
**Architecture diagram shows**: "human-backed agent discovery" arrow

**Actual flow**:
1. Agent registers wallet with AgentBook CLI
2. AgentBook stores mapping: wallet → humanId (on Worldchain)
3. Broker queries AgentBook contract via AgentKit SDK
4. Broker stores `agentbookHumanId` in authorization record
5. Protected routes require valid Agent Kit header + nonce

**Not implemented**:
- ❌ Broker does NOT write to AgentBook (read-only)
- ❌ Reputation is NOT stored in AgentBook (stored in IEX Registry + Postgres)

## 📋 Action Items

### Option 1: Update Documentation (Quick Fix)
Update README to clarify:
- "ERC-8004-aligned registration" (not full compliance)
- "Postgres-tracked reputation with on-chain attestation capability"
- "AgentBook-verified, IEX Registry-registered"

### Option 2: Implement Automatic On-Chain Sync (Full Implementation)
Add to `chainService.ts`:
```typescript
// After updating Postgres reputation
await submitAttestationToChain(attestation);
// This calls AgentIdentityRegistry.recordAcceptedSubmission()
```

Trade-offs:
- Gas costs per acceptance
- Transaction latency
- But provides immutable on-chain reputation

### Option 3: Batch On-Chain Sync (Hybrid)
- Reputation tracked in Postgres (real-time)
- Periodic batch submission to on-chain registry
- Balances gas costs with on-chain verifiability

## Recommended Path

For Cannes MVP: **Option 1** (document current state)
- Update README to be precise about what's implemented
- Clarify "ERC-8004-aligned" vs "ERC-8004-compliant"
- Note that on-chain reputation is capability, not automatic

Post-Cannes: **Option 3** (batch sync)
- Add background job to batch-submit attestations
- Keep Postgres as source of truth for speed
- On-chain as audit trail and cross-protocol reputation
