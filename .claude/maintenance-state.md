# Maintenance State
last_run: 2026-06-09
focus: ts-cleanup
status: completed
completed: [remove 21 unused imports/variables across broker+web (tsc --noUnusedLocals), typecheck passes clean]
in_progress:
pending: [broker acceptance tests — require PostgreSQL]
known_failures:
  - broker bun test fails with ECONNREFUSED 5432 (no PostgreSQL in sandbox) — skip broker tests in this env
  - infra-hardening-regression CI check requires Docker — pre-existing skip in all PRs
  - worker cli.test.ts fails with "Cannot find package viem" — pnpm workspace not installed in worker pkg dir; run from root
skip_next_run: [ts cleanup pass — done until new code added]
attempt_counts:
