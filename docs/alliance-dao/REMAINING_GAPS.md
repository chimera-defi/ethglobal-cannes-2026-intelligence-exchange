# Remaining Gaps Beyond Track D Credentials

> Audit date: 2026-05-28  
> Branch: alliance-dao-positioning  
> Server target: 168.119.15.122 (Caddy reverse proxy, replaces Vercel + Railway)

---

## Must-Have Before Demo

1. **`PRIVATE_KEY` for Foundry deploy** — Deploy.s.sol reads `vm.envUint("PRIVATE_KEY")`. The Sepolia deployer address needs ≥ 0.5 ETH on Sepolia for the 11-contract deploy + token distribution txs.

2. **`deployments/` directory missing from contracts package** — The `_writeDeploymentJson()` call in Deploy.s.sol writes to `deployments/<chainId>.json` (fs_permissions in foundry.toml grants read-write there), but the directory does not exist yet. Create it with `mkdir -p packages/intelligence-exchange-cannes-contracts/deployments/` before running forge script.

3. **Three VITE contract address vars are blank** — `VITE_INTEL_TOKEN_ADDRESS`, `VITE_INTEL_STAKING_ADDRESS`, and `VITE_INTEL_MINT_CONTROLLER_ADDRESS` in the web `.env.example` have no values. The Staking and Mint pages both show a "contracts not deployed" warning until these are filled from the deployment JSON. These cannot be set until the Sepolia deploy runs.

4. **Env name mismatch: `ARC_ATTESTOR_PRIVATE_KEY` vs `BROKER_ATTESTOR_PRIVATE_KEY`** — `.env.example` documents `ARC_ATTESTOR_PRIVATE_KEY` (used by `arcEscrowService.ts` for on-chain attestation signing). But `identityService.ts → getBrokerAttestorAccount()` reads `BROKER_ATTESTOR_PRIVATE_KEY` and falls back to a well-known Anvil dev key (`0x59c6...4a72`) if not set. Both service code paths need the same real key. You must set **both** vars (or alias one to the other) in production `.env`.

5. **`VITE_BROKER_URL` must be updated** — `.env.example` default is `http://localhost:3001/v1/cannes`. For the self-hosted server this must be `http://168.119.15.122/v1/cannes` (or the Caddy-fronted HTTPS equivalent). The build bakes this in at compile time.

6. **`docs/tokenomics.md` does not exist** — Listed as a gap. The Alliance DAO application references tokenomics detail but there is no `docs/tokenomics.md` file. Either create it or remove the reference.

7. **`WORK_RECEIPT_BASE_URI` points to non-existent domain** — Deploy.s.sol hardcodes `https://api.iex.cannes/metadata/receipts/` as the ERC-1155 metadata base URI. This domain is not live. For the demo this is cosmetic (NFT metadata 404s), but it should be changed to a real URL (e.g. `http://168.119.15.122/metadata/receipts/`) before deployment if the metadata endpoint will exist.

---

## Env Vars Needed (secrets)

| Var | Purpose | Has Default? |
|-----|---------|-------------|
| `PRIVATE_KEY` | Foundry deploy — Sepolia deployer private key | No |
| `ARC_ATTESTOR_PRIVATE_KEY` | arcEscrowService on-chain attestation signing | No (blank in example) |
| `BROKER_ATTESTOR_PRIVATE_KEY` | identityService `getBrokerAttestorAccount()` — falls back to Anvil dev key if unset | Dangerous fallback only |
| `ARC_PRIVATE_KEY` | arcEscrowService broker wallet for Arc testnet transactions | No (blank in example) |
| `WORLD_SIGNING_KEY` | World ID 4.0 RP signature generation | No (blank in example) |
| `WORLD_VERIFICATION_SECRET` | HMAC secret for internal World verification tokens | No (blank in example) |
| `ARC_WEBHOOK_SECRET` | Webhook HMAC signature verification from Arc (empty = skip, safe for dev) | Optional (empty = disabled) |
| `ZERO_G_PRIVATE_KEY` | 0G testnet broker wallet (in live `.env`, not example) | No |

---

## Env Vars Needed (config, non-secret)

