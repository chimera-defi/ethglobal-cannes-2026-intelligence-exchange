import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { IDKitWidget, VerificationLevel, type ISuccessResult } from '@worldcoin/idkit';
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from 'wagmi';
import { parseEventLogs, keccak256, toBytes } from 'viem';
import {
  ShieldCheck,
  Bot,
  Loader2,
  Copy,
  KeyRound,
  Globe2,
  ExternalLink,
  Link2,
  Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  createAgentAuthorization,
  getAgentKitStatus,
  getIntegrationsStatus,
  listAgentAuthorizations,
  syncAgentRegistration,
  syncWorldchainRole,
  verifyWorldRole,
} from '../api';
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
    <div className="flex items-center justify-between gap-4 border-b border-gray-800 py-3 last:border-b-0">
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
  const [copyState, setCopyState] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [worldError, setWorldError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [registrationError, setRegistrationError] = useState<string | null>(null);
  const [isCreatingAuth, setIsCreatingAuth] = useState(false);
  const [isSyncingRole, setIsSyncingRole] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);

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

  const workerAuthorization = (authsQuery.data?.authorizations ?? []).find(
    (authorization) => authorization.role === 'worker',
  ) ?? null;

  const agentKitStatusQuery = useQuery({
    queryKey: ['agentkit-status', address, workerAuthorization?.fingerprint],
    queryFn: () => getAgentKitStatus(address!, workerAuthorization?.fingerprint),
    enabled: Boolean(address),
    staleTime: 10_000,
  });
  const agentKitStatus = agentKitStatusQuery.data;

  const worldchainChainId = integrations?.worldchain.chainId ?? 480;
  const worldchainPublicClient = usePublicClient({ chainId: worldchainChainId });
  const demoMode = integrations?.world.strict === false;
  const agentBookRegistered = Boolean(agentKitStatus?.registered);
  const worldchainRoleSynced = Boolean(agentKitStatus?.identityGate.verified);
  const registryRegistered = Boolean(workerAuthorization?.onChainTokenId || agentKitStatus?.identity?.onChainTokenId);
  const authReady = Boolean(workerAuthorization);

  async function handleSignIn() {
    setIsSigningIn(true);
    setSignInError(null);
    try {
      await signIn();
    } catch (err) {
      setSignInError(err instanceof Error ? err.message : 'Sign-in failed');
    } finally {
      setIsSigningIn(false);
    }
  }

  async function handleCreateAuthorization() {
    setIsCreatingAuth(true);
    setAuthError(null);
    try {
      await createAgentAuthorization({
        agentType: 'claude-code',
        agentVersion: '1.0.0',
        role: 'worker',
        permissionScope: ['claim_jobs', 'submit_results'],
      });
      await queryClient.invalidateQueries({ queryKey: ['agent-authorizations'] });
      await queryClient.invalidateQueries({ queryKey: ['agentkit-status'] });
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Failed to create worker authorization');
    } finally {
      setIsCreatingAuth(false);
    }
  }

  async function handleWorkerVerify(result?: ISuccessResult) {
    setWorldError(null);
    try {
      const proof = result
        ? {
            nullifierHash: result.nullifier_hash,
            proof: result.proof,
            merkleRoot: result.merkle_root,
            verificationLevel: result.verification_level,
          }
        : makeDemoWorldProof(address ?? 'demo-agent-page');
      await verifyWorldRole('worker', proof);
      await refreshSession();
      await queryClient.invalidateQueries({ queryKey: ['session'] });
    } catch (err) {
      setWorldError(err instanceof Error ? err.message : 'Worker verification failed');
    }
  }

  async function handleCopy(value: string, key: string) {
    await navigator.clipboard.writeText(value);
    setCopyState(key);
    window.setTimeout(() => setCopyState((current) => (current === key ? null : current)), 1500);
  }

  async function handleSyncRole() {
    setIsSyncingRole(true);
    setSyncError(null);
    try {
      await syncWorldchainRole('worker');
      await queryClient.invalidateQueries({ queryKey: ['agentkit-status'] });
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Failed to sync IdentityGate role');
    } finally {
      setIsSyncingRole(false);
    }
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
            This page wires World Agent Kit into the worker flow. Human-backed agents register in
            AgentBook, sync their worker role into IdentityGate on Worldchain, then register in the
            Intelligence Exchange registry before using the protected agent routes.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <Card className="border-gray-800 bg-gray-900/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <Bot className="h-5 w-5 text-blue-400" />
                Registration Flow
              </CardTitle>
              <CardDescription>
                The product keeps three layers separate: World worker verification, AgentBook
                registration, and IEX-specific onchain permissions plus reputation.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-3 rounded-xl border border-gray-800 bg-gray-950/70 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-white">1. Broker + worker authorization</p>
                    <p className="mt-1 text-xs text-gray-500">
                      Sign in, verify the worker role with World ID, and create the worker
                      authorization that binds the agent fingerprint to this wallet.
                    </p>
                  </div>
                  <Badge variant={authReady && isWorkerVerified && !!session ? 'success' : 'warning'}>
                    {authReady && isWorkerVerified && !!session ? 'Complete' : 'Required'}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  {!session && (
                    <Button onClick={handleSignIn} disabled={!isConnected || isSigningIn}>
                      {isSigningIn ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
                      Sign in
                    </Button>
                  )}
                  {!isWorkerVerified && (
                    demoMode ? (
                      <Button
                        variant="outline"
                        onClick={() => void handleWorkerVerify()}
                        disabled={!session}
                      >
                        <ShieldCheck className="h-4 w-4" />
                        Demo worker verify
                      </Button>
                    ) : (
                      <IDKitWidget
                        app_id={integrations?.world.appId ?? ''}
                        action={integrations?.world.action ?? ''}
                        signal={address}
                        verification_level={VerificationLevel.Device}
                        onSuccess={(result: ISuccessResult) => void handleWorkerVerify(result)}
                      >
                        {({ open }: { open: () => void }) => (
                          <Button variant="outline" onClick={open} disabled={!address || !integrations?.world.appId}>
                            <ShieldCheck className="h-4 w-4" />
                            Verify worker
                          </Button>
                        )}
                      </IDKitWidget>
                    )
                  )}
                  {!authReady && !!session && isWorkerVerified && (
                    <Button variant="outline" onClick={handleCreateAuthorization} disabled={isCreatingAuth}>
                      {isCreatingAuth ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                      Create authorization
                    </Button>
                  )}
                </div>
              </div>

              <div className="space-y-3 rounded-xl border border-gray-800 bg-gray-950/70 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-white">2. Register in AgentBook</p>
                    <p className="mt-1 text-xs text-gray-500">
                      Agent Kit uses AgentBook to resolve the wallet into an anonymous human ID at
                      request time. This app reads the official Worldchain AgentBook deployment.
                    </p>
                  </div>
                  <Badge variant={agentBookRegistered ? 'success' : 'warning'}>
                    {agentBookRegistered ? 'Registered' : 'Not registered'}
                  </Badge>
                </div>
                <pre className="overflow-x-auto rounded-lg border border-gray-800 bg-black/40 p-3 text-xs text-gray-200">
{agentKitStatus?.registrationCommand ?? (address ? `npx @worldcoin/agentkit-cli register ${address}` : 'Connect a wallet to generate the command')}
                </pre>
                <div className="flex flex-wrap gap-2">
                  {agentKitStatus?.registrationCommand && (
                    <Button
                      variant="outline"
                      onClick={() => void handleCopy(agentKitStatus.registrationCommand, 'register-command')}
                    >
                      <Copy className="h-4 w-4" />
                      {copyState === 'register-command' ? 'Copied' : 'Copy command'}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    asChild
                  >
                    <a href="https://docs.world.org/agents/agent-kit/integrate" target="_blank" rel="noreferrer">
                      <ExternalLink className="h-4 w-4" />
                      Docs
                    </a>
                  </Button>
                </div>
              </div>

              <div className="space-y-3 rounded-xl border border-gray-800 bg-gray-950/70 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-white">3. Sync IdentityGate role on Worldchain</p>
                    <p className="mt-1 text-xs text-gray-500">
                      The broker attestor mirrors the verified worker role into the deployed
                      IdentityGate contract so your wallet can call the onchain registry.
                    </p>
                  </div>
                  <Badge variant={worldchainRoleSynced ? 'success' : 'warning'}>
                    {worldchainRoleSynced ? 'Synced' : 'Pending'}
                  </Badge>
                </div>
                <Button
                  variant="outline"
                  onClick={handleSyncRole}
                  disabled={!session || !isWorkerVerified || !agentKitStatus?.worldchain.identityGateAddress || isSyncingRole}
                >
                  {isSyncingRole ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                  Sync worker role
                </Button>
              </div>

              <div className="space-y-3 rounded-xl border border-gray-800 bg-gray-950/70 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-white">4. Register in the IEX registry</p>
                    <p className="mt-1 text-xs text-gray-500">
                      This app keeps its own Worldchain registry for permission scope and reputation.
                      Registration is done from the wallet and then synced back into the broker.
                    </p>
                  </div>
                  <Badge variant={registryRegistered ? 'success' : 'warning'}>
                    {registryRegistered ? 'Registered' : 'Pending'}
                  </Badge>
                </div>
                <Button
                  onClick={handleRegisterOnChain}
                  disabled={
                    !workerAuthorization ||
                    !agentBookRegistered ||
                    !worldchainRoleSynced ||
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
            <Card className="border-gray-800 bg-gray-900/50">
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
                  value={workerAuthorization ? `${workerAuthorization.agentType} ${workerAuthorization.agentVersion ?? '1.0.0'}` : 'Create a worker authorization'}
                  ready={authReady}
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
              </CardContent>
            </Card>

            <Card className="border-gray-800 bg-gray-900/50">
              <CardHeader>
                <CardTitle className="text-white">Protected Agent Routes</CardTitle>
                <CardDescription>
                  Job discovery and task file retrieval now support a dedicated Agent Kit-protected
                  path for human-backed agents.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <pre className="overflow-x-auto rounded-lg border border-gray-800 bg-black/40 p-3 text-xs text-gray-200">
{`./apps/intelligence-exchange-cannes-worker/dist/iex-bridge agentkit-status
./apps/intelligence-exchange-cannes-worker/dist/iex-bridge list --status queued --agentkit
./apps/intelligence-exchange-cannes-worker/dist/iex-bridge status --job-id <job-id> --agentkit`}
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

        <Card className="border-gray-800 bg-gray-900/50">
          <CardHeader>
            <CardTitle className="text-white">Worldchain Wiring</CardTitle>
            <CardDescription>
              Local fork and live deployment both target World Chain so the same registration flow
              can be rehearsed before a real deployment.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-gray-800 bg-gray-950/70 p-4">
              <p className="text-sm font-semibold text-white">AgentBook</p>
              <p className="mt-1 text-xs text-gray-500">{shortHex(agentKitStatus?.agentBookContractAddress ?? integrations?.worldchain.agentBookContractAddress, 14, 10)}</p>
            </div>
            <div className="rounded-xl border border-gray-800 bg-gray-950/70 p-4">
              <p className="text-sm font-semibold text-white">Registry</p>
              <p className="mt-1 text-xs text-gray-500">{shortHex(integrations?.worldchain.agentRegistryAddress, 14, 10)}</p>
            </div>
          </CardContent>
        </Card>

        {[signInError, authError, worldError, syncError, registrationError]
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
