import type { FeePolicy, MintQuote, PoolState, SettlementSplit } from './types';

function round(value: number, decimals = 8) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function clampPositive(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function getCurvePriceUsdPerIntel(state: PoolState) {
  const basePrice = clampPositive(state.basePriceUsdPerIntel, 1);
  const targetSupply = clampPositive(state.targetSupplyIntel, 1);
  const adjustmentPower = Number.isFinite(state.adjustmentPower) ? state.adjustmentPower : 0;
  const currentSupply = Math.max(0, state.currentSupplyIntel);

  const utilization = currentSupply / targetSupply;
  const curveMultiplier = Math.exp(adjustmentPower * Math.pow(utilization, 3));
  return round(basePrice * curveMultiplier, 8);
}

export function quoteMintIntel(stableAmountUsd: number, state: PoolState): MintQuote {
  const stableUsd = clampPositive(stableAmountUsd, 0);
  if (stableUsd <= 0) {
    return {
      stableAmountUsd: 0,
      effectivePriceUsdPerIntel: getCurvePriceUsdPerIntel(state),
      mintedIntel: 0,
      nextPriceUsdPerIntel: getCurvePriceUsdPerIntel(state),
      nextSupplyIntel: round(state.currentSupplyIntel, 8),
    };
  }

  const curvePrice = getCurvePriceUsdPerIntel(state);
  const liquidityDepthUsd = clampPositive(state.liquidityDepthUsd, 1_000);
  const slippageBps = Math.max(0, state.slippageBps);
  const slippageMultiplier = 1 + ((stableUsd / liquidityDepthUsd) * (slippageBps / 10_000));
  const effectivePrice = curvePrice * slippageMultiplier;

  const mintedIntel = stableUsd / effectivePrice;
  const nextSupplyIntel = state.currentSupplyIntel + mintedIntel;
  const nextPriceUsdPerIntel = getCurvePriceUsdPerIntel({
    ...state,
    currentSupplyIntel: nextSupplyIntel,
  });

  return {
    stableAmountUsd: round(stableUsd, 6),
    effectivePriceUsdPerIntel: round(effectivePrice, 8),
    mintedIntel: round(mintedIntel, 8),
    nextPriceUsdPerIntel: round(nextPriceUsdPerIntel, 8),
    nextSupplyIntel: round(nextSupplyIntel, 8),
  };
}

export function splitSettlementIntel(grossIntel: number, policy: FeePolicy): SettlementSplit {
  const gross = clampPositive(grossIntel, 0);
  const protocolFeeBps = Math.min(10_000, Math.max(0, policy.protocolFeeBps));
  const stakerYieldBps = Math.min(10_000, Math.max(0, policy.stakerYieldBps ?? 900));

  if (protocolFeeBps + stakerYieldBps > 10_000) {
    throw new Error(
      `FeePolicy overflow: protocolFeeBps (${protocolFeeBps}) + stakerYieldBps (${stakerYieldBps}) exceeds 10_000`,
    );
  }

  const protocolFeeIntel = gross * (protocolFeeBps / 10_000);
  const stakerYieldIntel = gross * (stakerYieldBps / 10_000);
  const workerPayoutIntel = gross - protocolFeeIntel - stakerYieldIntel;

  return {
    grossIntel: round(gross, 8),
    workerPayoutIntel: round(workerPayoutIntel, 8),
    stakerYieldIntel: round(stakerYieldIntel, 8),
    protocolFeeIntel: round(protocolFeeIntel, 8),
  };
}
