# Maintenance State
last_run: 2026-06-26
focus: dead-code
status: completed
completed:
  - Dead code scan on main: no new dead code since last pass (2026-06-19)
  - Main unchanged since 2026-06-16 (only .claude/maintenance-state.md commit on main)
  - tsc --noUnusedLocals: 20 unused imports found — all pre-existing, covered by open PR #66 (chore/maintenance-2026-06-09)
  - Additional 4 unused chainService imports in jobService.ts covered by open PR #73 (chore/maintenance-2026-06-23)
  - rg TODO/FIXME/HACK: no results in TS/TSX source files
  - rg @ts-ignore/@ts-nocheck: clean (StakingPage.tsx @ts-ignore is in open PR tracking)
  - rg orphaned files: none found
  - console.log audit: all broker logs are intentional structured operational logs
in_progress:
pending:
  - Merge PR #66 (21 unused import/var removals — broker + web)
  - Merge PR #73 (4 unused chainService imports in jobService.ts)
  - Investigate StakingPage.tsx @ts-ignore line 204 (Type '0n | Element | undefined' not assignable to ReactNode)
known_failures:
  - broker acceptance tests require PostgreSQL — skip in sandbox
  - worker bun test fails from pkg dir — run from workspace root with pnpm test
  - StakingPage.tsx has one @ts-ignore comment needing proper fix
  - tsc --noUnusedLocals fails with bun-types env error in sandbox (packages not installed)
attempt_counts: {}
