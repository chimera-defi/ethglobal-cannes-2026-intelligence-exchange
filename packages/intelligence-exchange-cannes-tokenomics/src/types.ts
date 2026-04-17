export type PoolPricingConfig = {
  basePriceUsdPerIxp: number;
  targetSupplyIxp: number;
  adjustmentPower: number;
  liquidityDepthUsd: number;
  slippageBps: number;
};

export type PoolState = PoolPricingConfig & {
  currentSupplyIxp: number;
};

export type MintQuote = {
  stableAmountUsd: number;
  effectivePriceUsdPerIxp: number;
  mintedIxp: number;
  nextPriceUsdPerIxp: number;
  nextSupplyIxp: number;
};

export type FeePolicy = {
  protocolFeeBps: number;
};

export type SettlementSplit = {
  grossIxp: number;
  workerPayoutIxp: number;
  protocolFeeIxp: number;
};
