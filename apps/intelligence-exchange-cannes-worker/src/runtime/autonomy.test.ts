import { afterEach, describe, expect, mock, test } from 'bun:test';
import { mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { MilestoneType } from 'intelligence-exchange-cannes-shared';
import { pickNextJob, runAutonomousWorker } from './autonomy';

const ORIGINAL_FETCH = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
});

describe('pickNextJob', () => {
  test('filters by milestone type and max budget', () => {
    const jobs = [
      {
        jobId: '11111111-1111-4111-8111-111111111111',
        milestoneType: 'review' as MilestoneType,
        budgetUsd: 25,
        status: 'queued',
      },
      {
        jobId: '22222222-2222-4222-8222-222222222222',
        milestoneType: 'brief' as MilestoneType,
        budgetUsd: 5,
        status: 'queued',
      },
    ];

    const picked = pickNextJob(jobs, {
      milestoneTypes: ['brief'],
      maxBudgetUsd: 10,
    });

    expect(picked?.jobId).toBe('22222222-2222-4222-8222-222222222222');
  });
});

describe('runAutonomousWorker', () => {
  test('claims, executes, and submits one queued job', async () => {
    const fetchMock = mock(async (input: string | URL, init?: RequestInit) => {
      const url = input.toString();

      if (url.endsWith('/v1/cannes/jobs?status=queued')) {
        return new Response(JSON.stringify({
          jobs: [
            {
              jobId: '33333333-3333-4333-8333-333333333333',
              ideaId: 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
              briefId: 'bbbbbbb2-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
              milestoneId: 'ccccccc3-cccc-4ccc-8ccc-ccccccccccc3',
              milestoneType: 'brief',
              budgetUsd: '3.13',
              status: 'queued',
              createdAt: '2026-04-04T10:00:00.000Z',
              updatedAt: '2026-04-04T10:00:00.000Z',
            },
          ],
          count: 1,
        }), {
          headers: { 'content-type': 'application/json' },
        });
      }

      if (url.endsWith('/v1/cannes/jobs/33333333-3333-4333-8333-333333333333/claim')) {
        expect(init?.method).toBe('POST');
        return new Response(JSON.stringify({
          claimId: '44444444-4444-4444-8444-444444444444',
          jobId: '33333333-3333-4333-8333-333333333333',
          expiresAt: '2026-04-04T10:45:00.000Z',
          skillMdUrl: '/v1/cannes/jobs/33333333-3333-4333-8333-333333333333/skill.md',
        }), {
          headers: { 'content-type': 'application/json' },
        });
      }

      if (url.endsWith('/v1/cannes/jobs/33333333-3333-4333-8333-333333333333/skill.md')) {
        return new Response('# brief task\n\nWrite a small brief.\n', {
          headers: { 'content-type': 'text/markdown' },
        });
      }

      if (url.endsWith('/v1/cannes/jobs/33333333-3333-4333-8333-333333333333/submit')) {
        expect(init?.method).toBe('POST');
        const body = JSON.parse(String(init?.body)) as {
          artifactUris: string[];
          summary: string;
          claimId: string;
        };
        expect(body.claimId).toBe('44444444-4444-4444-8444-444444444444');
        expect(body.summary).toContain('autonomy smoke test');
        expect(body.artifactUris[0].startsWith('file://')).toBeTrue();

        return new Response(JSON.stringify({
          submissionId: '55555555-5555-4555-8555-555555555555',
          scoreBreakdown: {
            scoreStatus: 'passed',
            totalScore: 80,
            checks: [
              {
                name: 'auto_accept',
                passed: true,
                detail: 'Brief milestones are human-reviewed at the Review Panel',
              },
            ],
          },
        }), {
          headers: { 'content-type': 'application/json' },
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const workspaceDir = await mkdtemp(join(tmpdir(), 'iex-worker-autonomy-'));
    const outcome = await runAutonomousWorker({
      brokerUrl: 'http://broker.test',
      workerId: 'worker-demo-1',
      agentMetadata: {
        agentType: 'codex',
        agentVersion: 'test',
      },
      executorCommand: [
        'cat <<EOF > "$IEX_RUN_DIR/brief.md"',
        '# Demo Brief',
        '',
        'Autonomy smoke test artifact.',
        'EOF',
        'cat <<EOF > "$IEX_RESULT_PATH"',
        '{',
        '  "status": "completed",',
        '  "summary": "Generated autonomy smoke test brief artifact and prepared a broker submission.",',
        '  "artifactPath": "brief.md"',
        '}',
        'EOF',
      ].join('\n'),
      workspaceDir,
      pollIntervalMs: 50,
      once: true,
      submitResult: true,
      policy: {
        milestoneTypes: ['brief'],
      },
    });

    expect(outcome?.jobId).toBe('33333333-3333-4333-8333-333333333333');
    expect(outcome?.submitted).toBeTrue();
    expect(outcome?.submission?.scoreBreakdown.scoreStatus).toBe('passed');

    const skillMd = await readFile(join(String(outcome?.runDir), 'skill.md'), 'utf8');
    const resultJson = await readFile(join(String(outcome?.runDir), 'result.json'), 'utf8');

    expect(skillMd).toContain('brief task');
    expect(resultJson).toContain('Generated autonomy smoke test brief artifact');
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