| Var | Purpose | Current Value |
|-----|---------|--------------|
| `VITE_BROKER_URL` | Frontend → broker API base URL | `http://localhost:3001/v1/cannes` (needs update to server IP) |
| `VITE_INTEL_TOKEN_ADDRESS` | Frontend staking + mint pages | Empty (fill after deploy) |
| `VITE_INTEL_STAKING_ADDRESS` | Frontend staking page | Empty (fill after deploy) |
| `VITE_INTEL_MINT_CONTROLLER_ADDRESS` | Frontend mint page | Empty (fill after deploy) |
| `WORLD_APP_ID` | World ID app identifier | Has staging default in example (`app_a3f0f85864f650c695989e62d3a39aca`) |
| `WORLD_RP_ID` | World ID relying-party ID | Has staging default in example (`rp_abb9849b2199b040`) |
| `TIMELOCK_DELAY` | Foundry deploy — timelock controller delay | Defaults to 48h; set to 900 (15 min) for testnet demo |
| `BROKER_URL` | Broker's own public URL (used in CORS / self-referencing links) | `http://localhost:3001` — needs update |

---

## On-Chain Wiring Still Deferred

- **`WorkReceipt1155.mint()` is never called by the broker.** `chainService.ts` issues signed off-chain attestations (`issueAcceptedSubmissionAttestation`) and stores them in Postgres, but there is no code that calls the deployed `WorkReceipt1155` contract to mint an ERC-1155 token on-chain after acceptance. The `workReceipt.setOperator(attestor, true)` wiring in the deploy script is ready, but the broker has no wallet client that calls `mint()`. This is the biggest on-chain gap: the NFT receipt exists in the smart-contract system but is never issued.

- **`recordAcceptedSubmission()` (chain sync for the `accepted_submission_attested` event) is driven by the frontend webhook**, not by the broker automatically. There is no broker-side code that pushes the `accepted_submission_attested` event after `issueAcceptedSubmissionAttestation()` succeeds. The frontend must call `POST /v1/cannes/chain/sync` explicitly. This is fine for demo but needs documentation.

---

## Quick Wins (< 1hr each)

- **Create `deployments/` directory** in `packages/intelligence-exchange-cannes-contracts/`:  
  `mkdir -p packages/intelligence-exchange-cannes-contracts/deployments`

- **Fix `.env.example` → add `BROKER_ATTESTOR_PRIVATE_KEY`** alongside `ARC_ATTESTOR_PRIVATE_KEY` to avoid the dangerous Anvil dev-key fallback in production:  
  Add `BROKER_ATTESTOR_PRIVATE_KEY=   # <-- same value as ARC_ATTESTOR_PRIVATE_KEY` to the example.

- **Update `DEPLOYMENT_GUIDE.md`** — it still describes Vercel + Railway as the recommended path. Add a "Self-hosted (Caddy)" section describing 168.119.15.122 setup.

- **Set `TIMELOCK_DELAY=900`** in the deploy env for the testnet demo (avoid 48h timelock on governance actions).

- **Confirm PR #46 is the deployment branch** — PR #46 is open (status: OPEN, branch: alliance-dao-positioning). No CI checks configured. Merge or deploy from this branch directly.

- **Add `WORLD_ID_APP_ID` to broker `.env`** — the task context refers to `WORLD_ID_APP_ID` but the broker code reads `WORLD_APP_ID`. These are different names. The staging `WORLD_APP_ID` already has a value in `.env.example`; confirm whether a production app ID is needed.

- **`docs/tokenomics.md` is missing** — create stub or remove references.

---

## Track D Credential Checklist

- [ ] Sepolia deployer private key (`PRIVATE_KEY` for Foundry) + ≥ 0.5 ETH on Sepolia for gas
- [ ] `WORLD_APP_ID` (staging value exists in example; production value needed if `WORLD_ENVIRONMENT=production`)
- [ ] `ARC_ATTESTOR_PRIVATE_KEY` (for arcEscrowService on-chain signing)
- [ ] `BROKER_ATTESTOR_PRIVATE_KEY` (same key as above — different var name in identityService.ts)
- [ ] `ARC_WEBHOOK_SECRET` (optional — empty disables signature check; set for production)
- [ ] `VITE_BROKER_URL` → `http://168.119.15.122/v1/cannes` (or HTTPS via Caddy)
- [ ] `VITE_INTEL_TOKEN_ADDRESS`, `VITE_INTEL_STAKING_ADDRESS`, `VITE_INTEL_MINT_CONTROLLER_ADDRESS` → from `deployments/11155111.json` after Sepolia deploy
- [ ] `mkdir -p packages/intelligence-exchange-cannes-contracts/deployments` before running forge script
