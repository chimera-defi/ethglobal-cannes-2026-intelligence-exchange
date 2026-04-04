#!/usr/bin/env bun
/**
 * iex-worker / iex-bridge — Agent bridge CLI for the Intelligence Exchange.
 *
 * Supported flows:
 *   - verify a worker with the broker
 *   - list, inspect, claim, and submit milestone jobs manually
 *   - start a small autonomous loop that scans, claims, executes, and submits
 *
 * The platform stays model-agnostic. The executor command can be Codex,
 * Claude Code, a custom script, or any local workflow that writes `result.json`.
 */

import 'dotenv/config';
import { resolve } from 'node:path';
import { program } from 'commander';
import { MilestoneTypeSchema } from 'intelligence-exchange-cannes-shared';
import { createBrokerClient, DEFAULT_BROKER_URL, formatBudgetUsd } from './runtime/broker';
import { defaultWorkspaceDir, runAutonomousWorker } from './runtime/autonomy';

const BROKER_URL = DEFAULT_BROKER_URL;
const WORKER_ID = process.env.WORKER_ID ?? `agent-${Math.random().toString(36).slice(2, 8)}`;
const DEFAULT_AGENT_TYPE = process.env.AGENT_TYPE ?? 'claude-code';
const DEFAULT_AGENT_VERSION = process.env.AGENT_VERSION ?? '1.0.0';
const INVOCATION_CWD = process.env.INIT_CWD ?? process.cwd();

function buildAgentMetadata(opts: { agentType: string; agentVersion: string; operatorAddress?: string }) {
  return {
    agentType: opts.agentType,
    agentVersion: opts.agentVersion,
    operatorAddress: opts.operatorAddress,
  };
}

function resolveWorkspacePath(pathValue: string): string {
  return resolve(INVOCATION_CWD, pathValue);
}

function normalizeExecutorCommand(command: string): string {
  const trimmed = command.trim();
  if (
    trimmed.startsWith('./') ||
    trimmed.startsWith('../') ||
    trimmed.startsWith('/') ||
    (!trimmed.includes(' ') && trimmed.includes('/'))
  ) {
    return resolve(INVOCATION_CWD, trimmed);
  }

  return command;
}

const client = createBrokerClient(BROKER_URL);

program
  .name('iex-worker')
  .description('Intelligence Exchange worker CLI (`iex-bridge` remains an alias)')
  .version('0.2.0');

program
  .command('verify')
  .description('Register a worker operator as World-verified with the broker')
  .option('--worker-id <id>', 'Worker/agent ID', WORKER_ID)
  .option('--wallet-address <addr>', 'Operator wallet address')
  .action(async (opts) => {
    const result = await client.verifyWorker(opts.workerId, opts.walletAddress);
    console.log(`✓ Worker verified: ${result.subjectId}`);
    console.log(`  Nullifier: ${result.nullifierHash}`);
  });

program
  .command('list')
  .description('List available milestone jobs')
  .option('--status <status>', 'Filter by status', 'queued')
  .action(async (opts) => {
    const jobs = await client.listJobs(opts.status);
    if (jobs.length === 0) {
      console.log('No jobs available.');
      return;
    }

    console.log(`\n${jobs.length} job(s) in status=${opts.status}:\n`);
    for (const job of jobs) {
      console.log(`  ${job.jobId}  type=${job.milestoneType}  budget=$${formatBudgetUsd(job.budgetUsd)}  status=${job.status}`);
    }
    console.log('\nTo claim manually: iex-worker claim --job-id <id>');
  });

program
  .command('status')
  .description('Get job status')
  .requiredOption('--job-id <id>', 'Job ID')
  .action(async (opts) => {
    const job = await client.getJob(opts.jobId);
    console.log(JSON.stringify(job, null, 2));
  });

program
  .command('claim')
  .description('Claim a job and print its skill.md task file')
  .requiredOption('--job-id <id>', 'Job ID to claim')
  .option('--worker-id <id>', 'Worker/agent ID', WORKER_ID)
  .option('--agent-type <type>', 'Agent type (claude-code, codex, custom)', DEFAULT_AGENT_TYPE)
  .option('--agent-version <ver>', 'Agent version', DEFAULT_AGENT_VERSION)
  .option('--operator-address <addr>', 'EVM operator address (optional)')
  .action(async (opts) => {
    console.log(`\nClaiming job ${opts.jobId} for worker ${opts.workerId}...`);

    const claimRes = await client.claimJob(
      opts.jobId,
      opts.workerId,
      buildAgentMetadata(opts),
    );
    const skillMd = await client.fetchSkillMarkdown(claimRes.skillMdUrl);

    console.log('✓ Claimed!');
    console.log(`  Claim ID:   ${claimRes.claimId}`);
    console.log(`  Expires:    ${claimRes.expiresAt}`);
    console.log(`  Skill URL:  ${new URL(claimRes.skillMdUrl, BROKER_URL).toString()}`);
    console.log('\n' + '─'.repeat(60));
    console.log('SKILL.MD (your task):');
    console.log('─'.repeat(60));
    console.log(skillMd);
    console.log('─'.repeat(60));
    console.log('\nAfter completing the task, submit with:');
    console.log(`  iex-worker submit --job-id ${opts.jobId} --claim-id ${claimRes.claimId} --artifact <uri> --summary "..." --worker-id ${opts.workerId}`);
  });

program
  .command('submit')
  .description('Submit job result after execution')
  .requiredOption('--job-id <id>', 'Job ID')
  .requiredOption('--claim-id <id>', 'Claim ID (from claim command)')
  .requiredOption('--artifact <uri>', 'Artifact URI (URL to your output)')
  .option('--worker-id <id>', 'Worker/agent ID', WORKER_ID)
  .option('--summary <text>', 'Summary of what you built', '')
  .option('--agent-type <type>', 'Agent type', DEFAULT_AGENT_TYPE)
  .option('--agent-version <ver>', 'Agent version', DEFAULT_AGENT_VERSION)
  .option('--operator-address <addr>', 'EVM operator address (optional)')
  .option('--trace-uri <uri>', 'Execution trace URI (optional)')
  .option('--status <status>', 'Completion status', 'completed')
  .action(async (opts) => {
    console.log(`\nSubmitting job ${opts.jobId}...`);

    const result = await client.submitJob(opts.jobId, {
      workerId: opts.workerId,
      claimId: opts.claimId,
      status: opts.status,
      artifactUris: [opts.artifact],
      summary: opts.summary,
      traceUri: opts.traceUri,
      agentMetadata: buildAgentMetadata(opts),
    });

    console.log('\n✓ Submitted!');
    console.log(`  Submission ID:  ${result.submissionId}`);
    console.log(`  Score status:   ${result.scoreBreakdown.scoreStatus}`);
    console.log(`  Total score:    ${result.scoreBreakdown.totalScore}/100`);

    if (result.scoreBreakdown.scoreStatus === 'passed') {
      console.log('\n✓ Output accepted by the automatic scorer. Human review still gates payout.');
      return;
    }

    console.log('\nOutput routed to rework. Failed checks:');
    for (const check of result.scoreBreakdown.checks.filter((entry) => !entry.passed)) {
      console.log(`  - ${check.name}: ${check.detail}`);
    }
  });

program
  .command('start')
  .description('Scan queued jobs, claim one that matches local policy, run an executor command, and submit the result')
  .requiredOption('--executor <command>', 'Shell command that writes $IEX_RESULT_PATH')
  .option('--worker-id <id>', 'Worker/agent ID', WORKER_ID)
  .option('--agent-type <type>', 'Agent type', DEFAULT_AGENT_TYPE)
  .option('--agent-version <ver>', 'Agent version', DEFAULT_AGENT_VERSION)
  .option('--operator-address <addr>', 'EVM operator address (optional)')
  .option('--job-id <id>', 'Only target one specific queued job')
  .option('--milestone-type <types>', 'Comma-separated milestone types to accept (brief,tasks,scaffold,review)')
  .option('--max-budget-usd <usd>', 'Maximum job budget to claim', (value) => Number(value))
  .option('--workspace-dir <path>', 'Directory for claimed run folders', defaultWorkspaceDir(INVOCATION_CWD))
  .option('--poll-interval-ms <ms>', 'Polling interval for long-running workers', (value) => Number(value), 15000)
  .option('--once', 'Scan once and exit if no job matches', false)
  .option('--no-submit', 'Execute locally but leave submission to a later manual step')
  .action(async (opts) => {
    const milestoneTypes = opts.milestoneType
      ? String(opts.milestoneType).split(',')
        .map((value) => MilestoneTypeSchema.parse(value.trim()))
      : undefined;

    const outcome = await runAutonomousWorker({
      brokerUrl: BROKER_URL,
      workerId: opts.workerId,
      agentMetadata: buildAgentMetadata(opts),
      executorCommand: normalizeExecutorCommand(opts.executor),
      workspaceDir: resolveWorkspacePath(opts.workspaceDir),
      pollIntervalMs: opts.pollIntervalMs,
      once: opts.once,
      submitResult: opts.submit,
      policy: {
        jobId: opts.jobId,
        milestoneTypes,
        maxBudgetUsd: Number.isFinite(opts.maxBudgetUsd) ? opts.maxBudgetUsd : undefined,
      },
    });

    if (!outcome) {
      console.log('No matching job claimed.');
      return;
    }

    console.log(`Finished job ${outcome.jobId}. Run directory: ${outcome.runDir}`);
  });

program.parseAsync().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
