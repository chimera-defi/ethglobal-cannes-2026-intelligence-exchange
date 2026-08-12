# Maintenance State
last_run: 2026-08-12
focus: security
status: completed
completed:
  - fix(security): bump postcss ^8.4.38 → ^8.5.26 in web app — GHSA-r28c-9q8g-f849, GHSA-fxqj-rqcc-2cmp
  - secret scan: clean (Anvil test key 0xac09... in demo scripts is public devnet key, not a real secret)
  - existing pnpm overrides cover: axios ^1.8.2, ws 8.20.1, uuid 11.1.1
  - remaining 44 moderate/low vulns are transitive and require upstream package upgrades
in_progress:
pending:
  - investigate @ts-ignore at StakingPage.tsx:204 — Type '0n | Element | undefined' not assignable to ReactNode
  - PRs #66–#93 are all open and unmerged — consider merge or close stale
known_failures:
  - broker acceptance tests require PostgreSQL — skip in sandbox
  - worker bun test fails from pkg dir — run from workspace root with pnpm test
  - StakingPage.tsx has one @ts-ignore comment needing proper fix
attempt_counts:
