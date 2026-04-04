#!/usr/bin/env bun
/**
 * iex-bridge — Worker CLI for the Intelligence Exchange.
 *
 * Claim and submit calls are authenticated with wallet-signed challenges.
 * The authorized agent fingerprint is derived from the same packed tuple used on-chain:
 *   keccak256(abi.encodePacked(agentType, agentVersion, operatorAddress))
 *
 * Usage:
 *   iex-bridge claim --job-id <id> --agent-type claude-code
 *   iex-bridge submit --job-id <id> --claim-id <id> --artifact <uri> --summary "..."
 *   iex-bridge list
 *   iex-bridge status --job-id <id>
 */

import { program } from 'commander';
import { encodePacked, keccak256 } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const BROKER_URL = process.env.BROKER_URL ?? 'http://localhost:3001';
const WORKER_PRIVATE_KEY = process.env.WORKER_PRIVATE_KEY as `0x${string}` | undefined;

async function brokerPost(path: string, body: unknown) {
  const res = await fetch(`${BROKER_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json() as unknown;
  if (!res.ok) {
    const err = (data as { error?: { message?: string } }).error;
    throw new Error(err?.message ?? `HTTP ${res.status}`);
  }
  return data;
}

async function brokerGet(path: string) {
  const res = await fetch(`${BROKER_URL}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} on GET ${path}`);
  return res.json() as Promise<unknown>;
}

export function getOperatorAccount(privateKeyOverride?: string) {
  const privateKey = (privateKeyOverride ?? WORKER_PRIVATE_KEY) as `0x${string}` | undefined;
  if (!privateKey) {
    throw new Error('Worker private key required. Set WORKER_PRIVATE_KEY or pass --private-key.');
  }
  return privateKeyToAccount(privateKey);
}

export function computeAgentFingerprint(agentType: string, agentVersion: string, accountAddress: string) {
  return keccak256(encodePacked(
    ['string', 'string', 'address'],
    [agentType, agentVersion, accountAddress.toLowerCase() as `0x${string}`],
  ));
}

export async function createSignedAction(input: {
  accountAddress: string;
  purpose: 'worker_claim' | 'worker_submit';
  agentFingerprint: string;
  jobId: string;
  privateKey?: string;
}) {
  const challenge = await brokerPost('/v1/cannes/auth/challenge', {
    accountAddress: input.accountAddress,
    purpose: input.purpose,
    agentFingerprint: input.agentFingerprint,
    jobId: input.jobId,
  }) as {
    challengeId: string;
    message: string;
  };

  const operator = getOperatorAccount(input.privateKey);
  const signature = await operator.signMessage({ message: challenge.message });

  return {
    accountAddress: input.accountAddress,
    agentFingerprint: input.agentFingerprint,
    challengeId: challenge.challengeId,
    signature,
  };
}

program
  .name('iex-bridge')
  .description('Intelligence Exchange worker bridge — claim and submit milestone jobs')
  .version('0.2.0');

program
  .command('list')
  .description('List available jobs')
  .option('--status <status>', 'Filter by status', 'queued')
  .action(async (opts) => {
    const data = await brokerGet(`/v1/cannes/jobs?status=${opts.status}`) as { jobs: unknown[]; count: number };
    if (data.jobs.length === 0) {
      console.log('No jobs available.');
      return;
    }
    console.log(`\n${data.count} job(s) available:\n`);
    for (const job of data.jobs as Array<{ jobId: string; milestoneType: string; budgetUsd: string; status: string }>) {
      console.log(`  ${job.jobId}  type=${job.milestoneType}  budget=$${job.budgetUsd}  status=${job.status}`);
    }
  });

program
  .command('status')
  .description('Get job status')
  .requiredOption('--job-id <id>', 'Job ID')
  .action(async (opts) => {
    const data = await brokerGet(`/v1/cannes/jobs/${opts.jobId}`) as { job: unknown };
    console.log(JSON.stringify(data.job, null, 2));
  });

program
  .command('claim')
  .description('Claim a job and download its skill.md task file')
  .requiredOption('--job-id <id>', 'Job ID to claim')
  .option('--agent-type <type>', 'Authorized agent type', 'claude-code')
  .option('--agent-version <ver>', 'Authorized agent version', '1.0.0')
  .option('--agent-fingerprint <fp>', 'Authorized agent fingerprint override')
  .option('--private-key <key>', 'Operator wallet private key override')
  .action(async (opts) => {
    const operator = getOperatorAccount(opts.privateKey);
    const agentFingerprint = opts.agentFingerprint ?? computeAgentFingerprint(
      opts.agentType,
      opts.agentVersion,
      operator.address,
    );

    console.log(`\nClaiming job ${opts.jobId} for operator ${operator.address}...`);

    const signedAction = await createSignedAction({
      accountAddress: operator.address,
      purpose: 'worker_claim',
      agentFingerprint,
      jobId: opts.jobId,
      privateKey: opts.privateKey,
    });

    const claimRes = await brokerPost(`/v1/cannes/jobs/${opts.jobId}/claim`, {
      signedAction,
    }) as { claimId: string; expiresAt: string; skillMdUrl: string };

    console.log('✓ Claimed!');
    console.log(`  Claim ID:   ${claimRes.claimId}`);
    console.log(`  Expires:    ${claimRes.expiresAt}`);
    console.log(`  Skill URL:  ${BROKER_URL}${claimRes.skillMdUrl}`);

    const skillRes = await fetch(`${BROKER_URL}${claimRes.skillMdUrl}`);
    const skillMd = await skillRes.text();

    console.log('\n' + '─'.repeat(60));
    console.log('SKILL.MD (your task):');
    console.log('─'.repeat(60));
    console.log(skillMd);
    console.log('─'.repeat(60));
    console.log('\nAfter completing the task, submit with:');
    console.log(`  iex-bridge submit --job-id ${opts.jobId} --claim-id ${claimRes.claimId} --artifact <uri> --summary "..." --agent-type ${opts.agentType}`);
  });

program
  .command('submit')
  .description('Submit job result after execution')
  .requiredOption('--job-id <id>', 'Job ID')
  .requiredOption('--claim-id <id>', 'Claim ID')
  .requiredOption('--artifact <uri>', 'Artifact URI')
  .option('--summary <text>', 'Summary of what you built', '')
  .option('--agent-type <type>', 'Authorized agent type', 'claude-code')
  .option('--agent-version <ver>', 'Authorized agent version', '1.0.0')
  .option('--agent-fingerprint <fp>', 'Authorized agent fingerprint override')
  .option('--private-key <key>', 'Operator wallet private key override')
  .option('--trace-uri <uri>', 'Execution trace URI')
  .option('--status <status>', 'Completion status', 'completed')
  .action(async (opts) => {
    const operator = getOperatorAccount(opts.privateKey);
    const agentFingerprint = opts.agentFingerprint ?? computeAgentFingerprint(
      opts.agentType,
      opts.agentVersion,
      operator.address,
    );

    console.log(`\nSubmitting job ${opts.jobId}...`);

    const signedAction = await createSignedAction({
      accountAddress: operator.address,
      purpose: 'worker_submit',
      agentFingerprint,
      jobId: opts.jobId,
      privateKey: opts.privateKey,
    });

    const result = await brokerPost(`/v1/cannes/jobs/${opts.jobId}/submit`, {
      signedAction,
      claimId: opts.claimId,
      status: opts.status,
      artifactUris: [opts.artifact],
      summary: opts.summary,
      traceUri: opts.traceUri,
    }) as {
      submissionId: string;
      scoreBreakdown: {
        scoreStatus: string;
        totalScore: number;
        checks: Array<{ name: string; passed: boolean; detail?: string }>;
      };
    };

    console.log('\n✓ Submitted!');
    console.log(`  Submission ID:  ${result.submissionId}`);
    console.log(`  Score status:   ${result.scoreBreakdown.scoreStatus}`);
    console.log(`  Total score:    ${result.scoreBreakdown.totalScore}/100`);

    if (result.scoreBreakdown.scoreStatus === 'passed') {
      console.log('\n✓ Output accepted! Awaiting authenticated human review and attestation sync.');
    } else {
      console.log('\n⚠ Output routed to rework. Issues:');
      for (const check of result.scoreBreakdown.checks.filter((c) => !c.passed)) {
        console.log(`  - ${check.name}: ${check.detail}`);
      }
    }
  });

if (import.meta.main) {
  program.parse();
}
