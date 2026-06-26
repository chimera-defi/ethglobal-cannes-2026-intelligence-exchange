# Maintenance State
last_run: 2026-06-08
focus: deps
status: completed
completed: [viem ^2.23.2→^2.52.2 (broker-core+protocol-sdk), hono ^4.12.14→^4.12.24, postgres ^3.4.4→^3.4.9, playwright ^1.59.1→^1.60.0]
in_progress:
pending: []
known_failures:
  - broker bun test fails with ECONNREFUSED 5432 (no PostgreSQL in sandbox) — skip broker tests in this env
  - infra-hardening-regression CI check requires Docker — pre-existing skip in all PRs
  - worker cli.test.ts fails with "Cannot find package viem" — pnpm workspace not installed in worker pkg dir; run from root
skip_next_run: [tokenomics amm.ts — fully covered until amm.ts changes]
attempt_counts:
