import type { FeePolicy, MintQuote, PoolState, SettlementSplit } from './types';

function round(value: number, decimals = 8) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function clampPositive(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function getCurvePriceUsdPerIxp(state: PoolState) {
  const basePrice = clampPositive(state.basePriceUsdPerIxp, 1);
  const targetSupply = clampPositive(state.targetSupplyIxp, 1);
  const adjustmentPower = Number.isFinite(state.adjustmentPower) ? state.adjustmentPower : 0;
  const currentSupply = Math.max(0, state.currentSupplyIxp);

  const utilization = currentSupply / targetSupply;
  const curveMultiplier = Math.exp(adjustmentPower * Math.pow(utilization, 3));
  return round(basePrice * curveMultiplier, 8);
}

export function quoteMintIxp(stableAmountUsd: number, state: PoolState): MintQuote {
  const stableUsd = clampPositive(stableAmountUsd, 0);
  if (stableUsd <= 0) {
    return {
      stableAmountUsd: 0,
      effectivePriceUsdPerIxp: getCurvePriceUsdPerIxp(state),
      mintedIxp: 0,
      nextPriceUsdPerIxp: getCurvePriceUsdPerIxp(state),
      nextSupplyIxp: round(state.currentSupplyIxp, 8),
    };
  }

  const curvePrice = getCurvePriceUsdPerIxp(state);
  const liquidityDepthUsd = clampPositive(state.liquidityDepthUsd, 1_000);
  const slippageBps = Math.max(0, state.slippageBps);
  const slippageMultiplier = 1 + ((stableUsd / liquidityDepthUsd) * (slippageBps / 10_000));
  const effectivePrice = curvePrice * slippageMultiplier;

  const mintedIxp = stableUsd / effectivePrice;
  const nextSupplyIxp = state.currentSupplyIxp + mintedIxp;
  const nextPriceUsdPerIxp = getCurvePriceUsdPerIxp({
    ...state,
    currentSupplyIxp: nextSupplyIxp,
  });

  return {
    stableAmountUsd: round(stableUsd, 6),
    effectivePriceUsdPerIxp: round(effectivePrice, 8),
    mintedIxp: round(mintedIxp, 8),
    nextPriceUsdPerIxp: round(nextPriceUsdPerIxp, 8),
    nextSupplyIxp: round(nextSupplyIxp, 8),
  };
}

export function splitSettlementIxp(grossIxp: number, policy: FeePolicy): SettlementSplit {
  const gross = clampPositive(grossIxp, 0);
  const protocolFeeBps = Math.min(10_000, Math.max(0, policy.protocolFeeBps));

  const protocolFeeIxp = gross * (protocolFeeBps / 10_000);
  const workerPayoutIxp = gross - protocolFeeIxp;

  return {
    grossIxp: round(gross, 8),
    workerPayoutIxp: round(workerPayoutIxp, 8),
    protocolFeeIxp: round(protocolFeeIxp, 8),
  };
}
