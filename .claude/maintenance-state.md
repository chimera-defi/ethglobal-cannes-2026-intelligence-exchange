# Maintenance State
last_run: 2026-09-03
focus: tests
status: completed
completed:
  - test(distribution): add 26 edge-case tests for distribution.ts — assertBpsTotal, guard, cap logic (PR #106)
in_progress:
pending:
  - investigate @ts-ignore at StakingPage.tsx:204 — remaining issue
known_failures:
  - broker acceptance tests require PostgreSQL — skip in sandbox
  - worker bun test fails from pkg dir — run from workspace root with pnpm test
  - PR #66 (chore/maintenance-2026-06-09) unmerged — contains earlier noUnusedLocals fixes
skip_next_run: []
