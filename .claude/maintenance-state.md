# Maintenance State
last_run: 2026-06-04
focus: test-coverage
status: completed
completed: [tokenomics amm.ts coverage (22 tests added, 10→32), broker acceptance test noted as DB-dependent]
in_progress:
pending: [broker unit tests — require PostgreSQL mock setup]
known_failures:
  - broker bun test fails with ECONNREFUSED 5432 (no PostgreSQL in sandbox) — skip broker tests in this env
  - infra-hardening-regression CI check requires Docker — pre-existing skip in all PRs
  - worker cli.test.ts fails with "Cannot find package viem" — pnpm workspace not installed in worker pkg dir; run from root
skip_next_run: [tokenomics amm.ts — fully covered until amm.ts changes]
