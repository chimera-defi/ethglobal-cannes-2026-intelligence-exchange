/**
 * Demo seed script — populates Postgres with a deterministic demo idea + jobs.
 * Usage: bun run src/scripts/seed.ts
 * Requires: DATABASE_URL env var pointing to a running Postgres instance.
 */

import { migrate } from '../db/migrate';
import { db } from '../db/client';
import { agentIdentities, ideas, jobs } from '../db/schema';
import { eq } from 'drizzle-orm';
import { generateBrief } from '../services/jobService';
import { syncMilestoneReservation } from '../services/chainService';
import {
  DEMO_IDEA_ID,
  DEMO_BUYER_ID,
} from 'intelligence-exchange-cannes-shared';

async function seed() {
  console.log('── IEX Cannes 2026 Demo Seed ──');

  // 1. Ensure schema is current
  await migrate();
  console.log('✓ Schema migrated');

  // 2. Check if demo idea already exists
  const existing = await db.select({ ideaId: ideas.ideaId })
    .from(ideas)
    .where(eq(ideas.ideaId, DEMO_IDEA_ID));

  let briefId: string;
  if (existing.length > 0) {
    console.log(`ℹ Demo idea already exists: ${DEMO_IDEA_ID} — skipping insert`);
  } else {
    // 3. Insert demo idea directly with deterministic ID
    const now = new Date();
    await db.insert(ideas).values({
      ideaId: DEMO_IDEA_ID,
      posterId: DEMO_BUYER_ID,
      title: 'Build a DeFi yield optimizer for Uniswap v4',
      prompt: 'Create an ERC-20 compliant vault that:\n1. Accepts USDC deposits\n2. Automatically routes to the highest-yield Uniswap v4 pools\n3. Implements stake(), unstake(), claimRewards()\n4. Has Foundry tests with ≥80% coverage\n\nAcceptance criteria: all tests pass, gas under 150k per transaction.',
      budgetUsd: '15.00',
      fundingStatus: 'unfunded',
      worldIdNullifierHash: '0xdemo-nullifier-cannes-2026',
      createdAt: now,
      updatedAt: now,
    });
    console.log(`✓ Demo idea inserted: ${DEMO_IDEA_ID}`);

    // 4. Mark funded (simulate Arc escrow tx)
    await db.update(ideas)
      .set({
        fundingStatus: 'funded',
        escrowTxHash: '0x' + 'a'.repeat(64),
        updatedAt: new Date(),
      })
      .where(eq(ideas.ideaId, DEMO_IDEA_ID));
    console.log('✓ Demo idea funded (demo escrow tx)');
  }

  // 5. Generate brief + milestone jobs
  briefId = await generateBrief(DEMO_IDEA_ID, DEMO_BUYER_ID);
  console.log(`✓ Brief generated: ${briefId}`);

  const demoJobs = await db.select({
    jobId: jobs.jobId,
    status: jobs.status,
  }).from(jobs).where(eq(jobs.ideaId, DEMO_IDEA_ID));

  const claimableSeedJobs = demoJobs.filter(job => job.status === 'created').map(job => job.jobId);
  if (claimableSeedJobs.length > 0) {
    await syncMilestoneReservation({
      eventType: 'milestone_reserved',
      txHash: `0x${briefId.replace(/-/g, '').padEnd(64, 'd').slice(0, 64)}`,
      subjectId: DEMO_IDEA_ID,
      payload: { jobIds: claimableSeedJobs },
      status: 'confirmed',
    });
    console.log(`✓ ${claimableSeedJobs.length} demo jobs queued and claimable`);
  } else {
    console.log('ℹ Demo jobs already claimable or in progress');
  }

  // 6. Seed demo agent identities
  const demoAgents = [
    {
      fingerprint: '0xagent77fingerprint0000000000000000000000000000000000000000000000',
      agentType: 'claude-code',
      agentVersion: '1.0.0',
      operatorAddress: '0xDEMO000000000000000000000000000000000077',
      acceptedCount: 7,
      avgScore: '92.00',
    },
    {
      fingerprint: '0xagent88fingerprint0000000000000000000000000000000000000000000000',
      agentType: 'codex',
      agentVersion: '2.0.0',
      operatorAddress: '0xDEMO000000000000000000000000000000000088',
      acceptedCount: 3,
      avgScore: '87.00',
    },
  ];

  for (const agent of demoAgents) {
    const exists = await db.select({ fingerprint: agentIdentities.fingerprint })
      .from(agentIdentities)
      .where(eq(agentIdentities.fingerprint, agent.fingerprint));

    if (exists.length === 0) {
      await db.insert(agentIdentities).values({
        ...agent,
        createdAt: new Date(),
      });
      console.log(`✓ Agent seeded: ${agent.agentType} (${agent.fingerprint.slice(0, 12)}...)`);
    } else {
      console.log(`ℹ Agent already exists: ${agent.fingerprint.slice(0, 12)}...`);
    }
  }

  console.log('\n── Seed Complete ──');
  console.log(`Demo idea: ${DEMO_IDEA_ID}`);
  console.log('Run: bun dev  →  open http://localhost:3000/submit');
  process.exit(0);
}

seed().catch((err) => {
  console.error('[seed:error]', err);
  process.exit(1);
});
