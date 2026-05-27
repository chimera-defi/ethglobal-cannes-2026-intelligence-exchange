export type PoolPricingConfig = {
  basePriceUsdPerIntel: number;
  targetSupplyIntel: number;
  adjustmentPower: number;
  liquidityDepthUsd: number;
  slippageBps: number;
};

export type PoolState = PoolPricingConfig & {
  currentSupplyIntel: number;
};

export type MintQuote = {
  stableAmountUsd: number;
  effectivePriceUsdPerIntel: number;
  mintedIntel: number;
  nextPriceUsdPerIntel: number;
  nextSupplyIntel: number;
};

export type FeePolicy = {
  protocolFeeBps: number;
};

export type SettlementSplit = {
  grossIntel: number;
  workerPayoutIntel: number;
  protocolFeeIntel: number;
};
