# INTEL Tokenomics Reference

> **Status:** Launch policy — authoritative for broker settlement, contract parameters, and tokenomics demos.  
> **Deep dives:** `spec/tokenomics/INTEL_LAUNCH_ARCHITECTURE.md` · `spec/tokenomics/TOKENOMICS_COVERAGE_MATRIX.md`

---

## What INTEL Is

INTEL is not a governance token. It is the settlement rail.

Every accepted task is priced and cleared in INTEL. INTEL's open-market price is the revealed price of AI labor — actual clearing, not a synthetic oracle. An earlier internal design used IXP (stable-point credits); credits cannot do price discovery because their price is set by policy, not markets. INTEL price is set by what buyers pay and workers accept.

---

## Settlement Split (Accepted Task)

On every accepted milestone, the gross INTEL from the buyer's reserve is split:

| Recipient | Share | Purpose |
|---|---|---|
| Worker | **81%** | Direct payout for accepted work |
| Staker yield pool | **9%** | Distributed to INTEL stakers proportionally |
| Protocol treasury | **10%** | POL adds, buyback/burn, or runway |

Implemented in `tokenomicsService.ts:splitSettlementIntel()` with `stakerYieldBps: 900`. Verified live: `corepack pnpm demo:tokenomics:actors`.

---

## Direct Mint Inflow Routing

When a buyer converts stable → INTEL (direct mint path):

| Destination | Share | Purpose |
|---|---|---|
| Protocol-owned liquidity (POL) | **50%** | On-chain INTEL/WETH pool depth |
| Staker yield | **45%** | Rewards stakers for marketplace security |
| Treasury runway | **5%** | Operating reserve |

POL-first from day one means the protocol builds its own liquidity rather than depending on mercenary LPs. Every mint deepens the pool.

---

## Mint Price + Anti-Reflexivity Guard

Epoch mint rights are capped and priced to prevent reflexive supply expansion:

```
allowance(wallet) = min(k × √(stakedIntel(wallet)), walletCap, globalCapRemaining)

mintPrice = max(TWAP × (1 + premium), floorPrice) × utilizationMultiplier
```

**`utilizationMultiplier`** measures pending task volume ÷ settled capacity in the current epoch:

- **Hot task market** (high utilization): mint price rises → supply tightens
- **Quiet market** (low utilization): mint price falls → supply can grow to serve real demand

This inverts the reflexive mint loop that has destroyed similar protocols. Demand surge tightens supply; it does not loosen it.

**Bonding curve parameters (broker-side):**

| Parameter | Default | Env var |
|---|---|---|
| Base price | $1.00 USD/INTEL | `TOKEN_BASE_PRICE_USD_PER_INTEL` |
| Target supply | 100,000 INTEL | `TOKEN_TARGET_SUPPLY_INTEL` |
| Curve power | 2 (quadratic) | `TOKEN_ADJUSTMENT_POWER` |

---

## Supply Parameters

| Parameter | Value |
|---|---|
| Hard cap | 100M INTEL |
| Protocol fee | 10% of gross settlement (1000 bps) |
| Staker yield share | 9% of gross settlement (900 bps) |
| Timelock delay (testnet) | 15 minutes |
| Timelock delay (mainnet) | ≥ 24 hours |

---

## Staking and Economic Security

Workers and reviewers post slashable bonds; INTEL stakers earn yield from the settlement flow:

- **Worker bond** (`WorkerStakeManager.sol`): slashed on fraud
- **Reviewer bond** (`ReviewerStakeManager.sol`): slashed if dispute ruling overturned by staker jury
- **INTEL stakers** (`IntelStaking.sol`): earn 9% of every accepted settlement + ETH yield from `IntelMintController` mint fees
- Claim ETH yield via `IntelStaking.claimEthYield()`
- Unbonding: 7-day cooldown before stake is claimable

Staker alignment is with marketplace throughput, not roadmap speculation.

---

## Treasury Policy

Treasury toggles between two modes based on utilization and on-chain liquidity depth:

1. **POL mode**: deploy INTEL + ETH into INTEL/WETH concentrated liquidity (±20% range around spot)
2. **Buyback/burn mode**: market-buy INTEL and burn via `BuybackBurn.sol` (TWAP circuit breaker prevents manipulation)

Policy is rule-based and encoded in contracts, not governance-dependent at launch.

---

## AIU Index (Phase 3)

Every accepted job settlement writes a data point to the AIU (Accepted Intelligence Unit) index:

```
AIU price = total INTEL paid to workers ÷ total accepted jobs
```

**Live endpoints:**
- `GET /v1/cannes/aiu/index` — current index: `aiuPriceIntel`, `totalAcceptedJobs`, `weeklyVolume`, `acceptanceRate`
- `GET /v1/cannes/aiu/history` — time series of snapshots, one saved per acceptance

The AIU index is the market-discovered price of one unit of verified AI work output. With 6+ months of history it can underpin AIU perpetual futures, letting AI-heavy teams hedge rising agent costs the same way an airline hedges jet fuel.

---

## Key Contracts

| Contract | Function |
|---|---|
| `IntelToken.sol` | ERC-20, 100M cap, burn, pause, Ownable2Step |
| `IntelMintController.sol` | TWAP-gated mint, utilization multiplier, anti-reflexivity brake |
| `IntelStaking.sol` | Stake/unstake, ETH yield accumulator, reentrancy-guarded |
| `IntelTimelockController.sol` | OpenZeppelin timelock (15 min testnet / 48h mainnet) |
| `BuybackBurn.sol` | Treasury buyback/burn, TWAP circuit breaker |
| `EpochRewardDistributor.sol` | Per-epoch performance bonuses, per-wallet cap prevents gaming |
| `WorkerStakeManager.sol` | Worker bond staking with slashing on fraud |
| `ReviewerStakeManager.sol` | Reviewer bond + fee share, slash on overturned dispute |

---

## References

- Smart contracts: `packages/intelligence-exchange-cannes-contracts/src/`
- Launch architecture: `spec/tokenomics/INTEL_LAUNCH_ARCHITECTURE.md`
- Coverage matrix: `spec/tokenomics/TOKENOMICS_COVERAGE_MATRIX.md`
- Governance path: `docs/governance.md`
