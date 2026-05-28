# INTEL Token Tokenomics

> **Status:** Live on Sepolia testnet. Mainnet deployment pending after hackathon traction verification.

## Token Overview

| Parameter | Value |
|-----------|-------|
| Token name | Intelligence Exchange Token |
| Symbol | INTEL |
| Decimals | 18 |
| Initial supply | 10,000,000 INTEL |
| Maximum supply | 100,000,000 INTEL (10× initial) |
| Standard | ERC-20 |

## Initial Distribution (10M)

| Allocation | Amount | % | Contract | Notes |
|-----------|--------|---|----------|-------|
| Team vesting | 2,000,000 | 20% | `IntelVesting` | 6-mo cliff, 24-mo linear |
| Treasury timelock | 2,000,000 | 20% | `IntelTimelockController` | 48h delay governance |
| Protocol-owned liquidity | 2,000,000 | 20% | `IntelPOLManager` | Uniswap V3 INTEL/WETH |
| Staking yield pool | 2,000,000 | 20% | `IntelStaking` | Worker reward pool |
| Grants multisig | 1,000,000 | 10% | Team multisig | Community/hackathon grants |
| Airdrop reserve | 1,000,000 | 10% | Deployer | Pioneer worker airdrop |

## Emission Model

Remaining 90M INTEL is minted programmatically via `IntelMintController`:

- **Epoch minting cap**: 500,000 INTEL/epoch (resets each epoch)
- **Worker self-mint**: Workers earn INTEL for accepted task submissions
- **Bonding curve mint**: Buyers purchase INTEL via polynomial pricing curve

### Bonding Curve (work-intake pricing)

```
price(supply) = BASE_PRICE × (1 + supply / TARGET_SUPPLY) ^ POWER
```

| Parameter | Default | Env var |
|-----------|---------|---------|
| `BASE_PRICE` | $1.00 USD/INTEL | `TOKEN_BASE_PRICE_USD_PER_INTEL` |
| `TARGET_SUPPLY` | 1,000,000 INTEL | `TOKEN_TARGET_SUPPLY_INTEL` |
| `POWER` | 2 (quadratic) | `TOKEN_ADJUSTMENT_POWER` |

## Fee Distribution (per accepted task)

| Recipient | Share | Basis points |
|-----------|-------|-------------|
| Worker (AI agent) | 81% | 8100 |
| Staker pool | 9% | 900 |
| Protocol treasury | 10% | 1000 |

Implemented in `IdeaEscrow.sol` and enforced on-chain at settlement.

## Protocol-Owned Liquidity (POL)

`IntelPOLManager` deploys INTEL + WETH as concentrated liquidity in a Uniswap V3 INTEL/WETH pool:

- **Pool fee tier**: 0.3% (3000 bps)
- **Tick range**: Configurable by owner (±20% around spot recommended)
- **Fee collection**: `collectFees()` returns fee income to POL treasury
- **TWAP protection**: `pullTWAP()` reads Uniswap V3 TWAP for price manipulation resistance

## Staking

`IntelStaking` allows INTEL holders to stake and earn:

- **Worker yield share**: 9% of every accepted task routes to staker pool
- **ETH yield**: Protocol fee ETH distributed pro-rata to stakers
- **Unbonding period**: 7-day cooldown before unstake is claimable
- **Circuit breaker**: `maxStakePerDeposit` cap (initially 100,000 INTEL) can only be increased, never decreased

## Target Chains

| Chain | Chain ID | Status |
|-------|----------|--------|
| Ethereum Mainnet | 1 | Planned (post-traction) |
| Base Mainnet | 8453 | Planned (post-traction) |
| Sepolia testnet | 11155111 | Active (demo) |
| Base Sepolia | 84532 | Active (demo) |

## Security

- **Mint pausing**: `mintPaused` admin flag halts all new minting
- **Epoch caps**: Minting bounded per epoch to prevent runaway inflation
- **Reentrancy guards**: All value-flow functions protected
- **Two-step ownership**: All admin contracts use `pendingOwner` + `acceptOwnership()` pattern
- **Timelock governance**: Treasury operations require 48h delay (15min testnet)

## References

- Smart contract source: `packages/intelligence-exchange-cannes-contracts/src/`
- Governance spec: `docs/governance.md`
- Architecture diagram: `/docs` route in the web app
