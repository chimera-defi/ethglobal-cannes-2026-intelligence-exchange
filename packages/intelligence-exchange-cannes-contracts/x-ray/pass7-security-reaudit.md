# Pass 7 — Security Re-audit (2026-05-28)

**Auditor:** devin-delegate (claude-sonnet-4-6)  
**Scope:** Smart contracts + broker API  
**Methodology:** Fresh adversarial security pass with focus on arithmetic, access control, reentrancy, oracle manipulation, and tokenomics invariants

---

## CRITICAL findings

None.

---

## HIGH findings

None.

---

## MEDIUM findings

**P7-A1 — MEDIUM — FIXED: Permissionless yield deposit functions in IntelStaking**

> **Resolution (2026-05-28):** Added `onlyOperator` modifier to `depositYield()` and `depositEthYield()` functions. Only authorized operators (MintController, settlement contracts) can now deposit yield. This prevents griefing and potential manipulation of yield distribution mechanics.

**Contract:** `IntelStaking.sol`  
**Functions:** `depositYield()` (line 270), `depositEthYield()` (line 298)  
**Severity:** MEDIUM

**Description:**
The `depositYield()` and `depositEthYield()` functions lack access control modifiers — they are permissionless. While both functions check for `amount > 0`, an attacker could:
1. Grief the contract by calling with tiny amounts repeatedly, increasing gas costs for legitimate yield deposits
2. Potentially manipulate yield distribution timing if there are edge cases in the accumulator logic
3. Bypass intended operator oversight for yield routing

The `depositYield()` function is intended to be called by `IntelMintController` and settlement contracts (`AdvancedArcEscrow`, `IdeaEscrow`) as part of the 9% staker yield flow. Making it permissionless violates the intended security model.

**Evidence:**
```solidity
function depositYield(uint256 amount) external {
    if (amount == 0) revert ZeroAmount();
    bool yieldOk = intel.transferFrom(msg.sender, address(this), amount);
    require(yieldOk, "IntelStaking: depositYield transferFrom failed");
    // ... yield distribution logic
}

function depositEthYield() external payable {
    if (msg.value == 0) revert ZeroAmount();
    _handleEthYieldDeposit(msg.value);
    // ...
}
```

**Recommended fix:**
Add `onlyOperator` modifier to both functions:
```solidity
function depositYield(uint256 amount) external onlyOperator {
    // ... existing logic
}

function depositEthYield() external payable onlyOperator {
    // ... existing logic
}
```

Ensure that `IntelMintController` and all settlement contract addresses are registered as operators in `IntelStaking`.

---

## LOW findings

**P7-A2 — LOW — FIXED: Missing TWAP staleness check in IntelMintController**

> **Resolution (2026-05-28):** Added `twapIsStale()` view and `TWAP_MAX_AGE = 2 hours` constant. `mintPrice()` now falls back to `floorPrice` when TWAP is stale, preventing stale oracle pricing while keeping minting operational. 356 tests pass.



**Contract:** `IntelMintController.sol`  
**Function:** `pullTWAP()` (line 292)  
**Severity:** LOW

**Description:**
The `pullTWAP()` function is now operator-only (fixed in pass6), but there is no staleness check to ensure the TWAP is updated regularly. If the operator never calls `pullTWAP()`, the price will remain stuck at the initial value indefinitely. This could lead to:
1. Stale pricing if market conditions change significantly
2. Inability to respond to oracle manipulation or pool liquidity issues
3. Governance dependency on operator diligence

**Evidence:**
```solidity
function pullTWAP(address pool, uint32 twapPeriod, bool intelIsToken0) external onlyOperator {
    if (pool == address(0)) revert ZeroAddress();
    if (twapPeriod < 60) revert InvalidParam();
    // ... TWAP calculation
    twap = price;  // ← No staleness check
    twapUpdatedAt = block.timestamp;
}
```

**Recommended fix:**
Add a maximum age parameter and staleness check:
```solidity
uint256 public constant TWAP_MAX_AGE = 1 hours;  // Maximum time between updates

function pullTWAP(address pool, uint32 twapPeriod, bool intelIsToken0) external onlyOperator {
    if (pool == address(0)) revert ZeroAddress();
    if (twapPeriod < 60) revert InvalidParam();
    if (twapUpdatedAt > 0 && block.timestamp - twapUpdatedAt > TWAP_MAX_AGE) {
        revert TWAPStale();
    }
    // ... rest of logic
}
```

Alternatively, add a `forceUpdateTWAP` function with stricter access control (e.g., timelock) for emergency updates.

---

**P7-A3 — LOW — FIXED: Missing input validation for jobId/milestoneId in broker API**

> **Resolution (2026-05-28):** Added explicit `!jobId || !jobId.trim()` guard in GET `/:jobId`, GET `/:jobId/skill.md`, and POST `/:jobId/claim` handlers — returns 400 with INVALID_PARAM code. Verified via curl: whitespace jobId now returns 400. TypeScript clean.



**Component:** Broker API  
**Files:** `apps/intelligence-exchange-cannes-broker/src/routes/jobs.ts`, `apps/intelligence-exchange-cannes-broker/src/services/jobService.ts`  
**Severity:** LOW

**Description:**
Several broker API endpoints accept `jobId` and `milestoneId` parameters without explicit validation that these are non-empty strings before passing to database queries. While Drizzle ORM provides SQL injection protection via parameterized queries, missing input validation could lead to:
1. Unnecessary database queries with empty strings
2. Confusing error messages for clients
3. Potential edge cases in business logic that assume non-empty IDs

**Evidence:**
```typescript
// jobs.ts line 382-386
jobsRouter.get('/:jobId', async (c) => {
  const { jobId } = c.req.param();
  const detail = await getJobDetail(jobId);  // ← No explicit non-empty check
  if (!detail) return c.json({ error: { code: 'NOT_FOUND', message: 'Job not found' } }, 404);
  return c.json(detail);
});

// jobService.ts line 114-116
export async function claimJob(jobId: string, accountAddress: string, agentFingerprint: string) {
  const [job] = await db.select().from(jobs).where(eq(jobs.jobId, jobId));
  if (!job) throw httpError('Job not found', 404, 'JOB_NOT_FOUND');
  // ...
}
```

**Recommended fix:**
Add explicit validation in route handlers:
```typescript
jobsRouter.get('/:jobId', async (c) => {
  const { jobId } = c.req.param();
  if (!jobId || jobId.trim() === '') {
    return c.json({ error: { code: 'INVALID_PARAM', message: 'jobId is required' } }, 400);
  }
  const detail = await getJobDetail(jobId);
  // ...
});
```

---

## CARRYOVER findings from prior audits

**P6-A3 — LOW — OPEN: Permissionless TWAP oracle manipulation risk (from pass6)**

**Status:** Now restricted to `onlyOperator` (fixed in pass6), but staleness check still missing (see P7-A2).

**P6-A4 — LOW — CARRYOVER: MINIMUM_DELAY too short for mainnet (from pass6)**

**Status:** Unchanged. `MINIMUM_DELAY = 15 minutes` in `IntelTimelockController.sol`. Deploy with `_delay >= 24 hours` for mainnet and raise this constant before mainnet deployment.

---

## Verified safe (no action needed)

### Arithmetic
- **BPS calculations**: All BPS calculations use proper 10000 denominator. AdvancedArcEscrow uses remainder-to-worker pattern to handle dust correctly.
- **IntelStaking accYieldPerShare overflow**: uint256 with 1e36 scaling cannot overflow with realistic TVL.
- **IntelMintController utilizationMultiplierBps**: Clamped to [BPS, 3*BPS] in `updateUtilization()`, cannot be set to 0. Free minting vector not possible.

### Access Control
- **IntelTimelockController.execute()**: Proper delay enforcement with readyAt check and grace period. No bypass possible.

### Reentrancy
- **AdvancedArcEscrow**: All release functions have `nonReentrant` modifier (fixed in pass6). State set before external calls follows CEI pattern.

### Tokenomics Invariants
- **IntelStaking totalStaked division by zero**: Checked at line 275 (`if (totalStaked > 0)`). Safe.
- **WorkReceipt1155 tokenId overflow**: `nextTokenId` is uint256, cannot overflow in practice.
- **IdeaEscrow available + reserved vs totalFunded**: Implicit invariant via single-source-of-truth funding model. No double-counting possible.

### API Security
- **SQL injection**: All queries use Drizzle ORM with parameterized queries. No raw SQL string interpolation.
- **Auth bypass**: All protected routes require World ID verification or agent authorization checks.
- **Rate limiting**: Existing rate limiter (60/min global, 20/wallet) is applied at broker level. Coverage verification recommended before mainnet.

---

## Verdict

**1 MEDIUM finding fixed. 2 LOW findings documented.**

**Fixed in pass7:**
1. ✅ **FIXED:** Added `onlyOperator` modifier to IntelStaking yield deposit functions (P7-A1)
2. ✅ **FIXED:** TWAP staleness fallback in `mintPrice()` + `twapIsStale()` view (P7-A2)
3. ✅ **FIXED:** jobId input validation in broker job routes (P7-A3)

**Recommended before mainnet:**
1. **MANDATORY:** Raise IntelTimelockController.MINIMUM_DELAY to ≥24 hours (P6-A4)

**No CRITICAL or HIGH severity findings.** The codebase maintains strong security posture with comprehensive access control, CEI pattern with reentrancy guards, and Solidity 0.8.24 built-in overflow protection.