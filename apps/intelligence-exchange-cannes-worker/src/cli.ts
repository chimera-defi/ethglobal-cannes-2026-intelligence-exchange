#!/usr/bin/env bun
/**
 * iex-bridge — Agent bridge CLI for the Intelligence Exchange.
 *
 * Any AI agent (Claude Code, Codex, custom) can use this to:
 *   1. claim a job (get the skill.md task file)
 *   2. submit the result (with artifact URI + agent metadata)
 *
 * The platform is model-agnostic. The agent uses whatever model it has.
 * Accepted submissions update the broker-side agent fingerprint + reputation mirror.
 *
 * Usage:
 *   iex-bridge claim --job-id <id>
 *   iex-bridge submit --job-id <id> --artifact <uri> --summary "..." --agent-type claude-code
 *   iex-bridge list
 *   iex-bridge status --job-id <id>
 */

import { program } from 'commander';
import { z } from 'zod';

const BROKER_URL = process.env.BROKER_URL ?? 'http://localhost:3001';
const WORKER_ID = process.env.WORKER_ID ?? `agent-${Math.random().toString(36).slice(2, 8)}`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Commands ────────────────────────────────────────────────────────────────

program
  .name('iex-bridge')
  .description('Intelligence Exchange agent bridge — claim and submit milestone jobs')
  .version('0.1.0');

// list — show available jobs
program
  .command('list')
  .description('List available (queued) jobs')
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
    console.log(`\nTo claim: iex-bridge claim --job-id <id>`);
  });

// status — get job details
program
  .command('status')
  .description('Get job status')
  .requiredOption('--job-id <id>', 'Job ID')
  .action(async (opts) => {
    const data = await brokerGet(`/v1/cannes/jobs/${opts.jobId}`) as { job: unknown };
    console.log(JSON.stringify(data.job, null, 2));
  });

// claim — claim a job and get its skill.md
program
  .command('claim')
  .description('Claim a job and download its skill.md task file')
  .requiredOption('--job-id <id>', 'Job ID to claim')
  .option('--worker-id <id>', 'Worker/agent ID', WORKER_ID)
  .option('--agent-type <type>', 'Agent type (claude-code, codex, custom)', 'claude-code')
  .option('--agent-version <ver>', 'Agent version', '1.0.0')
  .option('--operator-address <addr>', 'EVM operator address (optional)')
  .action(async (opts) => {
    console.log(`\nClaiming job ${opts.jobId} for worker ${opts.workerId}...`);

    const claimRes = await brokerPost(`/v1/cannes/jobs/${opts.jobId}/claim`, {
      workerId: opts.workerId,
      agentMetadata: {
        agentType: opts.agentType,
        agentVersion: opts.agentVersion,
        operatorAddress: opts.operatorAddress,
      },
    }) as { claimId: string; expiresAt: string; skillMdUrl: string };

    console.log(`✓ Claimed!`);
    console.log(`  Claim ID:   ${claimRes.claimId}`);
    console.log(`  Expires:    ${claimRes.expiresAt}`);
    console.log(`  Skill URL:  ${BROKER_URL}${claimRes.skillMdUrl}`);

    // Fetch and print the skill.md
    const skillRes = await fetch(`${BROKER_URL}${claimRes.skillMdUrl}`);
    const skillMd = await skillRes.text();

    console.log('\n' + '─'.repeat(60));
    console.log('SKILL.MD (your task):');
    console.log('─'.repeat(60));
    console.log(skillMd);
    console.log('─'.repeat(60));
    console.log(`\nAfter completing the task, submit with:`);
    console.log(`  iex-bridge submit --job-id ${opts.jobId} --claim-id ${claimRes.claimId} --artifact <uri> --summary "..." --worker-id ${opts.workerId}`);
  });

// submit — submit job result
program
  .command('submit')
  .description('Submit job result after execution')
  .requiredOption('--job-id <id>', 'Job ID')
  .requiredOption('--claim-id <id>', 'Claim ID (from claim command)')
  .requiredOption('--artifact <uri>', 'Artifact URI (URL to your output)')
  .option('--worker-id <id>', 'Worker/agent ID', WORKER_ID)
  .option('--summary <text>', 'Summary of what you built', '')
  .option('--agent-type <type>', 'Agent type', 'claude-code')
  .option('--agent-version <ver>', 'Agent version', '1.0.0')
  .option('--operator-address <addr>', 'EVM operator address (optional)')
  .option('--trace-uri <uri>', 'Execution trace URI (optional)')
  .option('--status <status>', 'Completion status', 'completed')
  .action(async (opts) => {
    console.log(`\nSubmitting job ${opts.jobId}...`);

    const result = await brokerPost(`/v1/cannes/jobs/${opts.jobId}/submit`, {
      workerId: opts.workerId,
      claimId: opts.claimId,
      status: opts.status,
      artifactUris: [opts.artifact],
      summary: opts.summary,
      traceUri: opts.traceUri,
      agentMetadata: {
        agentType: opts.agentType,
        agentVersion: opts.agentVersion,
        operatorAddress: opts.operatorAddress,
      },
    }) as { submissionId: string; scoreBreakdown: { scoreStatus: string; totalScore: number; checks: Array<{ name: string; passed: boolean; detail?: string }> } };

    console.log(`\n✓ Submitted!`);
    console.log(`  Submission ID:  ${result.submissionId}`);
    console.log(`  Score status:   ${result.scoreBreakdown.scoreStatus}`);
    console.log(`  Total score:    ${result.scoreBreakdown.totalScore}/100`);

    if (result.scoreBreakdown.scoreStatus === 'passed') {
      console.log('\n✓ Output accepted! Awaiting human review at the Review Panel.');
      console.log('  Your agent fingerprint can now be reflected in the broker reputation mirror after approval.');
    } else {
      console.log('\n⚠ Output routed to rework. Issues:');
      for (const check of result.scoreBreakdown.checks.filter(c => !c.passed)) {
        console.log(`  - ${check.name}: ${check.detail}`);
      }
    }
  });

program.parse();
