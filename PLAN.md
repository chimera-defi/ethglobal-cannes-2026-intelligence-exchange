# Intelligence Exchange — Immediate + Post-Cannes Work Plan

**Date:** 2026-05-08  
**Author:** Claude Sonnet 4.6  
**Branch target:** `feat/post-cannes-suite-2026-05-08`

## Context

- `main` is clean, last merged: PR #44 (security audit + protocol suite refactoring, Kimi)
- 2 open PRs: #40 (redis infra hardening, CONFLICTING) and #41 (workflow guardrails, UNKNOWN)
- `make validate` fails: corepack uses pnpm 11.0.8 but `packageManager` field pins 10.33.0
- Acceptance tests pass in isolation but no live testnet rehearsal evidence exists
- MVP spec requires: escrow panel, dossier panel, visible agent spend, real onchain Arc release
- Post-Cannes specs exist for `compute-pool/` and `inference-market/` but are skeletal

## Goals

1. Fix immediate blockers (pnpm version, PR conflicts)
2. Make `make validate` green
3. Resolve or supersede open PRs
4. Close all MVP spec gaps (UI panels, testnet rehearsal, demo script)
5. Lay groundwork for Post-Cannes product expansion (compute-pool, inference-market)
6. Document technical debt and next-phase architecture

## Phase 0: Infra Fix (Critical Path, Local)

### 0.1 Fix pnpm version mismatch
- `packageManager` in root `package.json` says `pnpm@10.33.0`
- Corepack installed pnpm 11.0.8
- Fix: update `packageManager` field to `pnpm@11.0.8` OR add `devEngines` with `"onFail": "ignore"`
- Also verify `.nvmrc` / Node version alignment

### 0.2 Update broker `.env.example` and `docker-compose.yml`
- PR #40 changes: bind Redis/Postgres to `127.0.0.1`, add `--requirepass`, credentialed defaults
- PR #41 changes: git hooks, PR template, auto-teardown wrapper
- Both have conflicts with main after PR #44

**Decision:** Rather than rebase both separately, cherry-pick the essential changes from each into a single new branch that builds on `main`. Close both PRs as superseded.

### 0.3 Cherry-pick essential PR #40 changes
- `docker-compose.yml`: `127.0.0.1:` port bindings, Redis `--requirepass`
- `.env.example`: `POSTGRES_PASSWORD`, `REDIS_PASSWORD`, authenticated URLs
- Broker Redis URL parser: preserve username/password/db
- `Makefile`: `infra-down` with `--remove-orphans`

### 0.4 Cherry-pick essential PR #41 changes
- `scripts/tooling/run-with-test-infra.sh`: auto-teardown wrapper
- GitHub PR template with attribution sections
- `.github/workflows/commit-message-check.yml` (attribution CI gate)
- `Makefile`: `make install` installs hooks

### 0.5 Add CI gate for pnpm version
- Add `package.json` version check to `Makefile` or CI

## Phase 1: Validation + Testnet Rehearsal (Critical Path, Local + Onchain)

### 1.1 Run `make validate` end-to-end
- After pnpm fix, run full validation
- Capture any test failures or type errors
- Fix any regressions from PR #44

### 1.2 Fix broker `.env.example` stale naming
- Currently says `TOKEN_SYMBOL=IXP` — must be `INTEL`
- Update all tokenomics env vars to match INTEL naming

### 1.3 Deploy `MilestoneEscrow` to Arc testnet
- `packages/protocol-core/` has the contracts
- Add `DeployMilestoneEscrow.s.sol` if missing
- Run deployment with funded test account
- Record address in `.env.example` and `docs/`

### 1.4 Testnet rehearsal script
- Create `scripts/testnet-rehearsal.sh`
- Seeded poster: create idea → fund → plan
- Seeded worker: verify → register → claim → submit
- Seeded reviewer: verify → accept
- Onchain: verify `milestone_released` event visible on Arc testnet explorer

### 1.5 Verify 0G dossier upload on testnet
- Use real testnet RPC + funded account
- Confirm `dossierUri` is retrievable (not just stored locally)

## Phase 2: UI Gap Closure (Critical Path, Local)

### 2.1 Add `EscrowStatusPanel` route
- New page: `/escrow/:ideaId`
- Shows: funding status, milestone reserves, release states, onchain tx links
- Uses `GET /v1/cannes/tokenomics/ideas/:ideaId` + chain sync data
- Reuse components from `IdeaDetail.tsx`

