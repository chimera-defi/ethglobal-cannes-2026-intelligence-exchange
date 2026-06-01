# Smart Contract & API Security Audit — PASS 16C
## Scope: Agent Identity, Browser Integration, and Broker API

**Auditor:** devin-delegate  
**Date:** 2026-06-01  
**Commit:** HEAD (main)

---

## Summary Table

| ID | Severity | Component | Finding | Status |
|---|---|---|---|---|
| P16C-1 | **HIGH** | AgentIdentityRegistry | Attestation signature replay: same (fingerprint, jobId, score, reviewer, payoutReleased) can be replayed if signature leaked | Unfixed |
| P16C-2 | **HIGH** | Broker API (jobs.ts) | Agent impersonation: caller can spoof agentFingerprint in demo mode; no on-chain fingerprint verification | Unfixed |
| P16C-3 | **HIGH** | Broker API (jobs.ts) | Missing idempotency keys on claim/submit endpoints enables double-post attacks | Unfixed |
| P16C-4 | **MEDIUM** | ReviewerCredential | Operator can manipulate slash counts to bypass tier requirements | Unfixed |
| P16C-5 | **MEDIUM** | WorkerStakeManager | Slash during unstake cooldown violates "skin in the game" guarantee | Unfixed |
| P16C-6 | **LOW** | Broker API (auth.ts) | Challenge message uses ISO timestamp but no explicit nonce in signature digest | Unfixed |
| P16C-7 | **INFO** | AgentIdentityRegistry | No explicit nonce in registration; relies on operator address uniqueness | By design |

---

## Detailed Findings

### P16C-1 [HIGH] — AgentIdentityRegistry Attestation Signature Replay

**Location:** `AgentIdentityRegistry.sol`, `recordAcceptedSubmission()` (lines 116-139)

**Description:**
The attestation digest in `getAttestationDigest` includes `(address(this), block.chainid, fingerprint, jobId, score, reviewer, payoutReleased)` but lacks a nonce or timestamp. If an attestation signature is leaked (e.g., via broker logs, frontend exposure, or compromised attestor key), an attacker could replay the signature for the exact same tuple. The `attestedJobs` mapping prevents double-attestation of the same `jobId`, but the signature could be replayed if:
1. The same reviewer attests the same agent for a different job with identical parameters
2. An attacker front-runs the legitimate attestation with the leaked signature

**Code:**
```solidity
function getAttestationDigest(
    bytes32 fingerprint,
    bytes32 jobId,
    uint256 score,
    address reviewer,
    bool payoutReleased
) public view returns (bytes32) {
    return keccak256(abi.encodePacked(address(this), block.chainid, fingerprint, jobId, score, reviewer, payoutReleased));
}
```

**Impact:**
- Leaked attestation signatures could be replayed to falsely credit agents with accepted submissions
- Attacker could front-run legitimate attestations to steal reputation rewards
- Compromised attestor key has broader impact due to lack of per-attestation nonces

**Recommendation:**
Add a nonce to the digest and track used nonces:
```solidity
mapping(address => uint256) public attestorNonces;

function recordAcceptedSubmission(
    bytes32 fingerprint,
    bytes32 jobId,
    uint256 score,
    address reviewer,
    bool payoutReleased,
    uint256 nonce,
    bytes calldata signature
) external {
    // ... existing checks ...

    bytes32 digest = keccak256(abi.encodePacked(
        address(this),
        block.chainid,
        fingerprint,
        jobId,
        score,
        reviewer,
        payoutReleased,
        nonce
    ));
    // ... signature recovery ...

    if (attestorNonces[recovered] >= nonce) revert InvalidNonce();
    attestorNonces[recovered] = nonce;
    // ... rest of function ...
}
```

---

### P16C-2 [HIGH] — Broker API Agent Impersonation via Fingerprint Spoofing

**Location:** `apps/intelligence-exchange-cannes-broker/src/routes/jobs.ts`, claim endpoint (lines 456-525)

**Description:**
In non-strict (demo) mode, the broker accepts direct `workerId` submissions without signed actions. The `buildDemoAgentIdentity` function (lines 65-86) derives an `operatorAddress` from the `workerId` and computes a `fingerprint` from optional `agentMetadata`. If `agentMetadata` is omitted or tampered with, the caller can spoof any `agentFingerprint`:

```typescript
const fingerprint = input.agentMetadata?.fingerprint
  ?? computeAgentFingerprint(
      input.agentMetadata?.agentType ?? 'demo-worker',
      input.agentMetadata?.agentVersion ?? '0.0.0',
      operatorAddress,
  );
```

An attacker can:
1. Call `POST /jobs/:jobId/claim` with `workerId = victim_wallet` and `agentMetadata.fingerprint = attacker_fingerprint`
2. The broker records `agentFingerprint = attacker_fingerprint` but `workerId = victim_wallet`
3. On submission, the attacker's fingerprint receives reputation credit for work done by the victim's wallet

**Evidence:**
- Line 488-494: Demo mode bypasses signature verification and uses `buildDemoAgentIdentity`
- Line 518-522: Claim proceeds with potentially spoofed fingerprint
- No on-chain check that the claimed fingerprint matches the wallet's registered fingerprint

**Impact:**
- Attacker can steal reputation by claiming jobs with victim's wallet but their own fingerprint
- Violates the core identity binding: one wallet → one fingerprint → one reputation
- In strict mode, this is mitigated by signature verification, but non-strict deployments are vulnerable

**Recommendation:**
1. In demo mode, require that `agentFingerprint` matches the computed fingerprint from `workerId` (reject custom fingerprints)
2. Add on-chain verification: before recording a submission, query `AgentIdentityRegistry.isRegistered(fingerprint)` and verify that the registered `operatorAddress` matches the submission wallet
3. Remove demo mode or restrict it to localhost-only deployments

**Mitigation in strict mode:**
The strict mode path (lines 466-486) uses `consumeChallenge` with signature verification, which binds the fingerprint to the signing wallet. However, the broker does NOT verify that the signed `agentFingerprint` matches the on-chain registration. A signature proves wallet ownership but not that the wallet owns that fingerprint.

---

### P16C-3 [HIGH] — Missing Idempotency Keys on Job Claim/Submit

**Location:** `apps/intelligence-exchange-cannes-broker/src/routes/jobs.ts`, claim (line 456) and submit endpoints

**Description:**
The `POST /jobs/:jobId/claim` and `POST /jobs/:jobId/submit` endpoints do not accept idempotency keys. If a client retries a request due to network timeout or double-click:
- **Claim**: Could create duplicate claims (though DB constraints may prevent this if `jobId + workerId` is unique)
- **Submit**: Could create duplicate submissions, each triggering attestation and reputation updates

The `recordAcceptedSubmission` contract function has `attestedJobs` protection, but the broker's off-chain reputation update (`updateAgentReputation` in `jobService.ts` line 469) has no such guard.

**Evidence:**
- No `idempotencyKey` parameter in `JobClaimRequestSchema` or `JobResultSubmitRequestSchema`
- No idempotency check in `claimJob` or `submitJob` functions
- `jobService.ts` line 469-490: `updateAgentReputation` increments `acceptedCount` without checking for duplicates

**Impact:**
- Retried submissions could double-count reputation
- Race condition: two concurrent claims could both succeed if DB check happens before insert
- Financial impact if reputation is tied to staking requirements or tier access

**Recommendation:**
Add idempotency keys to all mutation endpoints:
```typescript
// In schema
const JobClaimRequestSchema = z.object({
  idempotencyKey: z.string().uuid(),
  // ... other fields
});

// In handler
const existing = await db.select().from(idempotencyStore)
  .where(eq(idempotencyStore.key, req.idempotencyKey));
if (existing.length > 0) {
  return c.json({ alreadyProcessed: true, claimId: existing[0].resultId });
}
// ... process claim ...
await db.insert(idempotencyStore).values({
  key: req.idempotencyKey,
  resultId: claimId,
  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
});
```

---

### P16C-4 [MEDIUM] — ReviewerCredential Operator Slash Count Manipulation

**Location:** `ReviewerCredential.sol`, `evaluateAndUpdateTier()` (lines 192-222)

**Description:**
The `evaluateAndUpdateTier` function accepts an arbitrary `newSlashCount` parameter from the operator. A malicious or compromised operator could:
1. Set `newSlashCount = 0` for a reviewer with actual slashes, bypassing tier downgrade
2. Set `newSlashCount` artificially high for a competitor reviewer, forcing tier downgrade

The function does not validate that `newSlashCount` is consistent with on-chain slash events from `ReviewerStakeManager`.

**Code:**
```solidity
function evaluateAndUpdateTier(address reviewer, uint256 newSlashCount) external onlyOperator nonReentrant {
    // ...
    slashCount[reviewer] = newSlashCount; // No validation
    // ...
}
```

**Impact:**
- Operator corruption can manipulate reviewer tiers, affecting task assignment priority
- Undermines the meritocratic tier system based on actual performance

