# AUDIT PASS 13A: ReviewerQueue.sol + ReviewerCredential.sol

**Date:** 2026-05-30  
**Auditor:** Devin (SWE-1.6 Fast)  
**Scope:** Full security audit of reviewer assignment and credentialing contracts

---

## ReviewerQueue.sol

### CRITICAL

**C1: Unbounded Loop in Reviewer Selection (M8 - NOT FIXED)**
- **Location:** Lines 284-297 in `_selectReviewerForTask`
- **Issue:** The loop iterates through all `eligibleReviewers` without any cap. With external calls to `identityGate.isVerified()` and `reviewerStakeManager.reviewerBond()`, a pool of 100+ reviewers could exceed gas limits.
- **Impact:** DOS via OOG when reviewer pool grows large. An attacker could register many Sybil reviewers to block legitimate task assignment.
- **Recommendation:** Add a configurable max scan cap (e.g., 50 reviewers) with fallback to random subset if exceeded.

**C2: O(n) Queue Removal (M9 - NOT FIXED)**
- **Location:** Lines 379-389 in `_removeFromQueue`
- **Issue:** Linear scan through `reviewerQueue[reviewer]` array to find and remove taskId. No index mapping for O(1) lookup.
- **Impact:** Gas cost scales with queue length. With `maxActiveReviewsPerReviewer = 5`, this is currently acceptable but becomes a problem if increased.
- **Recommendation:** Add `mapping(address => mapping(bytes32 => uint256)) private _queueIndex` for O(1) removal.

**C3: No DOS Protection on External Call (M10 - NOT FIXED)**
- **Location:** Line 294 in `_selectReviewerForTask`
- **Issue:** `reviewerStakeManager.reviewerBond(reviewer)` is called without try/catch. If stakeManager reverts or is malicious, the entire assignment fails.
- **Impact:** DOS if stakeManager is compromised or behaves adversarially.
- **Recommendation:** Wrap in try/catch, skip reviewers on failure, or require stakeManager to be immutable and trusted.

### HIGH

**H1: Missing Self-Assignment Prevention**
- **Location:** Lines 272-309 in `_selectReviewerForTask`
- **Issue:** No check to prevent a reviewer from being assigned to a task they submitted (worker == reviewer).
- **Impact:** Conflict of interest - reviewers could review their own work for bribery or collusion.
- **Recommendation:** Add `require(reviewer != taskWorker, "Cannot review own task")` check. Requires passing taskWorker to the function.

**H2: No Sybil Resistance in Queue Contract**
- **Location:** Lines 127-133 in `assignReview`
- **Issue:** The contract trusts `eligibleReviewers` passed as parameter without any Sybil validation. Relies entirely on external filtering.
- **Impact:** If upstream filtering is compromised, Sybil reviewers could flood the queue and game stake-weighted selection.
- **Recommendation:** Add internal Sybil resistance (e.g., minimum stake threshold, unique human verification via IdentityGate).

### MEDIUM

**M1: Deterministic Selection with Block Timestamp**
- **Location:** Line 355 in `_selectWeightedReviewer`
- **Issue:** Uses `block.timestamp` in seed calculation: `uint256 seed = uint256(keccak256(abi.encodePacked(taskId, block.timestamp)))`
- **Impact:** Miners can manipulate timestamp within ~15 seconds, slightly biasing selection. Not critical since taskId provides most entropy.
- **Recommendation:** Use `block.prevrandao` or commit-reveal scheme for true randomness.

**M2: No Reviewer Capacity Check on Assignment**
- **Location:** Lines 315-337 in `_assignReview`
- **Issue:** The capacity check is in `_selectReviewerForTask`, but if a reviewer is selected and then their capacity changes before assignment, they could exceed `maxActiveReviewsPerReviewer`.
- **Impact:** Edge case where reviewer could be assigned more tasks than allowed in race conditions.
- **Recommendation:** Re-check capacity in `_assignReview` after selection.

### LOW

**L1: Missing Event for Queue Removal**
- **Location:** Lines 379-389 in `_removeFromQueue`
- **Issue:** No event emitted when a task is removed from a reviewer's queue.
- **Impact:** Reduced observability for off-chain monitoring.
- **Recommendation:** Add `event RemovedFromQueue(address indexed reviewer, bytes32 taskId)`.

---

## ReviewerCredential.sol

### HIGH

**H3: No Grace Period for Tier Downgrades**
- **Location:** Lines 189-203 in `evaluateAndUpdateTier`
- **Issue:** Tier changes are immediate. A reviewer could drop from Expert to Bonded instantly due to a single slash, losing all privileges.
- **Impact:** Harsh punishment may discourage reviewer participation. No recovery period for temporary performance dips.
- **Recommendation:** Add grace period (e.g., 7 days) where tier is "probationary" before full downgrade.

**H4: Slash Rate Gaming Vulnerability**
- **Location:** Lines 226-245 in `_computeTier`
- **Issue:** Slash rate is calculated as `(totalSlashCount * 10000) / reviewsSubmitted`. A reviewer could submit many low-quality reviews quickly to dilute their slash rate.
- **Impact:** Reviewers could game the system by spamming reviews to maintain tier despite poor performance.
- **Recommendation:** Use time-windowed slash rate (e.g., last 90 days) or minimum review quality threshold.

**H5: Operator Can Arbitrarily Set Slash Count**
- **Location:** Line 194 in `evaluateAndUpdateTier`
- **Issue:** Operator passes `newSlashCount` directly without validation. A malicious operator could set incorrect slash counts to manipulate tiers.
- **Impact:** Centralized manipulation of reviewer credentials. Bribery risk.
- **Recommendation:** Compute slash count from trusted source (e.g., ReviewerStakeManager) or add multi-sig requirement for tier updates.

### MEDIUM

**M3: No Tier Change Cooldown**
- **Location:** Lines 189-203 in `evaluateAndUpdateTier`
- **Issue:** Tier can be updated on every call with no cooldown. Could be called repeatedly in a single block.
- **Impact:** Gas inefficiency and potential for rapid tier manipulation.
- **Recommendation:** Add minimum time between tier updates (e.g., 1 day).

**M4: Missing Tier Downgrade Event Details**
- **Location:** Line 219 in `_updateTier`
- **Issue:** `TierUpdated` event doesn't include the reason (slash rate, review count) for the change.
- **Impact:** Poor transparency for off-chain monitoring and appeal processes.
- **Recommendation:** Expand event to include `reviewsSubmitted` and `slashRateBps`.

### LOW

**L2: No Metadata URI for Credentials**
- **Location:** Lines 161-163 in `uri`
- **Issue:** Returns empty string. No on-chain metadata for tier credentials.
- **Impact:** Poor UX in wallets that display NFT metadata.
- **Recommendation:** Add base64-encoded metadata describing each tier.

---

## Summary

### Critical Issues: 3
- C1: Unbounded loop in reviewer selection (M8)
- C2: O(n) queue removal (M9)
- C3: No DOS protection on external call (M10)

### High Issues: 5
- H1: Missing self-assignment prevention
- H2: No Sybil resistance in queue contract
- H3: No grace period for tier downgrades
- H4: Slash rate gaming vulnerability
- H5: Operator can arbitrarily set slash count

### Medium Issues: 4
- M1: Deterministic selection with block timestamp
- M2: No reviewer capacity check on assignment
- M3: No tier change cooldown
- M4: Missing tier downgrade event details

### Low Issues: 2
- L1: Missing event for queue removal
- L2: No metadata URI for credentials

### Known Findings Status
- **M8:** NOT FIXED - Still unbounded loop
- **M9:** NOT FIXED - Still O(n) removal
- **M10:** NOT FIXED - Still no try/catch on stakeManager call

### Overall Assessment
The contracts have functional core logic but lack critical DOS protections and gaming resistance. The reviewer selection algorithm is vulnerable to gas exhaustion and Sybil attacks. The credentialing system has centralized manipulation risks and no protection against slash rate gaming. Immediate attention needed on C1-C3 before mainnet deployment.