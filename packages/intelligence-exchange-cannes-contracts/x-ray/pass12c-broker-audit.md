# Audit Pass 12C — Broker Services: Correctness + Security Review

**Scope:** Broker service files — referral, tokenomics, job, and GitHub services  
**Date:** 2026-05-30  
**Focus:** Correctness, edge cases, security vulnerabilities, and data consistency

---

## CRITICAL

### settleAcceptedJobCredits() — Missing Idempotency Check
**File:** `apps/intelligence-exchange-cannes-broker/src/services/tokenomicsService.ts:215-298`  
**Severity:** CRITICAL

The `settleAcceptedJobCredits()` function lacks idempotency protection. If called twice for the same job (e.g., due to retry logic, race condition, or bug), it will:

1. Double-deduct `grossIntel` from `ideaTokenReserves.intelReserved` (line 295)
2. Double-credit worker payout and protocol fee splits
3. Double-process referral bonuses

**Evidence:** Lines 292-298 perform unconditional updates to `tokenAccounts.intelReserved` without checking if the job was already settled.

**Recommendation:** Add a `settled` flag to the jobs table or check `onChainSettled` before processing. Wrap the settlement logic in a database transaction with a uniqueness constraint.

---

## HIGH

### Referral Map — Server Restart Data Loss + Double-Pay Risk
**File:** `apps/intelligence-exchange-cannes-broker/src/services/referralService.ts:2`  
**Severity:** HIGH

Referral records are stored in an in-memory `Map` with TODO comment acknowledging persistence is needed (line 1). On server restart:

1. All referral records are lost
2. If the Map is repopulated (e.g., from a backup or replay), `getReferralBonus()` may pay the same referral again
3. No deduplication against persistent storage

**Evidence:** Line 2: `const referralStore = new Map<string, { referrer: string; createdAt: Date }>();`

**Recommendation:** Persist referral records to the `agentIdentities` table or a dedicated `referrals` table with a unique constraint on `(refereeAddress, referrerAddress)`.

---

## MEDIUM

### 6-Month Referral Expiry — Timezone Ambiguity
**File:** `apps/intelligence-exchange-cannes-broker/src/services/referralService.ts:31-32`  
**Severity:** MEDIUM

The 6-month expiry comparison uses `new Date()` which creates dates in the server's local timezone, not UTC. If the server timezone changes or referrals cross DST boundaries, the comparison may be incorrect.

**Evidence:**
```typescript
const sixMonthsAgo = new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000);
if (referral.createdAt < sixMonthsAgo) { ... }
```

**Recommendation:** Use UTC explicitly: `new Date(Date.now()).toISOString()` or store `createdAt` as UTC timestamp in the database.

---

### No Referral Rate Limiting
**File:** `apps/intelligence-exchange-cannes-broker/src/services/referralService.ts:9-23`  
**Severity:** MEDIUM

`registerReferral()` has no limit on how many referrals a single referrer can register. An attacker could:

1. Register thousands of referrals to exhaust memory
2. Create a Sybil attack network to game referral bonuses
3. Cause performance degradation in the Map lookups

**Evidence:** No rate limiting or per-referrer cap in `registerReferral()`.

**Recommendation:** Add a per-referrer cap (e.g., max 100 referrals) and rate limiting (e.g., 10 registrations per minute).

---

### Poster Rebate — Incomplete Status Check
**File:** `apps/intelligence-exchange-cannes-broker/src/services/tokenomicsService.ts:264`  
**Severity:** MEDIUM

The poster rebate calculation only counts jobs with `status = 'accepted'`, but the jobs schema supports additional statuses like `'settled'` or `'completed'` that may also indicate successful completion.

**Evidence:**
```sql
SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) as accepted
```

**Recommendation:** Expand the condition to include all positive outcome statuses: `status IN ('accepted', 'settled', 'completed')`.

---

### rejectJob() — Streak Reset on Invalid State Transition
**File:** `apps/intelligence-exchange-cannes-broker/src/services/jobService.ts:422-450`  
**Severity:** MEDIUM

The streak reset logic (lines 442-450) executes after the status check (line 425), but if the job status check fails, the function throws before reaching the reset. However, if the status check passes but the job was never actually submitted (edge case in state machine), the streak still resets.

