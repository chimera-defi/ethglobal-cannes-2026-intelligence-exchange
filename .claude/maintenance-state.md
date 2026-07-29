# Maintenance State
last_run: 2026-07-29
focus: security
status: completed
completed:
  - fix(security): hono ^4.12.14 → ^4.12.32 in broker-core (CORS-reflect CVE <4.12.25)
  - fix(security): hono ^4.3.0 → ^4.12.32 in broker app (same CVEs, wider gap)
  - fix(security): postcss ^8.4.38 → ^8.5.23 in web (path-traversal CVE ≤8.5.17)
  - secret scan: all private/API key refs read from process.env — no hardcoded credentials
  - .env / .env.local / .env.*.local already in .gitignore
  - pnpm audit before: 39 vulns (7 high) → after: 27 vulns (6 high)
  - PR #89: chore/maintenance-2026-07-29
in_progress:
pending:
  - react-router v6→v7 upgrade (constructor injection CVE requires major bump — deferred)
  - wagmi v2→v3 chain transitive (ws/axios/form-data vulns — deferred, major bump)
known_failures:
  - broker acceptance tests require PostgreSQL — skip in sandbox
  - worker bun test fails from pkg dir — run from workspace root with pnpm test
  - StakingPage.tsx BigInt-as-ReactNode fix in open PR #88 (unmerged, waiting review)
