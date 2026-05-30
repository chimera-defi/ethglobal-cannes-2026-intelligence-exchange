# Agent Rules

> **Master rules:** `.cursorrules` | **Token efficiency:** `skills/token-reduce/SKILL.md`

## First Move For Discovery

- If file location is unknown, start with `./skills/token-reduce/scripts/token-reduce-paths.sh topic words`.
- If the path is already known, prefer scoped `rg -g` before reading.
- Do not start with `find .`, `ls -R`, `grep -R`, `tree`, or `rg --files .`.

## Token Reduction Defaults

- Keep responses concise.
- Prefer targeted reads over full-file reads.
- Escalate to sub-agents or parallel exploration when the candidate set exceeds 5 files.
- Treat broad scans as a violation, not a convenience.

## PR Discipline

- One task = one PR.
- Never push directly to `main`.
- When a task is complete and the user has not opted out, create the branch, commit, push, and open a PR instead of leaving work on `main`.
- PRs and commits require explicit agent attribution plus human co-author attribution.
- Keep all related commits on the same branch for the request.
- When a scoped coding task is complete and the user has not opted out, create the task branch, stage only the in-scope files, push, and open a draft PR automatically.

## Review Discipline

- Use multi-pass review before declaring work done:
  - pass 1: correctness and contract fit
  - pass 2: consistency across docs / specs / tests
  - pass 3: demo honesty, edge cases, and “AI slop” removal

## No AI Slop

- No decorative sponsor integrations.
- No vague “future agent magic” language.
- No inflated marketplace or autonomy claims.
- Keep every claim tied to an artifact, test, contract, or visible demo behavior.

<!-- SHARED_ATTRIBUTION_RULES_START -->
## Shared Attribution & Meta Learnings

- Commit author should be the active agent model identity.
- Commit trailer must include: `Co-authored-by: Chimera <chimera_defi@protonmail.com>`.
- PR description must include:
  - `**Agent:** <actual model name>`
  - `**Co-authored-by:** Chimera <chimera_defi@protonmail.com>`
- Never use placeholder model names; record the actual model used.
- Never push directly to `main`/`master`; use a feature branch and PR.
- Keep one task per PR for clear review and rollback.
- Verify before claiming complete: run relevant tests/lint/checks or explicitly note what was not run.
<!-- SHARED_ATTRIBUTION_RULES_END -->

<!-- kimi-delegate:begin -->
## Kimi Delegate Routing — MANDATORY

All Kimi subagent calls MUST route through the skill wrapper. Direct `pi --provider kimi-coding` calls are **prohibited** — they bypass telemetry, fallback, auth detection, and timeout scaling.

- **One-liner:** `kimi-delegate --task "..."`
- **Interactive:** `kimi-delegate --interactive`
- **Long path (fallback):** `./skills/kimi-delegate/scripts/delegate.py --task "..."`

**Why this matters:**
- Structured envelopes prevent vague handoffs
- Auto-scaling timeouts prevent hangs on large repos
- Auth error detection gives explicit resume steps instead of silent failures
- Codex fallback ensures tasks always complete
- Telemetry enables continuous improvement

**Bypassing the wrapper will be detected and reported.**

- Always produce an envelope first with `./skills/kimi-delegate/scripts/plan_prompt.py --task "..."`.
- Keep delegation scoped and include acceptance criteria.
- If Kimi fails, keep fallback enabled and inspect telemetry (`./skills/kimi-delegate/scripts/kimi_delegate_telemetry.py summary --days 14`).
<!-- kimi-delegate:end -->

<!-- devin-delegate:begin -->
## Devin Delegate Routing — MANDATORY

All Devin calls MUST route through the skill wrapper. Direct `devin --print` and `devin --task` calls are **prohibited** — they bypass envelope checks, fallback routing, clarification handling, and telemetry.

- **One-liner:** `devin-delegate --task "..."`
- **Interactive:** `devin-delegate --interactive`
- **Long path (fallback):** `./skills/devin-delegate/scripts/delegate.py --task "..."`

**Why this matters:**
- Structured envelopes prevent vague handoffs
- Codex then Claude guidance resolves many clarification loops before human escalation
- Provider fallback keeps execution moving when Devin fails
- Telemetry enables continuous improvement

**Bypassing the wrapper will be detected and reported.**