### 2.2 Add `DossierPanel` route
- New page: `/dossier/:ideaId`
- Shows: BuildBrief, submitted artifacts, scoring summary, release evidence, 0G URI
- Uses existing dossier data from `GET /v1/cannes/ideas/:ideaId`

### 2.3 Surface agent spend events in ReviewPanel
- `ReviewPanel.tsx` currently shows `scoreBreakdown`
- Add section: "Agent Spend Events" with table of `agentSpendEvents` for the job
- Pull from `GET /v1/cannes/jobs/:jobId` (broker already returns spendEvents)

### 2.4 Add judge-visible demo badges
- Landing page: show network status (Arc testnet, World staging, 0G testnet)
- Demo mode indicator when `NODE_ENV=demo` or `WORLD_ID_STRICT=0`

### 2.5 Frontend typecheck and build
- Run `pnpm --filter intelligence-exchange-cannes-web typecheck` and `build`
- Fix any TS errors from new routes

## Phase 3: Post-Cannes Architecture Refactoring (Parallel, Local)

### 3.1 Extract protocol-core to standalone reusable package
- `packages/protocol-core/` already exists
- Ensure it has no hardcoded Cannes-specific constants
- Add `README.md` with integration guide
- Publish to internal registry or document local link

### 3.2 Design `compute-pool` architecture
- Based on `products/compute-pool/spec/README.md`
- Create `products/compute-pool/ARCHITECTURE.md`
- Define: compute unit (GPU-seconds), TEE attestation interface, spot pricing curve
- Reuse `protocol-core` for settlement

### 3.3 Design `inference-market` architecture
- Based on `products/inference-market/spec/README.md`
- Create `products/inference-market/ARCHITECTURE.md`
- Define: inference batching, routing oracle, LLM-as-judge scoring
- Reuse `protocol-core` for settlement

### 3.4 Shared protocol SDK expansion
- `packages/protocol-sdk/src/` currently has governance/identity/settlement/tokens
- Add `compute.ts` and `inference.ts` type definitions
- Keep backward-compatible with Cannes `MilestoneEscrow` interface

## Phase 4: Documentation + Debt Register (Parallel, Local)

### 4.1 Update `README.md`
- Add Phase 3 products to system overview
- Update tokenomics to match finalized INTEL naming
- Remove any remaining stale IXP references

### 4.2 Create `TECH_DEBT.md`
- List: contract migration path (Cannes escrow → generalized settlement)
- List: broker monolith vs. microservice split for compute-pool
- List: 0G SDK version pinning (currently dynamic import)
- List: Arc chain not in viem chain list (workaround in `arcEscrowService.ts`)

### 4.3 Create `ROADMAP.md`
- Cannes 2026 (current): milestone marketplace, human review, INTEL settlement
- Phase 2 (post-Cannes): compute-pool, inference-market
- Phase 3: open worker marketplace liquidity, autonomous payouts

## Execution Order

| Phase | Task | Delegatable? | Agent |
|---|---|---|---|
| 0.1 | Fix pnpm version | No (tight coupling with CI) | Local |
| 0.2–0.5 | Cherry-pick PR 40/41 essentials | Partial | Worker |
| 1.1 | Run `make validate` | No | Local |
| 1.2 | Fix `.env.example` naming | Yes | Worker |
| 1.3 | Deploy MilestoneEscrow Arc testnet | No (needs wallet) | Local |
| 1.4 | Testnet rehearsal script | Yes | Worker |
| 1.5 | 0G dossier testnet verify | No (needs wallet) | Local |
| 2.1 | EscrowStatusPanel page | Yes | Worker |
| 2.2 | DossierPanel page | Yes | Worker |
| 2.3 | Agent spend in ReviewPanel | Yes | Worker |
| 2.4 | Demo badges | Yes | Worker |
| 2.5 | Frontend typecheck | No | Local |
| 3.1–3.4 | Post-Cannes architecture docs | Yes | Planner |
| 4.1–4.3 | Docs and debt register | Yes | Planner |

## Definition of Done

- [ ] `make validate` passes on CI
- [ ] PR #40 and #41 closed (superseded or landed)
- [ ] Arc testnet contract deployed and address documented
- [ ] Testnet rehearsal script runs end-to-end with real onchain events
- [ ] 0G dossier upload produces retrievable testnet URI
- [ ] `EscrowStatusPanel` and `DossierPanel` exist as routes
- [ ] Agent spend events visible in `ReviewPanel`
- [ ] `compute-pool/ARCHITECTURE.md` and `inference-market/ARCHITECTURE.md` exist
- [ ] `TECH_DEBT.md` and `ROADMAP.md` exist
- [ ] All commits on single feature branch with proper attribution