**Recommendation:**
Either:
1. Remove `newSlashCount` parameter and query `ReviewerStakeManager.slashes(reviewer)` directly
2. Add validation that `newSlashCount >= storedSlashCount` (only allow increases)
3. Add event logging for slash count changes to enable off-chain audit

---

### P16C-5 [MEDIUM] — WorkerStakeManager Slash During Unstake Cooldown

**Location:** `WorkerStakeManager.sol`, `slash()` (lines 208-252) and `finalizeUnstake()` (lines 164-183)

**Description:**
The `slash` function deducts from both `workerStake` and `pendingUnstake` (line 217). A worker who has requested unstake and is in the 7-day cooldown can still be slashed. The `finalizeUnstake` function has a `slashLockUntil` check (line 170), but this only prevents withdrawal for 1 hour after the slash, not the slash itself.

**Code:**
```solidity
function slash(address worker, uint256 amount, address reporter) external onlyOperator nonReentrant {
    uint256 currentStake = workerStake[worker] + pendingUnstake[worker]; // Includes pending unstake
    // ...
    if (workerStake[worker] >= stakedToSlash) {
        workerStake[worker] -= stakedToSlash;
    } else {
        // Deduct from pending unstake
        pendingUnstake[worker] -= stakedToSlash;
    }
    // ...
}
```

**Impact:**
- Worker's "skin in the game" is not protected during unstake cooldown
- A malicious operator could slash a worker after they've decided to exit, forcing them to lose locked funds
- Violates the expectation that unstake initiates a protected exit period

**Recommendation:**
Add a flag to block slashing during unstake cooldown:
```solidity
mapping(address => uint256) public unstakeRequestedAt; // Track when unstake was requested

function requestUnstake(uint256 amount) external nonReentrant {
    // ...
    unstakeRequestedAt[msg.sender] = block.timestamp;
    // ...
}

function slash(address worker, uint256 amount, address reporter) external onlyOperator nonReentrant {
    // ...
    if (unstakeRequestedAt[worker] > 0 && block.timestamp < unstakeRequestedAt[worker] + cooldown) {
        revert SlashDuringCooldown();
    }
    // ...
}
```

---

### P16C-6 [LOW] — Broker API Challenge Message Timestamp Format

**Location:** `apps/intelligence-exchange-cannes-broker/src/services/authService.ts`, `buildChallengeMessage()` (lines 18-37)

**Description:**
The challenge message includes `Expires At: ${expiresAt.toISOString()}`, which uses ISO 8601 format with milliseconds (e.g., `2026-06-01T12:34:56.789Z`). The signature verification uses `verifyMessageSignature` which signs the full string. If the client and server have different timestamp formatting (e.g., server uses `toISOString()` but client uses a different format), signature verification will fail. This is more of a robustness issue than a security vulnerability.

**Code:**
```typescript
const lines = [
    'Intelligence Exchange Authentication',
    `Purpose: ${purpose}`,
    `Account: ${accountAddress}`,
    `Nonce: ${nonce}`,
    `Expires At: ${expiresAt.toISOString()}`,
];
```

**Impact:**
- Low: Client implementation errors could cause signature verification failures
- Not exploitable by attackers since the attacker cannot control the server's timestamp format

**Recommendation:**
Use Unix timestamp (seconds since epoch) for consistency:
```typescript
`Expires At: ${Math.floor(expiresAt.getTime() / 1000)}`,
```

---

### P16C-7 [INFO] — AgentIdentityRegistry No Explicit Registration Nonce

**Location:** `AgentIdentityRegistry.sol`, `registerAgent()` (lines 84-114)

**Description:**
The registration function does not use a nonce. Replay protection relies on:
1. `msg.sender` being the operator address (line 91)
2. Fingerprint collision being infeasible (line 93-94)

Since registration requires an on-chain transaction with gas, replay attacks are not economically viable (the attacker would pay gas for a registration that benefits the victim). This is by design for a gas-secured system.

**Impact:**
- None: Gas cost prevents practical replay attacks
- Fingerprint uniqueness is enforced by the `AgentAlreadyRegistered` check

**Recommendation:**
No action required. Document that gas cost provides replay protection for registration.

---

## End-to-End Flow Analysis

### Browser → Broker → Contract → UI Trace

**1. Job Claim Flow:**
```
Browser: POST /jobs/:jobId/claim
  ↓
Broker: jobs.ts (line 456)
  ├─ Signed mode: consumeChallenge → verify signature
  ├─ Demo mode: buildDemoAgentIdentity (VULNERABLE: fingerprint spoofing)
  ├─ requireAgentAuthorization (checks DB only, NOT on-chain)
  └─ claimJob → DB insert
  ↓
Contract: None (claim is off-chain in current implementation)
  ↓
UI: Polls /jobs/:jobId for status updates
```

**Trust Break Points:**
- **Demo mode**: Broker trusts client-provided `agentFingerprint` without on-chain verification
- **Authorization check**: `requireAgentAuthorization` checks the `agentAuthorizations` DB table, not the `AgentIdentityRegistry` contract. A compromised database could allow unauthorized fingerprints.
- **No contract call**: Job claim does not touch the blockchain, so contract-level identity checks are bypassed entirely

**2. Job Submission Flow:**
```
Browser: POST /jobs/:jobId/submit
  ↓
Broker: jobs.ts (line 526+)
  ├─ Signed mode: consumeChallenge → verify signature
  ├─ Demo mode: buildDemoAgentIdentity
  ├─ submitJob → checks claim ownership (DB only)
  └─ scoreSubmission → DB insert
  ↓
Contract: None (submission is off-chain)
  ↓
UI: Polls for status
```

**Trust Break Points:**
- Same as claim: demo mode fingerprint spoofing, DB-only authorization checks
- `submitJob` checks `job.activeClaimWorkerId !== accountAddress` (line 263-268), but this is a DB field, not a contract state

**3. Acceptance Flow:**
```
Browser: POST /ideas/:ideaId/accept
  ↓
Broker: ideas.ts (line 182)
  ├─ requireSessionAccountAddress
  └─ acceptJob → DB update
  ↓
Contract: issueAcceptedSubmissionAttestation (off-chain signature by broker attestor)
  ↓
UI: Displays attestation
```

**Trust Break Points:**
- Attestation is signed by the broker's attestor key (`BROKER_ATTESTOR_PRIVATE_KEY`), NOT by the contract
- The `AgentIdentityRegistry.recordAcceptedSubmission` function exists but is NOT called by the broker
- Reputation updates are off-chain (DB only), not written to the contract

**Critical Gap:**
The broker does **not** call `AgentIdentityRegistry.recordAcceptedSubmission` on-chain. This means:
- Contract-level reputation tracking is unused
- The contract's attestation signature verification (lines 129-131) is never exercised
- The entire identity system is off-chain, making it vulnerable to database compromise

---

## Recommendations Summary

### Immediate (HIGH Priority)
1. **Add nonce to attestation digest** (P16C-1)
2. **Remove or secure demo mode** (P16C-2): Either remove fingerprint spoofing or restrict demo mode to localhost
3. **Add on-chain fingerprint verification** (P16C-2): Broker should query `AgentIdentityRegistry` before accepting submissions
4. **Add idempotency keys** (P16C-3) to all mutation endpoints

### Short-term (MEDIUM Priority)
5. **Validate slash counts** (P16C-4): Either query `ReviewerStakeManager` or add monotonicity checks
6. **Protect unstake cooldown** (P16C-5): Block slashing during cooldown period

### Long-term (ARCHITECTURAL)
7. **Bridge broker to contract reputation**: Call `AgentIdentityRegistry.recordAcceptedSubmission` on-chain after acceptance
8. **Move claim/submit to contract**: Consider making job claim and submission on-chain transactions for stronger identity guarantees
9. **Unify identity sources**: Either trust the contract fully (remove DB auth checks) or trust the DB fully (remove contract identity system). The current hybrid approach creates confusion and vulnerabilities.

---

## Testing Recommendations

1. **Replay attack test**: Capture a valid attestation signature, attempt to replay it for the same parameters
2. **Impersonation test**: In demo mode, claim a job with `workerId=A` but `agentFingerprint=B`, verify reputation goes to B
3. **Idempotency test**: Send duplicate claim/submit requests, verify only one is processed
4. **Slash during cooldown test**: Request unstake, then attempt slash before cooldown expires
5. **Cross-chain replay test**: Use an attestation signature from a different chain (should fail due to `block.chainid` check)

---

## Conclusion

The agent identity system has a **critical architectural gap**: the broker operates primarily off-chain with DB-based identity checks, while the contracts provide on-chain identity verification that is never used. This creates a trust boundary at the broker/database layer that is vulnerable to:
- Fingerprint spoofing in demo mode
- Database compromise (no on-chain fallback)
- Missing idempotency leading to double-counting

The contract-level identity system (`AgentIdentityRegistry`, `IdentityGate`, `ReviewerCredential`) is well-designed but **disconnected from the actual broker flow**. Until the broker calls these contracts for identity verification, the on-chain protections provide no security value.

**Overall Risk Level: HIGH** (due to demo mode fingerprint spoofing and missing on-chain verification)