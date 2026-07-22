# Maintenance State
last_run: 2026-07-22
focus: ts-cleanup
status: completed
completed:
  - fix(ts-cleanup): add "ignoreDeprecations": "6.0" to apps/intelligence-exchange-cannes-web/tsconfig.json — silences TS5101 (baseUrl deprecated in TS 6)
  - fix(ts-cleanup): replace bigint truthiness guards with !== undefined in StakingPage.tsx — prevents 0n from being inferred as ReactNode (TS2322 was latent, suppressed by dead JSX @ts-ignore)
  - chore: remove dead {/* @ts-ignore */} JSX block comment (JSX comments cannot carry @ts-ignore directives)
in_progress:
  - PR #84 chore/maintenance-2026-07-22 open — CI queued
pending:
  - StakingPage.tsx @ts-ignore RESOLVED — root cause was TS2322 from bigint guard, now fixed properly
  - PR #66 (chore/maintenance-2026-06-09) still unmerged — contains earlier noUnusedLocals fixes
  - PR #83 (chore/maintenance-2026-07-16) still unmerged — AMM test coverage
known_failures:
  - broker acceptance tests require PostgreSQL — skip in sandbox
  - worker bun test fails from pkg dir — run from workspace root with pnpm test
  - PR #66 (chore/maintenance-2026-06-09) unmerged — contains earlier noUnusedLocals fixes
skip_next_run: []