**Evidence:** Lines 442-450 reset streak unconditionally after the status transition succeeds.

**Recommendation:** Only reset streak if the job was previously in `'submitted'` or `'accepted'` state (i.e., actual work was done).

---

## LOW

### GitHub SSRF Regex — Insufficient Validation
**File:** `apps/intelligence-exchange-cannes-broker/src/services/githubService.ts:127`  
**Severity:** LOW

The SSRF protection regex `/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/` has gaps:

1. Does not reject URL-encoded characters (e.g., `%2e%2e%2f` for `../`)
2. Does not reject Unicode characters that may bypass validation
3. Does not enforce length limits (could cause buffer overflow in downstream systems)

**Evidence:** Line 127: `if (!/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(fullName))`

**Recommendation:** Add length limits, decode URL encoding before validation, and reject Unicode characters in repo names.

---

### Redis Session Token Collision Risk
**File:** `apps/intelligence-exchange-cannes-broker/src/services/githubService.ts:205`  
**Severity:** LOW

Session tokens are generated using `Math.random().toString(36).substring(2) + Date.now().toString(36)`. While collision is unlikely, `Math.random()` is not cryptographically secure.

**Evidence:** Line 205: `const sessionToken = Math.random().toString(36).substring(2) + Date.now().toString(36);`

**Recommendation:** Use `crypto.randomBytes()` or a proper UUID library for session token generation.

---

## INFO

### Quality Streak Bonus — Not Implemented
**File:** `apps/intelligence-exchange-cannes-broker/src/services/tokenomicsService.ts:248-258`  
**Severity:** INFO

The quality streak bonus feature is commented out with TODO notes. No security concern, but noted for completeness.

**Evidence:** Lines 248-258 are entirely commented out.

---

### Job Streak Tracking — Not Implemented
**File:** `apps/intelligence-exchange-cannes-broker/src/services/jobService.ts:443-448, 482-488`  
**Severity:** INFO

Streak increment and reset logic is commented out with TODO notes. The `consecutiveAccepts` column does not exist in the schema.

**Evidence:** Lines 443-448 and 482-488 reference `consecutiveAccepts` but are commented out.

---

### Referral Bonus Treasury Clamp — Correctly Implemented
**File:** `apps/intelligence-exchange-cannes-broker/src/services/tokenomicsService.ts:280-281`  
**Severity:** INFO

The referral bonus correctly clamps the protocol fee to 0 if the treasury would go negative, preventing underflow.

**Evidence:** Lines 280-281: `if (split.protocolFeeIntel < 0) split.protocolFeeIntel = 0;`

---

### Fingerprint Check — Correctly Handles First-Time Claims
**File:** `apps/intelligence-exchange-cannes-broker/src/services/jobService.ts:256-260`  
**Severity:** INFO

The fingerprint check correctly allows first-time claims (no registered identity) and only validates if a fingerprint is already registered.

**Evidence:** Lines 256-260 check `if (registeredIdentity && registeredIdentity.fingerprint !== agentFingerprint)`.

---

### Redis Fallback — Correctly Implemented
**File:** `apps/intelligence-exchange-cannes-broker/src/services/githubService.ts:9-37, 222-247`  
**Severity:** INFO

The Redis fallback mechanism correctly degrades to in-memory storage when Redis is unavailable, with proper error handling and logging.

**Evidence:** Lines 9-37 implement `getRedis()` with fallback; lines 222-247 implement `getGitHubSession()` with in-memory fallback.

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 1 |
| HIGH     | 1 |
| MEDIUM   | 4 |
| LOW      | 2 |
| INFO     | 5 |

**Key Issues:**
1. **CRITICAL:** `settleAcceptedJobCredits()` lacks idempotency — can double-pay
2. **HIGH:** Referral Map is not persisted — data loss + double-pay risk on restart
3. **MEDIUM:** Timezone ambiguity in referral expiry, no rate limiting, incomplete poster rebate status check

**Recommendation Priority:**
1. Add idempotency check to `settleAcceptedJobCredits()` immediately
2. Persist referral records to database
3. Fix timezone handling in referral expiry
4. Add referral rate limiting
5. Expand poster rebate status check