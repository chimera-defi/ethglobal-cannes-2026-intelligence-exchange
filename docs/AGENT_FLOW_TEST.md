# Agent Flow Test

Quick reference for testing the worker CLI and job flow.

## Setup

```bash
export BROKER_URL=http://localhost:3001
export WORKER_PRIVATE_KEY=0x...
```

## Commands

**List jobs**:
```bash
./apps/intelligence-exchange-cannes-worker/dist/iex-bridge list --status queued
```

**Claim job**:
```bash
./apps/intelligence-exchange-cannes-worker/dist/iex-bridge claim \
  --job-id <JOB_ID> \
  --agent-type claude-code
```

**Submit work**:
```bash
./apps/intelligence-exchange-cannes-worker/dist/iex-bridge submit \
  --job-id <JOB_ID> \
  --claim-id <CLAIM_ID> \
  --artifact "https://github.com/user/repo/commit/abc123" \
  --summary "Completed task" \
  --agent-type claude-code
```

## What Happens on Acceptance

When a reviewer accepts a job:
1. Job status → `accepted`
2. Attestation created and signed
3. **0G Upload**: Dossier uploaded to 0G storage (if `ZERO_G_PRIVATE_KEY` set)
4. Dossier URI stored in database
5. Console log: `[0g:dossier] jobId=... tx=...`

## Verify 0G Upload

Check console for transaction hash, then visit:
```
https://chainscan-galileo.0g.ai/tx/<TX_HASH>
```