- Always produce an envelope first with `./skills/devin-delegate/scripts/plan_prompt.py --task "..."`.
- Keep delegation scoped and include acceptance criteria.
- If Devin asks for clarification, use Codex guidance first and Claude second before asking a human.
- Inspect telemetry regularly (`./skills/devin-delegate/scripts/devin_delegate_telemetry.py summary --days 14`).
<!-- devin-delegate:end -->

## E2E Testing with Forked Mainnet — MANDATORY BEFORE CLAIMING COMPLETE

Before claiming any task is complete, you MUST run the full e2e test suite with forked mainnet to verify the entire integrated system works.

### Prerequisites

**Node.js Version**: This project requires Node.js v22.13+ (due to pnpm 11.0.8 requirements).
```bash
# Check your version
node --version  # Must be v22.13+

# If using nvm:
nvm install 22
nvm use 22
```

### Full E2E Test Commands

```bash
# 1. Install dependencies
corepack pnpm install

# 2. Start infrastructure (Postgres + Redis)
make infra-up

# 3. Start Ethereum mainnet fork (backgrounded)
make fork-mainnet &
# This starts anvil at http://127.0.0.1:8545

# 4. Deploy contracts to the fork
PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  corepack pnpm --filter intelligence-exchange-cannes-contracts deploy:arc-testnet

# 5. Deploy INTEL liquidity to the fork
make deploy-intel-liquidity

# 6. Start the full development stack
make dev
# This starts: broker API, web frontend, runs migrations, seeds demo data

# 7. Run the integration tests
corepack pnpm --filter intelligence-exchange-cannes-contracts test --fork-url http://127.0.0.1:8545

# 8. Run acceptance tests
make test-acceptance

# 9. Run infra security tests
make test-infra-security

# 10. Full validation (typecheck + build + test)
make validate
```

### Full Demo Workflow

For a complete end-to-end demo with wallet impersonation:

```bash
# Quick start demo (includes infra + full stack)
make demo

# Full mainnet fork demo
PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  make demo-fork
```

### Browser E2E Testing

The web frontend includes wallet impersonation for testing:

1. **Access the app**: Open http://localhost:3100 after `make dev`
2. **Wallet impersonation**: The broker supports test wallets from the fork
3. **Test flows**:
   - Post an idea with World ID verification (demo mode available)
   - Fund escrow with USDC (Arc testnet or fork)
   - Claim jobs as an agent
   - Submit work for review
   - Accept/reject submissions
   - Verify settlement and attestations

### Key Test Scenarios

**1. Task Creation & Funding**
- Create idea via web UI or API
- Fund with USDC through Arc escrow
- Verify escrow contract state

**2. Agent Claim & Execution**
- Register agent identity
- Claim available milestone
- Execute task (code change, analysis, etc.)
- Submit artifact with proof

**3. Review & Settlement**
- Human review of submission
- Accept/reject decision
- 81/9/10 split settlement (worker/staker/treasury)
- On-chain attestation minting

**4. Tokenomics Flow**
- INTEL token minting for stable funding
- LP operations on fork
- Staker yield deposits
- Platform fee routing

### Contract Deployment Verification

After deployment to fork, verify:

```bash
# Check contract addresses
corepack pnpm --filter intelligence-exchange-cannes-contracts script/PrintAddresses.s.sol \
  --rpc-url http://127.0.0.1:8545

# Verify contract bytecode
cast code <contract_address> --rpc-url http://127.0.0.1:8545
```

### Troubleshooting

**Node.js version errors**: Upgrade to v22.13+
**Port conflicts**: Check .env for PORT, POSTGRES_PORT, REDIS_PORT overrides
**Docker issues**: Ensure Docker is running and ports are available
**Fork fails**: Check internet connection for mainnet endpoint
**Contract deployment fails**: Verify PRIVATE_KEY is set and valid

### Documentation References

- E2E demo: `docs/E2E_AGENT_DEMO.md`
- Test report: `docs/E2E_TEST_REPORT.md`
- Acceptance matrix: `spec/ACCEPTANCE_TEST_MATRIX.md`
- Deployment guide: `docs/DEPLOYMENT_GUIDE.md`

**REMEMBER**: Never claim a task is complete without running at least `make validate` and verifying the web UI loads correctly at http://localhost:3100.
