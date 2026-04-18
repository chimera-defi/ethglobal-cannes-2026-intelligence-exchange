import {
  addLiquidity,
  computeStakeMintAllowance,
  createConstantProductPool,
  distributeIntelToStakers,
  lpPositionReserves,
  removeLiquidity,
  splitMintInflowStable,
  splitTaskSettlementIntel,
  spotPriceStablePerIntel,
  swapIntelForStable,
  swapStableForIntel,
} from '../src/intel';

function printHeader(label: string) {
  console.log(`\n=== ${label} ===`);
}

function printJson(value: unknown) {
  console.log(JSON.stringify(value, null, 2));
}

const stakerBalances = {
  stakerAlpha: 25_000,
  stakerBeta: 75_000,
  stakerGamma: 100_000,
};

printHeader('Task Settlement Split (INTEL)');
const taskSplit = splitTaskSettlementIntel(250);
printJson(taskSplit);

printHeader('Staker Yield Distribution (Task Fees)');
const stakerYieldFromTask = distributeIntelToStakers(taskSplit.stakerIntel, stakerBalances);
printJson(stakerYieldFromTask);

printHeader('Epoch Stake-to-Mint Allowances');
const allowances = Object.fromEntries(
  Object.entries(stakerBalances).map(([account, stakedIntel]) => {
    const allowance = computeStakeMintAllowance({
      stakedIntel,
      k: 4,
      walletCap: 2_000,
      globalCapRemaining: 5_000,
    });
    return [account, allowance];
  }),
);
printJson(allowances);

printHeader('Direct Mint Inflow Routing (Stable)');
const mintSplit = splitMintInflowStable(20_000);
printJson(mintSplit);

printHeader('LP + Holder Market Simulation');
let pool = createConstantProductPool(mintSplit.polStable, mintSplit.polStable, 30);
const protocolLpShares = pool.totalLpShares;
console.log(`Initial pool price stable/INTEL: ${spotPriceStablePerIntel(pool)}`);

const communityAdd = addLiquidity(pool, 5_000, 5_000);
pool = communityAdd.pool;
console.log(`Community LP minted shares: ${communityAdd.mintedLpShares.toFixed(8)}`);

const holderBuy = swapStableForIntel(pool, 3_000);
pool = holderBuy.pool;
console.log(`Holder buy: in 3000 stable -> out ${holderBuy.amountOut.toFixed(8)} INTEL`);

const holderSell = swapIntelForStable(pool, holderBuy.amountOut / 2);
pool = holderSell.pool;
console.log(`Holder sell: in ${(holderBuy.amountOut / 2).toFixed(8)} INTEL -> out ${holderSell.amountOut.toFixed(8)} stable`);
console.log(`Final pool price stable/INTEL: ${spotPriceStablePerIntel(pool)}`);

const protocolPosition = lpPositionReserves(pool, protocolLpShares);
const communityExit = removeLiquidity(pool, communityAdd.mintedLpShares);

printHeader('LP Positions');
printJson({
  protocolPosition,
  communityExit: {
    intelOut: communityExit.intelOut,
    stableOut: communityExit.stableOut,
  },
  poolAfterCommunityExit: {
    reserveIntel: communityExit.pool.reserveIntel,
    reserveStable: communityExit.pool.reserveStable,
  },
});

printHeader('Summary');
printJson({
  taskFeeSplit: '81/9/10',
  mintInflowSplit: '50/45/5',
  actorsCovered: ['worker', 'staker', 'treasury', 'LP', 'holder'],
  note: 'This is an economic simulation harness for local demo/testing.',
});

