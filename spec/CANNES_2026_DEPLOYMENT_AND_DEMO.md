## Cannes 2026 Deployment And Demo

### Deployment Shape

#### Local deterministic mode

- broker, planner, scorer, and web app run locally
- Arc contract interactions mocked or pointed to local chain
- World and 0G have local or stubbed fallback modes

Purpose:
- guaranteed demo backup

#### Public testnet rehearsal

- escrow contract deployed to a public rehearsal network
- broker and web app pointed at rehearsal endpoints
- World and 0G integrations tested with the same seeded accounts used for final demo where possible

Purpose:
- validate end-to-end deploy before public demo

#### Public demo mode

- web app deployed publicly
- broker, planner, scorer, and dossier writer on hosted backend
- escrow contract deployed on Arc public network after rehearsal pass
- sponsor integrations wired to real services where stable enough

Purpose:
- prize eligibility and live proof

### Forked Mainnet Liquidity Rehearsal

Use this rehearsal mode to validate token-market behavior locally against Ethereum mainnet state.

1. Run a one-command smoke that starts a mainnet fork, deploys `INTEL`, seeds `INTEL/WETH` liquidity on Uniswap V2, verifies non-zero reserves, and shuts down:

```bash
corepack pnpm --filter intelligence-exchange-cannes-contracts smoke:intel-liquidity:mainnet-fork
```

2. If you want manual control, run fork and deploy separately:

```bash
corepack pnpm --filter intelligence-exchange-cannes-contracts mainnet:fork
MAINNET_FORK_RPC_URL=http://127.0.0.1:8545 \
PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
corepack pnpm --filter intelligence-exchange-cannes-contracts deploy:intel-liquidity:mainnet-fork
```

3. If a public RPC endpoint throttles requests, use fallback endpoints:

```bash
MAINNET_RPC_URLS="https://ethereum.publicnode.com,https://eth.merkle.io,https://eth.llamarpc.com" \
corepack pnpm --filter intelligence-exchange-cannes-contracts smoke:intel-liquidity:mainnet-fork
```

Required proof artifacts from this run:
- `INTEL_TOKEN_ADDRESS`
- `INTEL_WETH_PAIR_ADDRESS`
- `getReserves()` output with non-zero reserves

### Recommended Public-Network Strategy

1. Deploy the smallest possible escrow contract surface.
2. Keep planner, broker, scoring, and dossier orchestration offchain.
3. Require human approval for all irreversible payout actions.
4. Use a single seeded poster and seeded worker operator for the demo.
5. Rehearse the exact seeded flow on testnet before any public-network payout demo.

### Demo Script

1. Poster verifies identity.
2. Poster funds one idea job.
3. Planner emits `BuildBrief`.
4. Worker verifies identity and claims one milestone.
5. Worker agent submits:
   - output artifact
   - trace
   - one paid dependency event
6. Scorer accepts.
7. Poster approves release.
8. Arc escrow releases payout.
9. 0G dossier link is opened.

### Demo Failure Fallbacks

#### Arc unavailable

- show local deterministic replay with the same escrow state transitions

#### World unavailable

- use clearly labeled preverified operator account for demo continuity

#### 0G unavailable

- show queued dossier state and local mirror, but mark storage as pending

### Mainnet Readiness Checklist

- contract addresses recorded
- public testnet contract addresses recorded
- funded poster account seeded
- funded payout account seeded
- worker operator account verified
- public dossier write tested
- acceptance and payout tested once before stage demo
- fallback mode rehearsed

### Public-Network Honesty Rules

1. Do not claim open marketplace liquidity if only one worker exists.
2. Do not claim autonomous payouts if approval remains human-gated.
3. Do not claim censorship-resistant dispute resolution if disputes remain offchain.
4. Clearly label any stubbed sponsor integration.
