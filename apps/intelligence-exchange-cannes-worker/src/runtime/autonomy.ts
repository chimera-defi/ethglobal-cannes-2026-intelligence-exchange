import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { z } from 'zod';
import { type AgentMetadata, type MilestoneType } from 'intelligence-exchange-cannes-shared';
import { readExecutionResult, runExecutorCommand } from './executor';
import {
  DEFAULT_BROKER_URL,
  createBrokerClient,
  formatBudgetUsd,
  formatMilestoneFilter,
  type BrokerClaimResponse,
  type BrokerClient,
  type BrokerJob,
  type BrokerSubmissionResponse,
} from './broker';

export interface WorkerRuntimePolicy {
  jobId?: string;
  milestoneTypes?: MilestoneType[];
  maxBudgetUsd?: number;
}

export interface StartWorkerOptions {
  brokerUrl?: string;
  workerId: string;
  agentMetadata: AgentMetadata;
  executorCommand: string;
  workspaceDir: string;
  pollIntervalMs: number;
  once: boolean;
  submitResult: boolean;
  policy: WorkerRuntimePolicy;
}

export interface AutonomousRunOutcome {
  jobId: string;
  claimId: string;
  runDir: string;
  submitted: boolean;
  submission?: BrokerSubmissionResponse;
}

