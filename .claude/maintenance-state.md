# Maintenance State
last_run: 2026-08-26
focus: security
status: completed
completed:
  - fix(security): bump hono ^4.3.0→^4.13.4 in broker (patches CORS + DoS CVEs, >=4.12.25 + >=4.12.34)
  - fix(security): bump hono ^4.12.14→^4.13.4 in broker-core
  - fix(security): add pnpm.overrides for ws>=8.21.0, axios>=^1.18.0, form-data>=4.0.6, nanoid>=3.3.18, socket.io-parser>=4.2.7
  - fix(security): fresh pnpm install regenerates lockfile; 54 vulns → 15 (10 high → 2 high)
  - fix(security): postcss 8.5.14→8.5.26 (path traversal CVE), nanoid→3.3.18, ws→8.21.0, socket.io-parser→4.2.7, form-data→4.0.6
pending:
  - ws@8.18.0 via rainbowkit/walletconnect — requires major rainbowkit upgrade, deferred
  - axios@1.16.0 via rainbowkit/walletconnect — requires major rainbowkit upgrade, deferred
  - postcss build-time transitive (tailwind@3 pins it) — deferred until tailwind v4 migration
known_failures:
  - broker acceptance tests require PostgreSQL — skip in sandbox
  - worker bun test fails from pkg dir — run from workspace root with pnpm test
attempt_counts:
