# Deploy Checklist — Intelligence Exchange Cannes 2026

All 8 contracts are defined in `packages/intelligence-exchange-cannes-contracts/script/Deploy.s.sol`.
Run `~/.foundry/bin/forge build` first to confirm a clean compile.

---

## Prerequisites

- [ ] Foundry installed (`~/.foundry/bin/forge --version`)
- [ ] Node 18+ and pnpm installed
- [ ] Railway CLI installed (`npm i -g @railway/cli`) — for broker
- [ ] Vercel CLI installed (`npm i -g vercel`) — for web frontend
- [ ] Etherscan API key (for Sepolia verification)

---

## 1. Contracts — Sepolia Testnet

```bash
# Required
export PRIVATE_KEY=<deployer private key>
export ETHERSCAN_API_KEY=<etherscan api key>

# Optional — all default to deployer address if unset
export ATTESTOR_ADDRESS=<attestor address>
export STAKER_YIELD_RECEIVER=<staker yield receiver address>
export PLATFORM_WALLET=<treasury / platform fee address>
export DISPUTE_RESOLVER=<dispute resolver address>

cd packages/intelligence-exchange-cannes-contracts

~/.foundry/bin/forge script script/Deploy.s.sol \
  --rpc-url https://rpc.sepolia.org \
  --broadcast --verify \
  --etherscan-api-key $ETHERSCAN_API_KEY
```

Deployed contracts are logged to stdout and written to
`broadcast/Deploy.s.sol/11155111/run-latest.json`.

---

## 2. Contracts — Arc Testnet (Prize 1)

Arc uses USDC as the native gas token. No ETH needed.

```bash
export PRIVATE_KEY=<deployer private key>
# Optional role overrides (same as Sepolia above)

cd packages/intelligence-exchange-cannes-contracts

~/.foundry/bin/forge script script/Deploy.s.sol \
  --rpc-url https://rpc.testnet.arc.network \
  --broadcast
```

Notes:
- Arc Testnet Chain ID: `5042002`
- Arc Testnet USDC: `0x3600000000000000000000000000000000000000` (also gas token)
- Explorer: https://testnet.arcscan.app
- Testnet USDC faucet: https://faucet.circle.com → select "Arc Testnet"
- Broadcast output: `broadcast/Deploy.s.sol/5042002/run-latest.json`

---

## 3. Broker — Railway

### One-time setup

```bash
railway login
railway init          # link to your Railway project
```

### Add plugins in Railway dashboard

1. PostgreSQL plugin — copy the `DATABASE_URL` value
2. Redis plugin — copy the `REDIS_URL` value

### Environment variables (set in Railway dashboard or via CLI)

All variables from `.env.example` are required. Key ones:

| Variable | Value |
|---|---|
| `DATABASE_URL` | from Railway PostgreSQL plugin |
| `REDIS_URL` | from Railway Redis plugin |
| `PORT` | `3001` |
| `TOKENOMICS_ENABLED` | `true` |
| `TOKEN_SYMBOL` | `IXP` |
| `ARC_RPC_URL` | `https://rpc.testnet.arc.network` |
| `ARC_CHAIN_ID` | `5042002` |
| `ARC_ESCROW_CONTRACT_ADDRESS` | from step 2 above |
| `ARC_USDC_ADDRESS` | `0x3600000000000000000000000000000000000000` |
| `ARC_PRIVATE_KEY` | broker signing key |
| `ARC_ATTESTOR_PRIVATE_KEY` | attestor signing key |
| `ZERO_G_PRIVATE_KEY` | 0G storage key |
| `WORLD_SIGNING_KEY` | World ID signing key (secret) |
| `WORLD_VERIFICATION_SECRET` | World ID verification secret (secret) |
| `WORLDCHAIN_RPC_URL` | `https://worldchain-sepolia.g.alchemy.com/public` |
| `IEX_IDENTITY_GATE_ADDRESS` | from Sepolia deploy (step 1) |
| `IEX_AGENT_REGISTRY_ADDRESS` | from Sepolia deploy (step 1) |
| `IEX_ESCROW_ADDRESS` | from Sepolia deploy (step 1) |

### Deploy

```bash
# Build
cd apps/intelligence-exchange-cannes-broker
npm run build

# Deploy to Railway
railway up
```

Start command: `node dist/index.js`

---

## 4. Web Frontend — Vercel

The web app is a Vite + React SPA (not Next.js).

### Environment variables (set in Vercel dashboard)

| Variable | Value |
|---|---|
| `VITE_BROKER_URL` | Railway broker public URL (e.g. `https://broker.iex.railway.app`) |

### Deploy

```bash
cd apps/intelligence-exchange-cannes-web

# Build locally first to verify
npm run build

# Deploy to Vercel
vercel --prod
```

Vercel settings:
- Framework: Vite
- Build command: `npm run build`
- Output directory: `dist`
- Root directory: `apps/intelligence-exchange-cannes-web`

---

## 5. Post-Deploy Updates

After all services are live, complete the following:

- [ ] Copy deployed contract addresses from `broadcast/Deploy.s.sol/<chainId>/run-latest.json`
      into `.env.example` under the matching chain section
      (`IEX_*` for Sepolia/Worldchain, `ZERO_G_*` for 0G, `ARC_ESCROW_CONTRACT_ADDRESS` for Arc)
- [ ] Update `docs/alliance-dao/APPLICATION.md` with live URLs:
      - Broker: `https://<railway-url>`
      - Web: `https://<vercel-url>`
      - Arc contract: `https://testnet.arcscan.app/address/<AdvancedArcEscrow>`
      - Sepolia contracts: `https://sepolia.etherscan.io/address/<contract>`
- [ ] Run E2E smoke test against live endpoints:

```bash
# Quick broker health check
curl https://<railway-url>/health

# Quick web check
curl -I https://<vercel-url>

# Contract read check (Arc testnet)
~/.foundry/bin/cast call <AdvancedArcEscrow> \
  "platformWallet()(address)" \
  --rpc-url https://rpc.testnet.arc.network
```

---

## Contract Deploy Order

The script deploys in dependency order:

1. `IdentityGate` — no dependencies
2. `AgentIdentityRegistry` — depends on IdentityGate
3. `IdeaEscrow` — no dependencies
4. `AdvancedArcEscrow` — depends on IdentityGate
5. `IntelToken` — no dependencies
6. `IntelStaking` — depends on IntelToken
7. `IntelMintController` — depends on IntelToken + IntelStaking
8. `WorkReceipt1155` — no dependencies

---

## Track D Submission Checklist

- [ ] AdvancedArcEscrow live on Arc testnet
- [ ] IntelToken + IntelStaking + IntelMintController live on Sepolia
- [ ] Broker live on Railway with all env vars set
- [ ] Web frontend live on Vercel
- [ ] Live URLs added to `docs/alliance-dao/APPLICATION.md`
- [ ] Demo video recorded showing: fund → reserve → submit → review → approve → release