const StartWorkerOptionsSchema = z.object({
  brokerUrl: z.string().url().default(DEFAULT_BROKER_URL),
  workerId: z.string().min(1),
  agentMetadata: z.object({
    agentType: z.string().min(1),
    agentVersion: z.string().optional(),
    operatorAddress: z.string().optional(),
  }),
  executorCommand: z.string().min(1),
  workspaceDir: z.string().min(1),
  pollIntervalMs: z.number().int().positive(),
  once: z.boolean(),
  submitResult: z.boolean(),
  policy: z.object({
    jobId: z.string().uuid().optional(),
    milestoneTypes: z.array(z.enum(['brief', 'tasks', 'scaffold', 'review'])).optional(),
    maxBudgetUsd: z.number().positive().optional(),
  }),
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function summarizeJob(job: BrokerJob): string {
  return `${job.jobId} type=${job.milestoneType} budget=$${formatBudgetUsd(job.budgetUsd)} status=${job.status}`;
}

export function pickNextJob(jobs: BrokerJob[], policy: WorkerRuntimePolicy): BrokerJob | null {
  if (policy.jobId) {
    const directMatch = jobs.find((job) => job.jobId === policy.jobId && job.status === 'queued');
    return directMatch ?? null;
  }

  return jobs.find((job) => {
    if (job.status !== 'queued') {
      return false;
    }

    if (policy.milestoneTypes && !policy.milestoneTypes.includes(job.milestoneType)) {
      return false;
    }

    if (typeof policy.maxBudgetUsd === 'number' && job.budgetUsd > policy.maxBudgetUsd) {
      return false;
    }

    return true;
  }) ?? null;
}

async function createRunDirectory(workspaceDir: string, jobId: string): Promise<string> {
  const rootDir = resolve(workspaceDir);
  await mkdir(rootDir, { recursive: true });
  return mkdtemp(join(rootDir, `${jobId.slice(0, 8)}-`));
}

async function prepareRunDirectory(
  runDir: string,
  job: BrokerJob,
  claim: BrokerClaimResponse,
  skillMd: string,
): Promise<{ resultPath: string }> {
  const resultPath = join(runDir, 'result.json');

  await Promise.all([
    writeFile(join(runDir, 'job.json'), `${JSON.stringify(job, null, 2)}\n`, 'utf8'),
    writeFile(join(runDir, 'claim.json'), `${JSON.stringify(claim, null, 2)}\n`, 'utf8'),
    writeFile(join(runDir, 'skill.md'), skillMd, 'utf8'),
  ]);

  return { resultPath };
}

async function executeClaimedJob(
  client: BrokerClient,
  job: BrokerJob,
  claim: BrokerClaimResponse,
  options: z.infer<typeof StartWorkerOptionsSchema>,
): Promise<AutonomousRunOutcome> {
  const skillMd = await client.fetchSkillMarkdown(claim.skillMdUrl);
  const runDir = await createRunDirectory(options.workspaceDir, job.jobId);
  const { resultPath } = await prepareRunDirectory(runDir, job, claim, skillMd);

  console.log(`Claimed ${summarizeJob(job)}`);
  console.log(`Run directory: ${runDir}`);
  console.log(`Executor command: ${options.executorCommand}`);

  await runExecutorCommand(options.executorCommand, runDir, {
    IEX_BROKER_URL: client.brokerUrl,
    IEX_JOB_ID: job.jobId,
    IEX_CLAIM_ID: claim.claimId,
    IEX_WORKER_ID: options.workerId,
    IEX_MILESTONE_TYPE: job.milestoneType,
    IEX_RUN_DIR: runDir,
    IEX_RESULT_PATH: resultPath,
    IEX_SKILL_PATH: join(runDir, 'skill.md'),
    IEX_JOB_PATH: join(runDir, 'job.json'),
    IEX_CLAIM_PATH: join(runDir, 'claim.json'),
  });

  if (!options.submitResult) {
    console.log(`Executor finished. Submission skipped by --no-submit. Result file: ${resultPath}`);
    return {
      jobId: job.jobId,
      claimId: claim.claimId,
      runDir,
      submitted: false,
    };
  }

  const executionResult = await readExecutionResult(resultPath, runDir);
  const submission = await client.submitJob(job.jobId, {
    workerId: options.workerId,
    claimId: claim.claimId,
    status: executionResult.status,
    artifactUris: executionResult.artifactUris,
    summary: executionResult.summary,
    traceUri: executionResult.traceUri,
    telemetry: executionResult.telemetry,
    agentMetadata: options.agentMetadata,
  });

  console.log(`Submitted ${job.jobId}: score=${submission.scoreBreakdown.totalScore} status=${submission.scoreBreakdown.scoreStatus}`);

  return {
    jobId: job.jobId,
    claimId: claim.claimId,
    runDir,
    submitted: true,
    submission,
  };
}

function describePolicy(policy: WorkerRuntimePolicy): string {
  if (policy.jobId) {
    return `job=${policy.jobId}`;
  }

  const parts = [
    `milestones=${formatMilestoneFilter(policy.milestoneTypes)}`,
    typeof policy.maxBudgetUsd === 'number' ? `maxBudget=$${formatBudgetUsd(policy.maxBudgetUsd)}` : null,
  ].filter(Boolean);

  return parts.join(' ');
}

async function fetchEligibleJobs(client: BrokerClient, policy: WorkerRuntimePolicy): Promise<BrokerJob[]> {
  if (policy.jobId) {
    const job = await client.getJob(policy.jobId);
    return [job];
  }

  return client.listJobs('queued');
}

export async function runAutonomousWorker(
  input: StartWorkerOptions,
  client: BrokerClient = createBrokerClient(input.brokerUrl),
): Promise<AutonomousRunOutcome | null> {
  const options = StartWorkerOptionsSchema.parse({
    brokerUrl: input.brokerUrl ?? DEFAULT_BROKER_URL,
    workerId: input.workerId,
    agentMetadata: input.agentMetadata,
    executorCommand: input.executorCommand,
    workspaceDir: input.workspaceDir,
    pollIntervalMs: input.pollIntervalMs,
    once: input.once,
    submitResult: input.submitResult,
    policy: input.policy,
  });

  console.log(`Worker ${options.workerId} scanning ${client.brokerUrl} with ${describePolicy(options.policy)}`);

  while (true) {
    const jobs = await fetchEligibleJobs(client, options.policy);
    const job = pickNextJob(jobs, options.policy);

    if (job) {
      const claim = await client.claimJob(job.jobId, options.workerId, options.agentMetadata);
      return executeClaimedJob(client, job, claim, options);
    }

    const noMatchMessage = options.policy.jobId
      ? `Job ${options.policy.jobId} is not claimable yet.`
      : `No queued jobs matched ${describePolicy(options.policy)}.`;

    console.log(noMatchMessage);
    if (options.once) {
      return null;
    }

    await sleep(options.pollIntervalMs);
  }
}

export function defaultWorkspaceDir(baseDir = process.cwd()): string {
  return resolve(baseDir, '.iex-worker-runs');
}

export function testWorkspaceDir(prefix = 'iex-worker-test-'): string {
  return join(tmpdir(), prefix);
}
