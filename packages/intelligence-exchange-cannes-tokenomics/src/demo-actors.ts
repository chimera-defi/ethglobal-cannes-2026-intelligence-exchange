/**
 * INTEL Token Flow — Actor Simulation
 *
 * Demonstrates the 5-actor flow: Buyer, Worker, Reviewer, Staker, Protocol.
 * Uses only engine functions — no external package imports.
 */

import {
  getCurvePriceUsdPerIntel,
  quoteMintIntel,
  splitSettlementIntel,
} from './engine';
import type { FeePolicy, PoolState } from './types';

// ---------------------------------------------------------------------------
// Demo configuration
// ---------------------------------------------------------------------------

const DEMO_POOL: PoolState = {
  basePriceUsdPerIntel: 1.0,
  targetSupplyIntel: 1_000_000,
  currentSupplyIntel: 50_000,
  adjustmentPower: 0.5,
  liquidityDepthUsd: 100_000,
  slippageBps: 30,
};

// FeePolicy only supports protocolFeeBps; stakerYieldBps handled manually below
const DEMO_FEE_POLICY: FeePolicy = { protocolFeeBps: 1000, stakerYieldBps: 900 };


function fmt(n: number, decimals = 2): string {
  return n.toFixed(decimals);
}

function sep(char = '-', width = 60): void {
  console.log(char.repeat(width));
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

sep('=');
console.log('INTEL Token Flow — Actor Simulation');
sep('=');

// ---------------------------------------------------------------------------
// Step 1: BUYER — Alice funds idea with $100 USDC
// ---------------------------------------------------------------------------
const aliceUsd = 100;
const mintQuote = quoteMintIntel(aliceUsd, DEMO_POOL);
const curvePrice = getCurvePriceUsdPerIntel(DEMO_POOL);

console.log('');
console.log('1. [BUYER]   Alice funds idea "Build landing page" with $100 USDC');
console.log(`             → mintIntel($${aliceUsd}) at current curve price`);
console.log(
  `             → INTEL escrowed: ${fmt(mintQuote.mintedIntel, 2)} INTEL` +
    ` (effective price: $${fmt(mintQuote.effectivePriceUsdPerIntel, 4)}/INTEL)`,
);
console.log(`             [curve price: $${fmt(curvePrice, 4)}/INTEL, supply: ${DEMO_POOL.currentSupplyIntel.toLocaleString()} / ${DEMO_POOL.targetSupplyIntel.toLocaleString()}]`);

// Track Alice's escrowed INTEL
const aliceEscrowed = mintQuote.mintedIntel;

// ---------------------------------------------------------------------------
// Step 2: WORKER — Bob claims milestone (budget: $25 equiv)
// ---------------------------------------------------------------------------
// $25 out of $100 → 25% of Alice's escrowed INTEL
const milestoneIntel = aliceEscrowed * 0.25;

console.log('');
console.log('2. [WORKER]  Bob claims milestone "Write hero copy" (budget: $25 equiv)');
console.log(`             → reserve INTEL: ${fmt(milestoneIntel, 2)} INTEL`);

// ---------------------------------------------------------------------------
// Step 3: WORKER — Bob submits artifact
// ---------------------------------------------------------------------------
console.log('');
console.log('3. [WORKER]  Bob submits artifact (hero copy text + trace)');
console.log('             → submission recorded');

// ---------------------------------------------------------------------------
// Step 4: REVIEWER — Carol accepts submission (quality score: 0.92)
// ---------------------------------------------------------------------------
// splitSettlementIntel: protocolFeeBps=1000 → 10% protocol, 90% "worker"
// We then redistribute that 90% as: 81% worker + 9% staker (spec split)
const settlementResult = splitSettlementIntel(milestoneIntel, DEMO_FEE_POLICY);

const stakerYieldIntel = settlementResult.stakerYieldIntel;
const workerPayoutIntel = settlementResult.workerPayoutIntel;

const polTarget = settlementResult.protocolFeeIntel * 0.5; // 5% of gross → 50% of 10% protocol fee

console.log('');
console.log('4. [REVIEWER] Carol accepts submission (quality score: 0.92)');
console.log('             → settleAcceptedMilestone()');
console.log(`             → Worker receives: ${fmt(workerPayoutIntel, 2)} INTEL (81%)`);
console.log(`             → Staker yield: ${fmt(stakerYieldIntel, 2)} INTEL (9%)`);
console.log(`             → Protocol treasury: ${fmt(settlementResult.protocolFeeIntel, 2)} INTEL (10%)`);
console.log(
  `             → Attestation written: agentFingerprint=0xBob, jobId=milestone-1, score=92`,
);

// ---------------------------------------------------------------------------
// Step 5: STAKER — Dave stakes 500 INTEL
// ---------------------------------------------------------------------------
const daveStaked = 500;
const k = 4; // epoch constant
const epochMintAllowance = Math.sqrt(daveStaked) * k;

console.log('');
console.log('5. [STAKER]  Dave stakes 500 INTEL');
console.log(
  `             → Epoch mint allowance: sqrt(${daveStaked}) × k = ${fmt(epochMintAllowance, 2)} INTEL`,
);
console.log(`             → Pending yield from Carol's acceptance: ${fmt(stakerYieldIntel, 2)} INTEL`);

// ---------------------------------------------------------------------------
// Final state summary
// ---------------------------------------------------------------------------
const aliceRemaining = aliceEscrowed - milestoneIntel;

console.log('');
sep('-');
console.log('Final state:');
console.log(
  `  Alice: $${aliceUsd} spent → ${fmt(aliceEscrowed, 2)} INTEL escrowed` +
    ` (${fmt(aliceRemaining, 2)} remaining after milestone)`,
);
console.log(`  Bob: ${fmt(workerPayoutIntel, 2)} INTEL earned (vested immediately in demo)`);
console.log('  Carol: 0 INTEL cost (review is permissioned, not paid in demo)');
console.log(
  `  Dave: ${daveStaked} INTEL staked, ${fmt(stakerYieldIntel, 2)} INTEL yield pending`,
);
console.log(
  `  Protocol: ${fmt(settlementResult.protocolFeeIntel, 2)} INTEL in treasury, ${fmt(polTarget, 2)} INTEL in POL target`,
);
sep('=');
