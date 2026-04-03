import type { MilestoneType, ScoreBreakdown, JobResultSubmitRequest } from 'intelligence-exchange-cannes-shared';

// Rule-based deterministic scorer. No LLM grader in MVP.
// Each milestone type has its own rubric.
//
// Score diagram:
//   tasks:     JSON output present + non-empty artifacts → pass (score 90)
//   scaffold:  artifact URIs present + summary non-empty → pass (score 85)
//   brief:     always auto-accepted (human review at panel) → pass (score 80)
//   review:    artifact URIs present + summary ≥ 50 chars → pass (score 88)

export function scoreSubmission(
  submission: JobResultSubmitRequest,
  milestoneType: MilestoneType
): ScoreBreakdown {
  switch (milestoneType) {
    case 'tasks':
      return scoreTasks(submission);
    case 'scaffold':
      return scoreScaffold(submission);
    case 'brief':
      return scoreBrief(submission);
    case 'review':
      return scoreReview(submission);
  }
}

function scoreTasks(submission: JobResultSubmitRequest): ScoreBreakdown {
  const checks = [
    {
      name: 'artifacts_present',
      passed: submission.artifactUris.length > 0,
      detail: submission.artifactUris.length > 0
        ? `${submission.artifactUris.length} artifact(s) submitted`
        : 'No artifacts submitted',
    },
    {
      name: 'status_completed',
      passed: submission.status === 'completed',
      detail: `Submission status: ${submission.status}`,
    },
    {
      name: 'summary_present',
      passed: Boolean(submission.summary && submission.summary.length > 20),
      detail: submission.summary
        ? `Summary: ${submission.summary.length} chars`
        : 'No summary provided',
    },
  ];

  const allPassed = checks.every(c => c.passed);
  return {
    scoreStatus: allPassed ? 'passed' : 'rework',
    checks,
    totalScore: allPassed ? 90 : 0,
    rejectionReason: allPassed
      ? undefined
      : checks.filter(c => !c.passed).map(c => c.detail).join('; '),
  };
}

function scoreScaffold(submission: JobResultSubmitRequest): ScoreBreakdown {
  const checks = [
    {
      name: 'artifacts_present',
      passed: submission.artifactUris.length > 0,
      detail: `Artifacts: ${submission.artifactUris.length}`,
    },
    {
      name: 'summary_present',
      passed: Boolean(submission.summary && submission.summary.length > 10),
      detail: submission.summary ? 'Summary present' : 'No summary',
    },
    {
      name: 'status_completed',
      passed: submission.status === 'completed',
      detail: `Status: ${submission.status}`,
    },
  ];

  const allPassed = checks.every(c => c.passed);
  return {
    scoreStatus: allPassed ? 'passed' : 'rework',
    checks,
    totalScore: allPassed ? 85 : 0,
    rejectionReason: allPassed
      ? undefined
      : checks.filter(c => !c.passed).map(c => c.detail).join('; '),
  };
}

function scoreBrief(_submission: JobResultSubmitRequest): ScoreBreakdown {
  // Brief milestones are auto-accepted — human review is the quality gate at the Review Panel.
  return {
    scoreStatus: 'passed',
    checks: [{ name: 'auto_accept', passed: true, detail: 'Brief milestones are human-reviewed at the Review Panel' }],
    totalScore: 80,
  };
}

function scoreReview(submission: JobResultSubmitRequest): ScoreBreakdown {
  const summaryLen = submission.summary?.length ?? 0;
  const checks = [
    {
      name: 'artifacts_present',
      passed: submission.artifactUris.length > 0,
      detail: `Artifacts: ${submission.artifactUris.length}`,
    },
    {
      name: 'review_summary_sufficient',
      passed: summaryLen >= 50,
      detail: summaryLen >= 50 ? `Summary: ${summaryLen} chars` : `Summary too short: ${summaryLen} chars (min 50)`,
    },
    {
      name: 'status_completed',
      passed: submission.status === 'completed',
      detail: `Status: ${submission.status}`,
    },
  ];

  const allPassed = checks.every(c => c.passed);
  return {
    scoreStatus: allPassed ? 'passed' : 'rework',
    checks,
    totalScore: allPassed ? 88 : 0,
    rejectionReason: allPassed
      ? undefined
      : checks.filter(c => !c.passed).map(c => c.detail).join('; '),
  };
}
