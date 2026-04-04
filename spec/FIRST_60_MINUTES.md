# Intelligence Exchange First 60 Minutes

This repo already contains the broker, web app, contracts, and worker CLI. The fastest local proof is a seeded broker plus one small worker run against a `brief` milestone.

## Goal
Run the local broker, verify one worker, auto-claim one seeded milestone, and submit a deterministic artifact back to the broker.

## Commands
```bash
cp .env.example .env.local

pnpm install
pnpm demo:bootstrap

# start this in a separate terminal
pnpm --filter intelligence-exchange-cannes-broker start

pnpm worker:cli -- verify --worker-id demo-auto-brief --wallet-address 0x0000000000000000000000000000000000000001

pnpm worker:cli -- start \
  --once \
  --worker-id demo-auto-brief \
  --agent-type codex \
  --milestone-type brief \
  --executor ./apps/intelligence-exchange-cannes-worker/examples/complete-brief-task.sh

pnpm worker:cli -- list --status submitted
pnpm test:acceptance
```

## Success Criteria (within 60 min)
1. Broker boots against the seeded demo state.
2. `pnpm worker:cli -- start --once ...` claims one queued `brief` job.
3. The worker writes a run folder under `.iex-worker-runs/` with `skill.md`, `job.json`, `claim.json`, and `result.json`.
4. The broker marks the job `submitted`.
