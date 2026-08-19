# Maintenance State
last_run: 2026-08-19
focus: security
status: completed
completed:
  - fix(security): ws 8.20.1→8.21.0 (high: Memory exhaustion DoS >=8.0.0 <8.21.0)
  - fix(security): axios ^1.8.2→^1.18.0 (high: proxy config cloning >=1.15.2 <1.18.0)
  - fix(security): hono add override ^4.12.25 (high: CORS reflects any Origin <4.12.25)
  - fix(security): form-data add override ^4.0.6 (high: CRLF injection >=4.0.0 <4.0.6)
  - fix(security): nanoid add override ^3.3.18 (high: loop indefinitely <3.3.18)
  - fix(security): postcss add override ^8.5.18 (high: path traversal <=8.5.17)
  - fix(security): socket.io-parser add override ^4.2.7 (high: Memory exhaustion)
  - fix(security): broker/hono ^4.3.0→^4.12.25 direct dep
  - fix(security): broker-core/hono ^4.12.14→^4.12.25 direct dep
in_progress:
pending: []
known_failures:
  - broker acceptance tests require PostgreSQL — skip in sandbox
  - worker bun test fails from pkg dir — run from workspace root with pnpm test
  - StakingPage.tsx has one @ts-ignore comment needing proper fix
  - Many maintenance PRs open and unmerged (PR accumulation)
  - test private key in cli.test.ts is a dev dummy key — not a real secret
  - vite 8.x CVE not applicable — this project uses vite 5.x
attempt_counts:
