## Cannes 2026 First 60 Minutes

### Goal

Bring up a local deterministic version of the Cannes variant with:
- one seeded idea
- one seeded worker
- one funded escrow fixture
- one successful artifact submission

### Target Layout

```bash
apps/intelligence-exchange-cannes-web
apps/intelligence-exchange-cannes-broker
apps/intelligence-exchange-cannes-worker
contracts
packages/intelligence-exchange-cannes-shared
packages/intelligence-exchange-cannes-fixtures
```

### Bootstrap

```bash
# web
mkdir -p apps/intelligence-exchange-cannes-web
cd apps/intelligence-exchange-cannes-web
bun create vite . --template react-ts

# broker
mkdir -p ../intelligence-exchange-cannes-broker
cd ../intelligence-exchange-cannes-broker
bun create hono .
bun add zod drizzle-orm postgres bullmq ioredis

# worker
mkdir -p ../intelligence-exchange-cannes-worker
cd ../intelligence-exchange-cannes-worker
bun init -y
bun add commander zod dotenv

# shared + fixtures
mkdir -p ../../packages/intelligence-exchange-cannes-shared
mkdir -p ../../packages/intelligence-exchange-cannes-fixtures
mkdir -p ../../contracts
```

### Required Seed Fixtures

- `idea.seed.json`
- `worker.seed.json`
- `brief.seed.json`
- `submission.valid.json`
- `submission.invalid.json`
- `escrow.expected.json`

### Local Commands

```bash
pnpm install
pnpm contracts:build
pnpm demo:reset
pnpm test:acceptance --filter iex-cannes:verify-poster
pnpm test:acceptance --filter iex-cannes:fund-idea
pnpm test:acceptance --filter iex-cannes:claim
pnpm test:acceptance --filter iex-cannes:submit
pnpm test:acceptance --filter iex-cannes:release
pnpm dev
```

### Success Criteria

1. Poster can create funded idea locally.
2. Worker can claim one milestone.
3. Submission can pass through score and acceptance.
4. Escrow state changes are visible.
5. Dossier panel shows a local or stubbed URI.
