# Technical Debt Register

**Last updated:** 2026-05-08

## Active Debt

### 1. Contract Migration Path

**What:** `MilestoneEscrow.sol` is currently tied to the Cannes milestone model (brief/tasks/scaffold/review).  
**Impact:** Compute-pool and inference-market need different escrow parameters (instant settlement, batching, no vesting).  
**Mitigation:** `MilestoneEscrow` is parameterized — `vestingDuration`, `disputeWindow`, and batch size are constructor/setter configurable. New products can deploy instances with different parameters. Long-term: extract a generic `EscrowBase` interface.

### 2. Broker Monolith vs. Microservice Split

**What:** All broker logic (ideas, jobs, claims, scoring, tokenomics, chain sync) lives in one Hono app.  
**Impact:** Compute-pool and inference-market would bloat the same monolith. Scaling, deployment, and failure isolation suffer.  
**Mitigation:** The broker is already package-modular (`broker-core/` middleware can be reused). Next step: split into `broker-ideas`, `broker-jobs`, `broker-tokenomics` services with shared middleware.

### 3. 0G SDK Version Pinning

**What:** `zeroG.ts` uses dynamic `import('@0gfoundation/0g-ts-sdk')` with no version lock.  
**Impact:** Breaking changes in 0G SDK could break dossier uploads silently.  
**Mitigation:** Pin to specific version in `package.json`. Add runtime version check on upload.

### 4. Arc Chain Not in Viem Chain List

**What:** `arcEscrowService.ts` passes `chain: null` to `sendTransaction` because Arc is not in viem's built-in chains.  
**Impact:** Transaction serialization may drift from Arc's actual chain parameters. Error messages are vague.  
**Mitigation:** Define Arc chain object locally using `defineChain` (as already done in `main.tsx` for frontend). Use it in the broker too.

### 5. Redis Password in Connection URL

**What:** The Redis URL now includes `REDIS_PASSWORD` inline: `redis://:password@host:port`.  
**Impact:** Password appears in logs, env dumps, and process listings.  
**Mitigation:** Use `ioredis` or `bullmq` connection object with separate `password` field instead of encoding it in the URL. Already partially fixed in `milestoneQueue.ts` but not everywhere.

### 6. Worker CLI Not Tested in CI

**What:** `apps/intelligence-exchange-cannes-worker/` has no automated tests in the CI pipeline.  
**Impact:** CLI regressions (command-line parsing, auth flow) only discovered manually.  
**Mitigation:** Add a lightweight CLI test that exercises `list`, `claim`, `submit` against the running broker in the acceptance test suite.

### 7. Frontend Bundle Size

**What:** Broker build is 5.88 MB. Web bundle likely similar or larger due to RainbowKit + wagmi + viem.  
**Impact:** Slow first load on mobile/limited bandwidth.  
**Mitigation:** Enable tree-shaking verification. Split vendor chunks. Lazy-load heavy pages.

### 8. Tokenomics Engine Internal Naming

**What:** `packages/intelligence-exchange-cannes-tokenomics/src/engine.ts` still uses `Ixp` in function names (`getCurvePriceUsdPerIxp`, `quoteMintIxp`).  
**Impact:** Confusing for new developers. Inconsistent with `INTEL` user-facing branding.  
**Mitigation:** Rename to `Intel` variants. Update tests and any consumers. Low priority — internal API only.

### 9. Testnet Rehearsal Not Automated

**What:** No CI or script automatically deploys to Arc testnet and runs end-to-end.  
**Impact:** Demo readiness is manually verified. Easy to drift.  
**Mitigation:** Add `scripts/testnet-rehearsal.sh` (already planned). Run it nightly against testnet with funded throwaway accounts.

### 10. Acceptance Test Runtime Dependency on Docker

**What:** `make validate` requires Docker for acceptance tests. Docker is unavailable in some CI environments and local dev setups.  
**Impact:** Contributors can't run full validation without Docker.  
**Mitigation:** Add `make validate-no-docker` that uses SQLite/memory backends for tests. Keep Docker path as `make validate` (production parity).

## Resolved Debt (from PR #44)

- ✅ ~~Stale IXP naming in runtime~~ — Migrated to INTEL rail
- ✅ ~~Missing CI gates~~ — `make validate` + GitHub Actions
- ✅ ~~No contract deployment scripts~~ — `protocol-core/` has Forge scripts
- ✅ ~~No tokenomics tests~~ — 8/8 actor flows covered

## Debt Trend

| Date | Open Items | High Severity | Medium Severity | Low Severity |
|---|---|---|---|---|
| 2026-05-08 | 10 | 2 (#1 contract migration, #2 broker split) | 5 | 3 |
