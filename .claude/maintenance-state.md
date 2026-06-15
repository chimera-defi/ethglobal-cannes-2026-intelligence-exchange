# Maintenance State
last_run: 2026-06-15
focus: deps
status: completed
completed: [playwright 1.59.1 → 1.60.0 (minor bump, only outdated dep found by pnpm outdated)]
in_progress:
pending: [broker unit tests — require PostgreSQL mock setup]
known_failures:
  - broker bun test fails with ECONNREFUSED 5432 (no PostgreSQL in sandbox) — skip broker tests in this env
  - infra-hardening-regression CI check requires Docker — pre-existing skip in all PRs
  - worker cli.test.ts fails with "Cannot find package viem" — pnpm workspace not installed in worker pkg dir; run from root
skip_next_run: [tokenomics amm.ts — fully covered until amm.ts changes]
