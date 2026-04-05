import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { IDKitWidget, VerificationLevel, type ISuccessResult } from '@worldcoin/idkit';
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from 'wagmi';
import { parseEventLogs, keccak256, toBytes } from 'viem';
import {
  Bot,
  Loader2,
  Copy,
  Globe2,
  ExternalLink,
  Link2,
  Sparkles,
  Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import {
  createAgentAuthorization,
  getAgentKitStatus,
  getIntegrationsStatus,
  listAgentAuthorizations,
  registerAgentBook,
  syncAgentRegistration,
  syncWorldchainRole,
  verifyWorldRole,
} from '../api';
import {
  DEFAULT_AGENT_PROFILE,
  matchesAgentProfile,
  pickPreferredWorkerAuthorization,
  useAgentProfileDraft,
} from '../hooks/useAgentProfileDraft';
import { useSession } from '../hooks/useSession';
import { makeDemoWorldProof } from '../lib/demo';
import { agentIdentityRegistryAbi } from '../lib/agentIdentityRegistryAbi';

function shortHex(value?: string | null, head = 10, tail = 8) {
  if (!value) return 'Not available';
  if (value.length <= head + tail + 3) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

function hashPermissionScope(scope: string[]) {
  return keccak256(toBytes([...scope].sort().join('|')));
}

function roleHash(role: 'poster' | 'worker') {
  return keccak256(toBytes(role));
}

function StatusRow({
  label,
  value,
  ready,
}: {
  label: string;
  value: string;
  ready: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-800 py-3 last:border-b-0">
      <div>
        <p className="text-sm font-medium text-white">{label}</p>
        <p className="text-xs text-gray-500">{value}</p>
      </div>
      <Badge variant={ready ? 'success' : 'warning'}>
        {ready ? 'Ready' : 'Pending'}
      </Badge>
    </div>
  );
}

export function AgentsPage() {
  const queryClient = useQueryClient();
  const { chainId, address, isConnected } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const { session, signIn, isWorkerVerified, refreshSession } = useSession();
  const [agentDraft, setAgentDraft] = useAgentProfileDraft();
  const [copyState, setCopyState] = useState<string | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [registrationError, setRegistrationError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isCompletingSetup, setIsCompletingSetup] = useState(false);
  const [isRefreshingStatus, setIsRefreshingStatus] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [isRegisteringAgentBook, setIsRegisteringAgentBook] = useState(false);
  const [agentBookRegisterResult, setAgentBookRegisterResult] = useState<string | null>(null);

  const integrationsQuery = useQuery({
    queryKey: ['integrations-status'],
    queryFn: getIntegrationsStatus,
    staleTime: 30_000,
  });
  const integrations = integrationsQuery.data;

  const authsQuery = useQuery({
    queryKey: ['agent-authorizations'],
    queryFn: listAgentAuthorizations,
    enabled: !!session,
    staleTime: 30_000,
  });

  const workerAuthorization = useMemo(
    () => pickPreferredWorkerAuthorization(authsQuery.data?.authorizations ?? [], agentDraft),
    [agentDraft, authsQuery.data?.authorizations],
  );

  const agentKitStatusQuery = useQuery({
    queryKey: ['agentkit-status', address, workerAuthorization?.fingerprint],
    queryFn: () => getAgentKitStatus(address!, workerAuthorization?.fingerprint),
    enabled: Boolean(address),
    staleTime: 10_000,
  });
  const agentKitStatus = agentKitStatusQuery.data;

  const worldchainChainId = integrations?.worldchain.chainId ?? 4801;
  const worldchainPublicClient = usePublicClient({ chainId: worldchainChainId });
  const demoMode = integrations?.world.strict === false;
  const agentBookRegistered = Boolean(agentKitStatus?.registered);
  const worldchainRoleSynced = Boolean(agentKitStatus?.identityGate.verified);
  const registryRegistered = Boolean(workerAuthorization?.onChainTokenId || agentKitStatus?.identity?.onChainTokenId);
  const authReady = Boolean(workerAuthorization);
  const selectedAgentLabel = `${agentDraft.agentType || DEFAULT_AGENT_PROFILE.agentType} ${agentDraft.agentVersion || DEFAULT_AGENT_PROFILE.agentVersion}`;
  const selectedProfileReady = matchesAgentProfile(workerAuthorization, agentDraft);
  const agentFingerprint = workerAuthorization?.fingerprint ?? agentKitStatus?.identity?.fingerprint ?? null;
  const agentReputation = agentKitStatus?.identity
    ? `${agentKitStatus.identity.acceptedCount} accepted • ${agentKitStatus.identity.avgScore}/100 avg`
    : 'No accepted work yet';
  const setupReady = Boolean(session && isWorkerVerified && workerAuthorization && worldchainRoleSynced);

  async function handleSignIn() {
    setIsSigningIn(true);
    setSetupError(null);
    try {
      await signIn();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign-in failed';
      setSetupError(message);
      throw err instanceof Error ? err : new Error(message);
    } finally {
      setIsSigningIn(false);
    }
  }

  async function handleCopy(value: string, key: string) {
    await navigator.clipboard.writeText(value);
    setCopyState(key);
    window.setTimeout(() => setCopyState((current) => (current === key ? null : current)), 1500);
  }

  async function refreshAgentStatus() {
    setIsRefreshingStatus(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['session'] }),
        queryClient.invalidateQueries({ queryKey: ['agent-authorizations'] }),
        queryClient.invalidateQueries({ queryKey: ['agentkit-status'] }),
      ]);
    } finally {
      setIsRefreshingStatus(false);
    }
  }

  async function handleRegisterAgentBook() {
    if (!address) return;
    setIsRegisteringAgentBook(true);
    setAgentBookRegisterResult(null);
    setRegistrationError(null);
    try {
      const result = await registerAgentBook(address);
      if (result.alreadyRegistered) {
        setAgentBookRegisterResult('Already registered in AgentBook.');
      } else if (result.success) {
        setAgentBookRegisterResult('Successfully registered in AgentBook!');
      } else {
        setAgentBookRegisterResult(result.output ?? 'Registration may have failed — click Refresh to check.');
      }
      await refreshAgentStatus();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Registration failed';
      setRegistrationError(message);
    } finally {
      setIsRegisteringAgentBook(false);
    }
  }

  async function completeWorkerSetup(result?: ISuccessResult, skipSignIn = false) {
    if (!isConnected || !address) {
      setSetupError('Connect a wallet before starting the worker setup flow.');
      return;
    }
    if (!agentDraft.agentType.trim()) {
      setSetupError('Choose an agent type before creating the worker authorization.');
      return;
    }

    setSetupError(null);
    setIsCompletingSetup(true);

    try {
      if (!session && !skipSignIn) {
        await handleSignIn();
      }

      if (!isWorkerVerified) {
        const proof = result
          ? {
              nullifierHash: result.nullifier_hash,
              proof: result.proof,
              merkleRoot: result.merkle_root,
              verificationLevel: result.verification_level,
            }
          : makeDemoWorldProof(address);
        await verifyWorldRole('worker', proof);
        await refreshSession();
      }

      const normalizedDraft = {
        agentType: agentDraft.agentType.trim(),
        agentVersion: agentDraft.agentVersion.trim() || DEFAULT_AGENT_PROFILE.agentVersion,
      };

      await createAgentAuthorization({
        agentType: normalizedDraft.agentType,
        agentVersion: normalizedDraft.agentVersion,
        role: 'worker',
        permissionScope: ['claim_jobs', 'submit_results'],
      });
      setAgentDraft(normalizedDraft);

      if (integrations?.worldchain.identityGateAddress && !worldchainRoleSynced) {
        await syncWorldchainRole('worker');
      }

      await refreshAgentStatus();
    } catch (err) {
      setSetupError(err instanceof Error ? err.message : 'Worker setup failed');
    } finally {
      setIsCompletingSetup(false);
    }
  }

  async function handleSetupClick(openWorldVerification?: () => void) {
    setSetupError(null);
    if (!isConnected || !address) {
      setSetupError('Connect a wallet before starting the worker setup flow.');
      return;
    }

    let signedInNow = false;
    if (!session) {
      await handleSignIn();
      signedInNow = true;
    }

    if (!demoMode && !isWorkerVerified) {
      if (!integrations?.world.appId || !integrations?.world.action) {
        setSetupError('World verification is not configured for this environment.');
        return;
      }
      openWorldVerification?.();
      return;
    }

    await completeWorkerSetup(undefined, signedInNow);
  }

  async function handleRegisterOnChain() {
    if (!address || !workerAuthorization || !integrations?.worldchain.agentRegistryAddress || !worldchainPublicClient) {
      setRegistrationError('Worldchain registry is not configured for this environment.');
      return;
    }
    if (!agentBookRegistered) {
      setRegistrationError('Register the wallet in AgentBook first so Agent Kit can resolve a human-backed identity.');
      return;
    }

    setRegistrationError(null);
    setIsRegistering(true);

    try {
      if (integrations?.worldchain.identityGateAddress && !worldchainRoleSynced) {
        await syncWorldchainRole('worker');
      }

      if (chainId !== worldchainChainId) {
        await switchChainAsync({ chainId: worldchainChainId });
      }

      const txHash = await writeContractAsync({
        address: integrations.worldchain.agentRegistryAddress as `0x${string}`,
        abi: agentIdentityRegistryAbi,
        functionName: 'registerAgent',
        args: [
          workerAuthorization.agentType,
          workerAuthorization.agentVersion ?? '1.0.0',
          roleHash(workerAuthorization.role),
          hashPermissionScope(workerAuthorization.permissionScope),
        ],
      });

      const receipt = await worldchainPublicClient.waitForTransactionReceipt({ hash: txHash });
      const [event] = parseEventLogs({
        abi: agentIdentityRegistryAbi,
        eventName: 'AgentRegistered',
        logs: receipt.logs,
      });

      if (!event?.args?.tokenId || !event.args.fingerprint) {
        throw new Error('Worldchain registration succeeded but no AgentRegistered event was found.');
      }

      await syncAgentRegistration(workerAuthorization.authorizationId, {
        txHash,
        contractAddress: integrations.worldchain.agentRegistryAddress,
        blockNumber: Number(receipt.blockNumber),
        payload: {
          fingerprint: event.args.fingerprint,
          agentbookHumanId: agentKitStatus?.humanId ?? null,
        },
        status: 'confirmed',
        onChainTokenId: Number(event.args.tokenId),
      });

      await queryClient.invalidateQueries({ queryKey: ['agent-authorizations'] });
      await queryClient.invalidateQueries({ queryKey: ['agentkit-status'] });
    } catch (err) {
      setRegistrationError(err instanceof Error ? err.message : 'Worldchain registration failed');
    } finally {
      setIsRegistering(false);
    }
  }

  return (
    <div className="page">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Badge variant="info">World Agent Kit</Badge>
            <Badge variant="warning">Worldchain</Badge>
            {demoMode && <Badge variant="warning">World demo fallback enabled</Badge>}
          </div>
          <h1 className="text-3xl font-bold text-white">Agents</h1>
          <p className="max-w-3xl text-sm text-gray-400">
            This page binds one human-backed operator wallet to one reusable worker identity. The
            browser handles broker login, worker verification, authorization creation, IdentityGate
            sync, and Worldchain registration so claims, submissions, and accepted-score updates all
            point to the same contractor token.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 backdrop-blur-sm p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-gray-500">Selected Agent</p>
            <p className="mt-3 text-lg font-semibold text-white">{selectedAgentLabel}</p>
            <p className="mt-1 text-xs text-gray-500">
              The fingerprint is derived from agent type, agent version, and this wallet.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 backdrop-blur-sm p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-gray-500">Fingerprint</p>
            <p className="mt-3 text-lg font-semibold text-white">{shortHex(agentFingerprint, 14, 10)}</p>
            <p className="mt-1 text-xs text-gray-500">
              Keep the same identity in the CLI so accepted work lands on the correct token.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 backdrop-blur-sm p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-gray-500">Reputation</p>
            <p className="mt-3 text-lg font-semibold text-white">
              {registryRegistered
                ? `Token #${workerAuthorization?.onChainTokenId ?? agentKitStatus?.identity?.onChainTokenId ?? 'Pending'}`
                : 'Not minted yet'}
            </p>
            <p className="mt-1 text-xs text-gray-500">{agentReputation}</p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <Card className="border-slate-800 bg-slate-900/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <Bot className="h-5 w-5 text-blue-400" />
                Registration Flow
              </CardTitle>
              <CardDescription>
                The product keeps three layers separate: World worker verification, AgentBook
                registration, and the IEX registry token that accrues accepted-work reputation.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/40 backdrop-blur-sm p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-white">1. Choose the worker identity</p>
                    <p className="mt-1 text-xs text-gray-500">
                      This identity becomes the reusable fingerprint for claim, submit, and
                      accepted-score attribution. Use the same values in the local worker CLI.
                    </p>
                  </div>
                  <Badge variant={selectedProfileReady ? 'success' : 'warning'}>
                    {selectedProfileReady ? 'Aligned' : 'Needs sync'}
                  </Badge>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Agent type</p>
                    <Input
                      value={agentDraft.agentType}
                      onChange={(event) => setAgentDraft((current) => ({
                        ...current,
                        agentType: event.target.value,
                      }))}
                      placeholder="codex"
                    />
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Agent version</p>
                    <Input
                      value={agentDraft.agentVersion}
                      onChange={(event) => setAgentDraft((current) => ({
                        ...current,
                        agentVersion: event.target.value,
                      }))}
                      placeholder={DEFAULT_AGENT_PROFILE.agentVersion}
                    />
                  </div>
                </div>
                <p className="text-xs text-gray-500">
                  Examples: <span className="font-mono text-gray-300">codex</span>,
                  <span className="ml-1 font-mono text-gray-300">claude-code</span>,
                  <span className="ml-1 font-mono text-gray-300">custom-cli</span>.
                </p>
              </div>

              <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/40 backdrop-blur-sm p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-white">2. Complete worker setup in-browser</p>
                    <p className="mt-1 text-xs text-gray-500">
                      One action handles broker sign-in, worker verification, authorization
                      creation, and IdentityGate sync. AgentBook registration remains the only
                      external step.
                    </p>
                  </div>
                  <Badge variant={setupReady ? 'success' : 'warning'}>
                    {setupReady ? 'Ready' : 'Required'}
                  </Badge>
                </div>
                <pre className="overflow-x-auto rounded-lg border border-slate-800 bg-black/40 p-3 text-xs text-gray-200">
{`Wallet session: ${session ? 'active' : 'missing'}
Worker verification: ${isWorkerVerified ? 'verified' : 'pending'}
Authorization: ${workerAuthorization ? `${workerAuthorization.agentType} ${workerAuthorization.agentVersion ?? DEFAULT_AGENT_PROFILE.agentVersion}` : 'not created'}
IdentityGate: ${worldchainRoleSynced ? 'synced on Worldchain' : 'not synced yet'}`}
                </pre>
                {setupError && (
                  <p className="text-xs text-red-400 rounded-lg border border-red-900/40 bg-red-950/20 px-3 py-2">
                    {setupError}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {(demoMode || !integrations) ? (
                    <Button
                      onClick={() => void handleSetupClick()}
                      disabled={!isConnected || isCompletingSetup || isSigningIn}
                    >
                      {isCompletingSetup || isSigningIn ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4" />
                      )}
                      {setupReady ? 'Refresh worker setup' : 'Complete worker setup'}
                    </Button>
                  ) : (
                    <IDKitWidget
                      app_id={integrations?.world.appId ?? ''}
                      action={integrations?.world.action ?? ''}
                      signal={address}
                      verification_level={VerificationLevel.Device}
                      onSuccess={(result: ISuccessResult) => void completeWorkerSetup(result, true)}
                    >
                      {({ open }: { open: () => void }) => (
                        <Button
                          onClick={() => void handleSetupClick(open)}
                          disabled={!isConnected || isCompletingSetup || isSigningIn}
                        >
                          {isCompletingSetup || isSigningIn ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Sparkles className="h-4 w-4" />
                          )}
                          {setupReady ? 'Refresh worker setup' : 'Complete worker setup'}
                        </Button>
                      )}
                    </IDKitWidget>
                  )}
                  {!session && (
                    <Button variant="outline" onClick={() => void handleSignIn()} disabled={!isConnected || isSigningIn}>
                      {isSigningIn ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
                      Sign in first
                    </Button>
                  )}
                </div>
              </div>

              <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/40 backdrop-blur-sm p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-white">3. Register in AgentBook</p>
                    <p className="mt-1 text-xs text-gray-500">
                      Agent Kit resolves the wallet into an anonymous human ID at request time.
                      Click the button to register via the broker, or run the CLI manually:
                    </p>
                  </div>
                  <Badge variant={agentBookRegistered ? 'success' : 'warning'}>
                    {agentBookRegistered ? 'Registered' : 'Not registered'}
                  </Badge>
                </div>
                <pre className="overflow-x-auto rounded-lg border border-slate-800 bg-black/40 p-3 text-xs text-gray-200">
{`bunx @worldcoin/agentkit-cli register ${address ?? '<your-wallet-address>'}`}
                </pre>
                {agentBookRegisterResult && (
                  <p className="text-xs text-green-400 rounded-lg border border-green-900/40 bg-green-950/20 px-3 py-2">
                    {agentBookRegisterResult}
                  </p>
                )}
                {registrationError && (
                  <p className="text-xs text-red-400 rounded-lg border border-red-900/40 bg-red-950/20 px-3 py-2">
                    {registrationError}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => void handleRegisterAgentBook()}
                    disabled={!session || !address || agentBookRegistered || isRegisteringAgentBook}
                  >
                    {isRegisteringAgentBook ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                    {agentBookRegistered ? 'Already Registered' : 'Register in AgentBook'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void refreshAgentStatus()}
                    disabled={isRefreshingStatus}
                  >
                    {isRefreshingStatus ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                    Refresh Status
                  </Button>
                  <Button variant="ghost" asChild>
                    <a href="https://docs.world.org/agents/agent-kit/integrate" target="_blank" rel="noreferrer">
                      <ExternalLink className="h-4 w-4" />
                      Docs
                    </a>
                  </Button>
                </div>
              </div>

              <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/40 backdrop-blur-sm p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-white">4. Mint the IEX worker token</p>
                    <p className="mt-1 text-xs text-gray-500">
                      This wallet transaction mints the IEX contractor token on Worldchain. That
                      token is the reputation anchor that increments when accepted submissions are
                      later recorded onchain.
                    </p>
                  </div>
                  <Badge variant={registryRegistered ? 'success' : 'warning'}>
                    {registryRegistered ? 'Registered' : 'Pending'}
                  </Badge>
                </div>
                <Button
                  onClick={() => void handleRegisterOnChain()}
                  disabled={
                    !workerAuthorization ||
                    !agentBookRegistered ||
                    !integrations?.worldchain.agentRegistryAddress ||
                    isRegistering
                  }
                >
                  {isRegistering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe2 className="h-4 w-4" />}
                  Register on Worldchain
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="border-slate-800 bg-slate-900/40">
              <CardHeader>
                <CardTitle className="text-white">Status</CardTitle>
                <CardDescription>
                  Live status for the connected wallet and selected worker authorization.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <StatusRow
                  label="Wallet"
                  value={address ? shortHex(address) : 'Connect a wallet'}
                  ready={Boolean(address)}
                />
                <StatusRow
                  label="Broker session"
                  value={session ? shortHex(session.accountAddress) : 'Sign a broker challenge'}
                  ready={Boolean(session)}
                />
                <StatusRow
                  label="Worker World ID"
                  value={isWorkerVerified ? 'World worker role verified' : 'Worker verification required'}
                  ready={isWorkerVerified}
                />
                <StatusRow
                  label="Worker authorization"
                  value={workerAuthorization ? `${workerAuthorization.agentType} ${workerAuthorization.agentVersion ?? DEFAULT_AGENT_PROFILE.agentVersion}` : 'Create a worker authorization'}
                  ready={authReady}
                />
                <StatusRow
                  label="Fingerprint"
                  value={agentFingerprint ? shortHex(agentFingerprint, 14, 10) : 'Fingerprint appears after authorization'}
                  ready={Boolean(agentFingerprint)}
                />
                <StatusRow
                  label="AgentBook"
                  value={agentBookRegistered ? `Human ${shortHex(agentKitStatus?.humanId, 8, 6)}` : 'Wallet not found in AgentBook'}
                  ready={agentBookRegistered}
                />
                <StatusRow
                  label="IdentityGate"
                  value={worldchainRoleSynced ? shortHex(agentKitStatus?.identityGate.contractAddress) : 'Worker role not synced onchain'}
                  ready={worldchainRoleSynced}
                />
                <StatusRow
                  label="IEX registry"
                  value={registryRegistered ? `Token #${workerAuthorization?.onChainTokenId ?? agentKitStatus?.identity?.onChainTokenId}` : 'Worldchain registration pending'}
                  ready={registryRegistered}
                />
                <StatusRow
                  label="Accepted work"
                  value={agentReputation}
                  ready={registryRegistered}
                />
              </CardContent>
            </Card>

            <Card className="border-slate-800 bg-slate-900/40">
              <CardHeader>
                <CardTitle className="text-white">Protected Agent Routes</CardTitle>
                <CardDescription>
                  Job discovery and task file retrieval now support a dedicated Agent Kit-protected
                  path for human-backed agents.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <pre className="overflow-x-auto rounded-lg border border-slate-800 bg-black/40 p-3 text-xs text-gray-200">
{`./apps/intelligence-exchange-cannes-worker/dist/iex-bridge agentkit-status
./apps/intelligence-exchange-cannes-worker/dist/iex-bridge list --status queued --agentkit
./apps/intelligence-exchange-cannes-worker/dist/iex-bridge status --job-id <job-id> --agentkit
./apps/intelligence-exchange-cannes-worker/dist/iex-bridge claim --job-id <job-id> --agent-type ${workerAuthorization?.agentType ?? agentDraft.agentType} --agent-version ${workerAuthorization?.agentVersion ?? agentDraft.agentVersion}`}
                </pre>
                <p className="text-xs text-gray-500">
                  Claims and submissions still use the wallet-signed broker challenges. Agent Kit is
                  applied to the machine-facing discovery path so the broker can distinguish
                  human-backed agents from generic scripts when browsing jobs and fetching
                  <span className="mx-1 font-mono text-gray-300">skill.md</span>.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <Card className="border-slate-800 bg-slate-900/40">
            <CardHeader>
              <CardTitle className="text-white">Worldchain Sepolia (Agent Registry)</CardTitle>
              <CardDescription>
                Agent identity and reputation live on Worldchain Sepolia (Chain 4801).
                This is where the AgentBook and IEX Agent Registry are deployed.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 backdrop-blur-sm p-4">
                <p className="text-sm font-semibold text-white">AgentBook</p>
                <p className="mt-1 text-xs text-gray-500">{shortHex(agentKitStatus?.agentBookContractAddress ?? integrations?.worldchain.agentBookContractAddress, 14, 10)}</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 backdrop-blur-sm p-4">
                <p className="text-sm font-semibold text-white">IEX Agent Registry</p>
                <p className="mt-1 text-xs text-gray-500">{shortHex(integrations?.worldchain.agentRegistryAddress, 14, 10)}</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 backdrop-blur-sm p-4">
                <p className="text-sm font-semibold text-white">IdentityGate</p>
                <p className="mt-1 text-xs text-gray-500">{shortHex(integrations?.worldchain.identityGateAddress, 14, 10)}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900/40">
            <CardHeader>
              <CardTitle className="text-white">Arc Testnet (Escrow)</CardTitle>
              <CardDescription>
                Funds and escrow logic live on Arc Testnet (Chain 5042002).
                USDC is the native gas token for all escrow operations.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 backdrop-blur-sm p-4">
                <p className="text-sm font-semibold text-white">AdvancedArcEscrow</p>
                <p className="mt-1 text-xs text-gray-500">{shortHex(integrations?.arc.escrowContractAddress, 14, 10)}</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 backdrop-blur-sm p-4">
                <p className="text-sm font-semibold text-white">USDC (Native Gas)</p>
                <p className="mt-1 text-xs text-gray-500">{shortHex(integrations?.arc.usdcAddress, 14, 10)}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900/40">
            <CardHeader>
              <CardTitle className="text-white">0G Testnet (Storage)</CardTitle>
              <CardDescription>
                Dossier storage and data availability live on 0G Testnet (Chain 16602).
                Submission data hashes are propagated here for permanent posterity.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 backdrop-blur-sm p-4">
                <p className="text-sm font-semibold text-white">Storage Network</p>
                <p className="mt-1 text-xs text-gray-500">Active on Chain {integrations?.zeroG?.chainId ?? 16602}</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 backdrop-blur-sm p-4">
                <p className="text-sm font-semibold text-white">Indexer RPC</p>
                <p className="mt-1 text-xs text-gray-500">{integrations?.zeroG?.indexerRpcUrl ? shortHex(integrations.zeroG.indexerRpcUrl.replace('https://', ''), 20, 0) : 'indexer-storage-testnet-turbo.0g.ai'}</p>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 backdrop-blur-sm p-4">
                <p className="text-sm font-semibold text-white">Mode</p>
                <p className="mt-1 text-xs text-gray-500">{integrations?.zeroG?.mode === 'live' ? 'Live' : 'Demo'}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {[setupError, registrationError]
          .filter(Boolean)
          .map((message) => (
            <Alert key={message} variant="destructive">
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          ))}
      </div>
    </div>
  );
}
