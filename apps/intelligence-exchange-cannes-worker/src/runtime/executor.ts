import { spawn } from 'node:child_process';
import { readFile, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { JobResultSubmitRequestSchema, type JobResultSubmitRequest } from 'intelligence-exchange-cannes-shared';

const RawExecutionResultSchema = z.object({
  status: z.enum(['completed', 'failed', 'expired']).default('completed'),
  summary: z.string().min(1).max(5000),
  artifactUris: z.array(z.string()).optional(),
  artifactPath: z.string().optional(),
  artifactPaths: z.array(z.string()).optional(),
  traceUri: z.string().optional(),
  tracePath: z.string().optional(),
  telemetry: z.object({
    inputTokens: z.number().int().optional(),
    outputTokens: z.number().int().optional(),
    toolCalls: z.number().int().optional(),
    durationMs: z.number().int().optional(),
  }).optional(),
}).superRefine((value, ctx) => {
  const artifactCount =
    (value.artifactUris?.length ?? 0) +
    (value.artifactPaths?.length ?? 0) +
    (value.artifactPath ? 1 : 0);

  if (artifactCount === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Execution result must include at least one artifact URI or path',
      path: ['artifactUris'],
    });
  }
});

export type NormalizedExecutionResult = Pick<
  JobResultSubmitRequest,
  'status' | 'artifactUris' | 'summary' | 'traceUri' | 'telemetry'
>;

function looksLikeAbsoluteUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

async function toArtifactUri(value: string, baseDir: string): Promise<string> {
  if (looksLikeAbsoluteUrl(value)) {
    return value;
  }

  const absolutePath = await realpath(resolve(baseDir, value));
  return pathToFileURL(absolutePath).toString();
}

export async function readExecutionResult(resultPath: string, baseDir: string): Promise<NormalizedExecutionResult> {
  const raw = await readFile(resultPath, 'utf8');
  const parsed = RawExecutionResultSchema.parse(JSON.parse(raw) as unknown);

  const artifactUris = await Promise.all([
    ...(parsed.artifactUris ?? []),
    ...(parsed.artifactPaths ?? []),
    ...(parsed.artifactPath ? [parsed.artifactPath] : []),
  ].map((value) => toArtifactUri(value, baseDir)));

  const traceUri = parsed.traceUri
    ? await toArtifactUri(parsed.traceUri, baseDir)
    : parsed.tracePath
      ? await toArtifactUri(parsed.tracePath, baseDir)
      : undefined;

  return JobResultSubmitRequestSchema.pick({
    status: true,
    artifactUris: true,
    summary: true,
    traceUri: true,
    telemetry: true,
  }).parse({
    status: parsed.status,
    artifactUris,
    summary: parsed.summary,
    traceUri,
    telemetry: parsed.telemetry,
  });
}

export async function runExecutorCommand(
  command: string,
  runDir: string,
  extraEnv: Record<string, string>,
): Promise<void> {
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(command, {
      cwd: runDir,
      env: {
        ...Object.fromEntries(
          Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
        ),
        ...extraEnv,
      },
      shell: true,
      stdio: 'inherit',
    });

    child.on('error', (err) => rejectPromise(err));
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      const detail = signal ? `signal ${signal}` : `exit code ${code ?? 'unknown'}`;
      rejectPromise(new Error(`Executor command failed with ${detail}`));
    });
  });
}
