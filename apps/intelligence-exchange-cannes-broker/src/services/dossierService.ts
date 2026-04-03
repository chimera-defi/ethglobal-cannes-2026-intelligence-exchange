import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { eq, desc } from 'drizzle-orm';
import { db } from '../db/client';
import { briefs, ideas, jobs, submissions } from '../db/schema';

type AcceptedDossier = {
  ideaId: string;
  briefId: string;
  jobId: string;
  posterId: string;
  title: string;
  prompt: string;
  budgetUsd: string;
  jobStatus: string;
  submission: {
    workerId: string;
    artifactUris: unknown;
    traceUri: string | null;
    summary: string | null;
    scoreBreakdown: unknown;
    submittedAt: Date;
  } | null;
  acceptedAt: string;
};

const runtimeRoot = join(process.cwd(), '.runtime', 'dossiers');

async function buildAcceptedDossier(jobId: string): Promise<AcceptedDossier> {
  const [job] = await db.select().from(jobs).where(eq(jobs.jobId, jobId));
  if (!job) throw new Error(`Job not found: ${jobId}`);

  const [idea] = await db.select().from(ideas).where(eq(ideas.ideaId, job.ideaId));
  const [brief] = await db.select().from(briefs).where(eq(briefs.briefId, job.briefId));
  const [submission] = await db.select()
    .from(submissions)
    .where(eq(submissions.jobId, jobId))
    .orderBy(desc(submissions.submittedAt));

  if (!idea || !brief) {
    throw new Error(`Missing idea or brief for dossier on job ${jobId}`);
  }

  return {
    ideaId: job.ideaId,
    briefId: job.briefId,
    jobId,
    posterId: idea.posterId,
    title: idea.title,
    prompt: idea.prompt,
    budgetUsd: idea.budgetUsd,
    jobStatus: job.status,
    submission: submission ? {
      workerId: submission.workerId,
      artifactUris: submission.artifactUris,
      traceUri: submission.traceUri,
      summary: submission.summary,
      scoreBreakdown: submission.scoreBreakdown,
      submittedAt: submission.submittedAt,
    } : null,
    acceptedAt: new Date().toISOString(),
  };
}

async function writeLocalDossier(dossier: AcceptedDossier) {
  await mkdir(runtimeRoot, { recursive: true });
  const filename = `${dossier.ideaId}-${dossier.jobId}.json`;
  const filePath = join(runtimeRoot, filename);
  await writeFile(filePath, JSON.stringify(dossier, null, 2), 'utf8');
  return `local://dossiers/${filename}`;
}

async function writeRemoteDossier(dossier: AcceptedDossier) {
  const endpoint = process.env.ZERO_G_WRITE_URL;
  if (!endpoint) return null;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.ZERO_G_API_KEY ? { Authorization: `Bearer ${process.env.ZERO_G_API_KEY}` } : {}),
    },
    body: JSON.stringify(dossier),
  });

  if (!res.ok) {
    throw new Error(`0G write failed with ${res.status}`);
  }

  const data = await res.json() as { uri?: string };
  if (!data.uri) {
    throw new Error('0G write response did not include uri');
  }

  return data.uri;
}

export async function writeAcceptedJobDossier(jobId: string) {
  const dossier = await buildAcceptedDossier(jobId);
  const remoteUri = await writeRemoteDossier(dossier);
  return remoteUri ?? writeLocalDossier(dossier);
}
