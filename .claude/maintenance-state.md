# Maintenance State
last_run: 2026-06-12
focus: dead-code
status: completed
completed: [dead code scan — no actionable removals found]
in_progress:
pending: [broker unit tests — require PostgreSQL mock setup]
known_failures:
  - broker bun test fails with ECONNREFUSED 5432 (no PostgreSQL in sandbox) — skip broker tests in this env
  - infra-hardening-regression CI check requires Docker — pre-existing skip in all PRs
  - worker cli.test.ts fails with "Cannot find package viem" — pnpm workspace not installed in worker pkg dir; run from root
  - tsc has pre-existing errors (vite/client type definition missing, baseUrl deprecation) — unrelated to app code
skip_next_run: [tokenomics amm.ts — fully covered until amm.ts changes]

## Dead Code Scan Notes (2026-06-12)
- Broker console.logs: intentional structured operational logging ([module:action] key=value format) — do NOT remove
- StakingPage.tsx @ts-ignore (line 204): pre-existing, txStatus is null|object so no actual BigInt risk; cannot safely remove without clean tsc environment
- No stale TODOs/FIXMEs found
- No orphaned files found
- No unused exports found beyond what was removed in TS cleanup pass (2026-06-09)
