# Audit Pass 12B — Patched Contracts

**Date:** 2026-05-30  
**Scope:** IntelMintController.sol, DisputeResolution.sol, EpochRewardDistributor.sol  
**Focus:** Routing address timelock, dispute dedup + observability, workers array cap

---

## IntelMintController.sol — Routing Address Timelock

### ✅ Cancel Function Exists
**Finding:** `cancelRoutingAddresses()` at line 540-545 allows owner to cancel pending changes.  
**Evidence:** Function zeros out `pendingPolAddress`, `pendingTreasuryAddress`, and `routingChangeReadyAt`, emits `RoutingAddressCancelled` event.  
**Severity:** ✅ PASS

### ⚠️ Propose Can Overwrite Pending Changes
**Finding:** `proposeRoutingAddresses()` (line 517-523) can be called multiple times before apply, overwriting previous pending values without warning.  
**Evidence:** No check for existing pending changes; second propose simply overwrites `pendingPolAddress`, `pendingTreasuryAddress`, and `routingChangeReadyAt`.  
**Severity:** LOW  
**Recommendation:** Consider adding a check to prevent overwrite or emit a warning event when overwriting pending changes.

### ℹ️ Mid-EPOCH Routing Changes Affect New Mints Only
**Finding:** Routing addresses are read during mint execution (`_doMint` lines 713-715). Changes mid-epoch affect only new mints, not in-flight transactions.  
**Evidence:** `polAddress` and `treasuryAddress` are read directly during mint routing; no snapshotting mechanism.  
**Severity:** INFO  
**Recommendation:** Document this behavior clearly for operators.

### ✅ ROUTING_TIMELOCK Reasonable
**Finding:** 48-hour timelock (line 168) is reasonable for routing address changes.  
**Evidence:** Events emitted: `RoutingAddressPending` (line 522) and `RoutingAddressesUpdated` (line 535).  
**Severity:** ✅ PASS

### ✅ Pending State Properly Cleared
**Finding:** `applyRoutingAddresses()` (lines 527-536) properly zeros pending state.  
**Evidence:** Lines 532-534 set `pendingPolAddress`, `pendingTreasuryAddress` to `address(0)` and `routingChangeReadyAt` to 0.  
**Severity:** ✅ PASS

---

## DisputeResolution.sol — Dedup + Observability

### ✅ taskDisputeId Mapping Correctly Implemented
**Finding:** Uses `disputeId + 1` to distinguish 'no dispute' (0) from dispute 0 (stored as 1).  
**Evidence:** Line 190 checks `if (taskDisputeId[taskId] != 0)`, line 210 sets `taskDisputeId[taskId] = disputeId + 1`.  
**Severity:** ✅ PASS

### ⚠️ No Re-Dispute After Resolution/Expiration
**Finding:** Once a dispute is opened on a `taskId`, the mapping is never cleared even after resolution or expiration. New disputes on the same `taskId` are permanently blocked.  
**Evidence:** No code clears `taskDisputeId[taskId]` in `resolveDispute()` (lines 277-356) or `expireDispute()` (lines 360-369).  
**Severity:** MEDIUM  
**Recommendation:** Clear `taskDisputeId[taskId]` when dispute is resolved or expired if re-disputes should be allowed. Otherwise, document this as intended behavior.

### ⚠️ SlashFailed Event Gas Concern
**Finding:** `SlashFailed` event emits `bytes reason` (line 72). If reason is very long, this could increase gas costs significantly.  
**Evidence:** All three catch blocks emit `SlashFailed` with full revert reason bytes (lines 307-308, 311-312, 327-328, 337-338).  
**Severity:** LOW  
**Recommendation:** Consider truncating reason bytes or using a hash to reduce gas costs.

### ✅ TaskAlreadyDisputed Correctly Defined
**Finding:** `TaskAlreadyDisputed(bytes32)` error is correctly defined and imported.  
**Evidence:** Defined at line 38, used at line 190 in `openDispute()`.  
**Severity:** ✅ PASS

### ✅ All Catch Blocks Emit SlashFailed
**Finding:** All three catch blocks in `resolveDispute()` now emit `SlashFailed` events.  
**Evidence:**  
- Line 307-308: `reviewerStakeManager.slash()` catch block  
- Line 311-312: `reviewerStakeManager.reviewerBond()` catch block  
- Line 327-328: `workerStakeManager.slash()` catch block  
- Line 337-338: `reviewerStakeManager.slash()` (worker fault path) catch block  

No silent catch blocks remain.  
**Severity:** ✅ PASS

---

## EpochRewardDistributor.sol — Workers Array Cap

### ⚠️ MAX_WORKERS_PER_EPOCH Not Configurable
**Finding:** `MAX_WORKERS_PER_EPOCH = 1_000` is a constant (line 39), not configurable by owner. May be too low for large-scale deployments.  
**Evidence:** Constant definition; no setter function.  
**Severity:** MEDIUM  
**Recommendation:** Make this configurable via owner function or increase the constant if anticipating >1000 workers per epoch.

### ✅ Workers Length Check in submitEpochScores
**Finding:** Check `if (workers.length > MAX_WORKERS_PER_EPOCH) revert InvalidParam()` is at line 145, BEFORE the loop.  
**Evidence:** Guard clause at top of function prevents processing oversized arrays.  
**Severity:** ✅ PASS

### ✅ topCount Bounded by Cap
**Finding:** `topCount` is derived from `workers.length * topPercentileBps / BPS`. With `MAX_WORKERS=1000` and `topPercentileBps=1000` (10%), max `topCount = 100`.  
**Evidence:** Line 149 calculates `topCount`, line 177-178 bounds it to `workerCount`. Since `workerCount ≤ MAX_WORKERS_PER_EPOCH`, topCount is implicitly bounded.  
**Severity:** ✅ PASS

---

## Summary

### Critical Issues
None

### High Issues
None

### Medium Issues
1. **DisputeResolution.sol**: No re-dispute after resolution/expiration (taskDisputeId never cleared)
2. **EpochRewardDistributor.sol**: MAX_WORKERS_PER_EPOCH not configurable (hard-coded at 1000)

### Low Issues
1. **IntelMintController.sol**: proposeRoutingAddresses can overwrite pending changes without warning
2. **DisputeResolution.sol**: SlashFailed event gas concern with long reason bytes

### Remaining Issues
None — all patched issues from pass 11 have been addressed correctly.