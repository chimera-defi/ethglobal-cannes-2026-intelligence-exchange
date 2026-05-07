# Tokenomics Coverage Matrix

Last updated: 2026-04-18

## Scope

This matrix tracks what is currently demoable and tested for the INTEL launch architecture actor flows.

## Coverage

| Flow | Actor(s) | Automated Test | Demo Command | Current Status |
|---|---|---|---|---|
| Task fee split `81/9/10` | Worker, staker, treasury | `packages/intelligence-exchange-cannes-tokenomics/test/intel.actor-flows.test.ts` (`task settlement split`) | `corepack pnpm demo:tokenomics:actors` | Covered |
| Mint inflow split `50/45/5` | POL, staker, treasury | `packages/intelligence-exchange-cannes-tokenomics/test/intel.actor-flows.test.ts` (`mint inflow split`) | `corepack pnpm demo:tokenomics:actors` | Covered |
| Stake-to-mint epoch allowance caps | Staker | `packages/intelligence-exchange-cannes-tokenomics/test/intel.actor-flows.test.ts` (`stake-to-mint allowance`) | `corepack pnpm demo:tokenomics:actors` | Covered |
| Staker yield distribution | All stakers | `packages/intelligence-exchange-cannes-tokenomics/test/intel.actor-flows.test.ts` (`staker yield distribution`) | `corepack pnpm demo:tokenomics:actors` | Covered |
| LP lifecycle (add/remove) | LP | `packages/intelligence-exchange-cannes-tokenomics/test/intel.actor-flows.test.ts` (`lp add/remove lifecycle`) | `corepack pnpm demo:tokenomics:actors` | Covered |
| Holder market round-trip | Holder, LP | `packages/intelligence-exchange-cannes-tokenomics/test/intel.actor-flows.test.ts` (`holder round-trip`) | `corepack pnpm demo:tokenomics:actors` | Covered |
| Pool bootstrapping on forked mainnet | Protocol LP | `packages/intelligence-exchange-cannes-contracts/script/smoke_intel_liquidity_fork.sh` | `corepack pnpm --filter intelligence-exchange-cannes-contracts smoke:intel-liquidity:mainnet-fork` | Covered |
| Marketplace lifecycle with acceptance | Poster, worker, reviewer | `apps/intelligence-exchange-cannes-broker/src/__tests__/acceptance/acceptance.test.ts` | `corepack pnpm validate:all` | Covered |

## Notes

- The actor-flow simulation tests are economics-level checks (deterministic math + AMM behavior), not onchain settlement proofs.
- The fork smoke test proves live pool creation and reserve existence against mainnet state.
- Full public testnet rehearsal still requires funded credentials and RPC configuration.

