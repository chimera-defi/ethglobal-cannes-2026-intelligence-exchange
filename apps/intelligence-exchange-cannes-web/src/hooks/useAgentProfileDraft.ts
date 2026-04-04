import { useEffect, useState } from 'react';
import type { AgentAuthorization } from '../api';

export interface AgentProfileDraft {
  agentType: string;
  agentVersion: string;
}

const STORAGE_KEY = 'iex:agent-profile';

export const DEFAULT_AGENT_PROFILE: AgentProfileDraft = {
  agentType: 'codex',
  agentVersion: '1.0.0',
};

function normalizeDraft(value: Partial<AgentProfileDraft> | null | undefined): AgentProfileDraft {
  return {
    agentType: value?.agentType?.trim() || DEFAULT_AGENT_PROFILE.agentType,
    agentVersion: value?.agentVersion?.trim() || DEFAULT_AGENT_PROFILE.agentVersion,
  };
}

function readStoredDraft(): AgentProfileDraft {
  if (typeof window === 'undefined') return DEFAULT_AGENT_PROFILE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_AGENT_PROFILE;
    return normalizeDraft(JSON.parse(raw) as Partial<AgentProfileDraft>);
  } catch {
    return DEFAULT_AGENT_PROFILE;
  }
}

export function matchesAgentProfile(
  authorization: Pick<AgentAuthorization, 'agentType' | 'agentVersion'> | null | undefined,
  draft: AgentProfileDraft,
) {
  if (!authorization) return false;
  const agentVersion = authorization.agentVersion?.trim() || DEFAULT_AGENT_PROFILE.agentVersion;
  return authorization.agentType.trim() === draft.agentType.trim()
    && agentVersion === draft.agentVersion.trim();
}

export function pickPreferredWorkerAuthorization(
  authorizations: AgentAuthorization[],
  draft: AgentProfileDraft,
) {
  const workerAuths = authorizations.filter((authorization) => authorization.role === 'worker');
  return workerAuths.find((authorization) => matchesAgentProfile(authorization, draft))
    ?? workerAuths.find((authorization) => authorization.status === 'active')
    ?? workerAuths.find((authorization) => authorization.status === 'pending_registration')
    ?? workerAuths[0]
    ?? null;
}

export function useAgentProfileDraft() {
  const [draft, setDraft] = useState<AgentProfileDraft>(() => readStoredDraft());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeDraft(draft)));
  }, [draft]);

  return [draft, setDraft] as const;
}
