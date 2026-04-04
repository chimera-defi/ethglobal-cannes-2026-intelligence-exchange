import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { IDKitWidget, VerificationLevel, type ISuccessResult } from '@worldcoin/idkit';
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from 'wagmi';
import { erc20Abi, isAddress, parseUnits } from 'viem';
import {
  Wallet,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronRight,
  AlertCircle,
  Globe,
  FileText,
  DollarSign,
  Send,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  createIdea,
  fundIdea,
  getIntegrationsStatus,
  planIdea,
  verifyWorldRole,
  syncChainReceipt,
} from '../api';
import { useSession } from '../hooks/useSession';
import { makeDemoAddress, makeDemoTxHash, makeDemoWorldProof } from '../lib/demo';

// ─── Types ────────────────────────────────────────────────────────────────────

type FlowStep =
  | 'connect-wallet'
  | 'sign-in'
  | 'world-verify'
  | 'form'
  | 'fund'
  | 'funding'
  | 'plan'
  | 'planning'
  | 'reserve'
  | 'done'
  | 'error';

interface WorldProof {
  nullifierHash: string;
  proof: string;
  merkleRoot: string;
  verificationLevel: string;
}

interface IdeaForm {
  title: string;
  prompt: string;
  budgetUsdMax: number;
  taskType: 'coding' | 'analysis' | 'research' | 'summarization';
}

type RetryStep = 'fund' | 'plan';
type WalletFundingStatus = 'idle' | 'switching' | 'awaiting-signature' | 'confirming' | 'syncing';

const DEFAULT_ARC_CHAIN_ID = 5042002;
const USDC_DECIMALS = 6;

function formatUsdcAmount(amount: number) {
  return amount.toFixed(6).replace(/\.?0+$/, '');
}

// ─── Step metadata ────────────────────────────────────────────────────────────

const VISIBLE_STEPS: FlowStep[] = [
  'connect-wallet',
  'sign-in',
  'world-verify',
  'form',
  'fund',
  'plan',
  'reserve',
];

const STEP_LABELS: Partial<Record<FlowStep, string>> = {
  'connect-wallet': 'Connect',
  'sign-in': 'Sign In',
  'world-verify': 'Verify',
  'form': 'Details',
  'fund': 'Fund',
  'plan': 'Plan',
  'reserve': 'Reserve',
};

// ─── Gate-check helper ────────────────────────────────────────────────────────

interface GateStatus {
  ok: boolean;
  label: string;
}

function GateRow({ ok, label }: GateStatus) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {ok ? (
        <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
      ) : (
        <XCircle className="w-4 h-4 text-red-400 shrink-0" />
      )}
      <span className={ok ? 'text-gray-300' : 'text-gray-500'}>{label}</span>
    </div>
  );
}

// ─── Horizontal Stepper ───────────────────────────────────────────────────────

function HorizontalStepper({ steps, activeIndex }: { steps: string[]; activeIndex: number }) {
  return (
    <div className="flex items-center w-full mb-6">
      {steps.map((label, i) => (
        <div key={label} className="flex items-center flex-1 last:flex-none">
          <div className="flex flex-col items-center gap-1">
            <div
              className={cn(
                'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors',
                i <= activeIndex
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-slate-700 text-slate-400'
              )}
            >
              {i + 1}
            </div>
            <span
              className={cn(
                'text-xs whitespace-nowrap',
                i <= activeIndex ? 'text-primary' : 'text-slate-500'
              )}
            >
              {label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div
              className={cn(
                'flex-1 h-px mx-1 mb-4 transition-colors',
                i < activeIndex ? 'bg-primary' : 'bg-slate-700'
              )}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function IdeaSubmission() {
  const navigate = useNavigate();
  const { isConnected, address, session, isPosterVerified, signIn, isSessionLoading, refreshSession } =
    useSession();
  const { chainId } = useAccount();
  const publicClient = usePublicClient();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();

  const [step, setStep] = useState<FlowStep>(() => {
    if (!isConnected) return 'connect-wallet';
    if (!session) return 'sign-in';
    if (!isPosterVerified) return 'world-verify';
    return 'form';
  });

  const [error, setError] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [ideaId, setIdeaId] = useState<string | null>(null);
  const [worldProof, setWorldProof] = useState<WorldProof | null>(null);
  const [fundTxHash, setFundTxHash] = useState('');
  const [reservationSynced, setReservationSynced] = useState(false);
  const [demoPosterMode, setDemoPosterMode] = useState(false);
  const [retryStep, setRetryStep] = useState<RetryStep>('fund');
  const [walletFundingStatus, setWalletFundingStatus] = useState<WalletFundingStatus>('idle');

  const [form, setForm] = useState<IdeaForm>({
    title: '',
    prompt: '',
    budgetUsdMax: 10,
    taskType: 'coding',
  });

  const { data: integrations, isLoading: integrationsLoading } = useQuery({
    queryKey: ['integrations-status'],
    queryFn: getIntegrationsStatus,
    staleTime: 30_000,
  });

  const worldLive = Boolean(
    integrations?.world.mode === 'live' &&
      integrations.world.appId &&
      integrations.world.action
  );
  const demoPosterAvailable = integrations?.world.strict === false;
  const demoPosterAddress = makeDemoAddress('demo-poster:web');
  const arcChainId = integrations?.arc.chainId ?? DEFAULT_ARC_CHAIN_ID;
  const escrowContractAddress = integrations?.arc.escrowContractAddress ?? null;
  const usdcAddress = integrations?.arc.usdcAddress ?? null;
  const walletFundingAvailable = !demoPosterMode && Boolean(escrowContractAddress && usdcAddress);
  const walletFundingStatusMessage = {
    switching: `Switching your wallet to Arc chain ${arcChainId}.`,
    'awaiting-signature': 'Approve the USDC transfer in your wallet.',
    confirming: 'Waiting for the Arc transaction confirmation.',
    syncing: 'Funding confirmed. Syncing the idea with the broker.',
    idle: null,
  }[walletFundingStatus];

  function getBudgetAmountUsd() {
    const amountUsd = Number(form.budgetUsdMax);
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
      throw new Error('Enter a valid USDC budget before funding the escrow.');
    }
    return amountUsd;
  }

  // Derive the current effective step based on auth state transitions
  function getEffectiveStep(): FlowStep {
    if (demoPosterMode && demoPosterAvailable) {
      return ['connect-wallet', 'sign-in', 'world-verify'].includes(step) ? 'form' : step;
    }
    if (!isConnected) return 'connect-wallet';
    if (!session) return 'sign-in';
    if (!isPosterVerified) return 'world-verify';
    return step;
  }

  const effectiveStep = getEffectiveStep();
  const visibleIndex = VISIBLE_STEPS.indexOf(effectiveStep);

  // ─── World ID handlers ──────────────────────────────────────────────────────

  async function handleWorldVerifyLive(result: ISuccessResult) {
    setIsWorking(true);
    setError(null);
    try {
      const proof = {
        nullifierHash: result.nullifier_hash,
        proof: result.proof,
        merkleRoot: result.merkle_root,
        verificationLevel: result.verification_level,
      };
      await verifyWorldRole('poster', proof);
      await refreshSession();
      setWorldProof(proof);
      setStep('form');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'World verification failed');
    } finally {
      setIsWorking(false);
    }
  }

  async function handleWorldVerifyDemo() {
    setIsWorking(true);
    setError(null);
    try {
      const demoProof: WorldProof = {
        nullifierHash: '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(''),
        proof: '0xdemo-proof',
        merkleRoot: '0xdemo-root',
        verificationLevel: 'device',
      };
      await verifyWorldRole('poster', demoProof);
      await refreshSession();
      setWorldProof(demoProof);
      setStep('form');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'World verification failed');
    } finally {
      setIsWorking(false);
    }
  }

  // ─── Sign-in handler ────────────────────────────────────────────────────────

  async function handleSignIn() {
    setIsWorking(true);
    setError(null);
    try {
      await signIn();
      // useSession invalidates queries; step will advance on re-render via getEffectiveStep
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
    } finally {
      setIsWorking(false);
    }
  }

  // ─── Form submit ────────────────────────────────────────────────────────────

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.prompt.trim()) return;
    setStep('fund');
  }

  // ─── Fund ───────────────────────────────────────────────────────────────────

  async function createAndSyncIdeaFunding(fundingHash: string) {
    setError(null);
    setRetryStep('fund');
    setIsWorking(true);
    setWalletFundingStatus('syncing');
    setStep('funding');

    try {
      const amountUsd = getBudgetAmountUsd();
      let nextIdeaId = ideaId;

      if (!nextIdeaId) {
        const idea = await createIdea({
          taskType: form.taskType,
          title: form.title,
          prompt: form.prompt,
          budgetUsdMax: amountUsd,
          ...(demoPosterMode
            ? {
                posterAccountAddress: demoPosterAddress,
                worldIdProof: makeDemoWorldProof(demoPosterAddress),
              }
            : {}),
        });

        nextIdeaId = idea.ideaId;
        setIdeaId(nextIdeaId);
      }

      await fundIdea(nextIdeaId, fundingHash, amountUsd);
      setStep('plan');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Funding failed');
      setStep('error');
    } finally {
      setIsWorking(false);
      setWalletFundingStatus('idle');
    }
  }

  async function handleCreateAndFund() {
    const fundingHash = fundTxHash.trim()
      || (demoPosterMode ? makeDemoTxHash(`fund:${form.title}:${form.budgetUsdMax}`) : '');
    if (!fundingHash) {
      setError('Enter the wallet transaction hash from the Arc escrow deposit.');
      return;
    }
    if (!/^0x[0-9a-fA-F]{64}$/.test(fundingHash)) {
      setError('Transaction hash must be a 0x-prefixed 32-byte hex string.');
      return;
    }
    setError(null);
    if (demoPosterMode && !fundTxHash.trim()) {
      setFundTxHash(fundingHash);
    }
    await createAndSyncIdeaFunding(fundingHash);
  }

  async function handleWalletFundEscrow() {
    if (!address) {
      setError('Connect a wallet before funding the escrow.');
      return;
    }
    if (!publicClient) {
      setError('Arc RPC client is unavailable in this environment.');
      return;
    }
    if (!escrowContractAddress || !usdcAddress) {
      setError('Arc escrow funding is not configured for this environment.');
      return;
    }
    if (!isAddress(escrowContractAddress) || !isAddress(usdcAddress)) {
      setError('Arc funding addresses are misconfigured.');
      return;
    }

    let amountUsd: number;
    try {
      amountUsd = getBudgetAmountUsd();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid escrow funding amount');
      return;
    }

    setError(null);
    setRetryStep('fund');
    setIsWorking(true);
    setWalletFundingStatus(chainId === arcChainId ? 'awaiting-signature' : 'switching');

    try {
      if (chainId !== arcChainId) {
        if (!switchChainAsync) {
          throw new Error(`Switch your wallet to Arc chain ${arcChainId} before funding the escrow.`);
        }
        await switchChainAsync({ chainId: arcChainId });
      }

      setWalletFundingStatus('awaiting-signature');
      const txHash = await writeContractAsync({
        address: usdcAddress,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [escrowContractAddress, parseUnits(formatUsdcAmount(amountUsd), USDC_DECIMALS)],
        chainId: arcChainId,
      });

      setFundTxHash(txHash);
      setWalletFundingStatus('confirming');

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status !== 'success') {
        throw new Error('Escrow funding transaction reverted on Arc.');
      }

      await createAndSyncIdeaFunding(txHash);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Wallet funding failed');
    } finally {
      setIsWorking(false);
      setWalletFundingStatus('idle');
    }
  }

  // ─── Plan ───────────────────────────────────────────────────────────────────

  async function handlePlan() {
    if (!ideaId) return;
    setError(null);
    setRetryStep('plan');
    setIsWorking(true);
    setStep('planning');

    try {
      await planIdea(ideaId);
      if (demoPosterAvailable) {
        setReservationSynced(true);
        setStep('done');
        return;
      }
      setStep('reserve');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Planning failed');
      setStep('error');
    } finally {
      setIsWorking(false);
    }
  }

  // ─── Reserve milestone sync ─────────────────────────────────────────────────

  const [reserveTxHash, setReserveTxHash] = useState('');
  const [reserveJobIds, setReserveJobIds] = useState('');

  async function handleSyncReservation() {
    if (!ideaId) {
      setError('Create and plan the idea before syncing milestone reservation.');
      return;
    }
    if (!reserveTxHash.trim()) {
      setError('Enter the reservation transaction hash.');
      return;
    }
    if (!/^0x[0-9a-fA-F]{64}$/.test(reserveTxHash.trim())) {
      setError('Transaction hash must be a 0x-prefixed 32-byte hex string.');
      return;
    }
    const jobIds = reserveJobIds
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    if (jobIds.length === 0) {
      setError('Enter at least one job ID for the milestone reservation.');
      return;
    }
    setError(null);
    setIsWorking(true);

    try {
      await syncChainReceipt({
        eventType: 'milestone_reserved',
        txHash: reserveTxHash.trim(),
        subjectId: ideaId,
        payload: { jobIds },
      });
      setReservationSynced(true);
      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reservation sync failed');
    } finally {
      setIsWorking(false);
    }
  }

  // ─── Skip reservation sync ──────────────────────────────────────────────────

  function handleSkipReservation() {
    setReservationSynced(false);
    setStep('done');
  }

  function handleEnterDemoPosterMode() {
    setDemoPosterMode(true);
    setError(null);
    setStep('form');
  }

  function handleExitDemoPosterMode() {
    setDemoPosterMode(false);
    setError(null);
    setStep(isConnected ? (session ? (isPosterVerified ? 'form' : 'world-verify') : 'sign-in') : 'connect-wallet');
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  if (step === 'done' && ideaId) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <Card className="max-w-lg w-full">
          <CardContent className="pt-8 pb-8 text-center space-y-6">
            <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto" />
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-white">
                {reservationSynced ? 'Idea Funded, Planned, and Reserved' : 'Idea Funded and Planned'}
              </h1>
              <p className="text-gray-400 text-sm">
                {reservationSynced
                  ? 'Milestones are queued on-chain. Agent workers can now claim and execute them.'
                  : 'Milestones are planned but not yet queued. Workers cannot claim until reservation is synced.'}
              </p>
            </div>
            <div className="bg-gray-800 rounded-lg p-3 text-left text-xs font-mono text-gray-300 break-all">
              Idea ID: {ideaId}
            </div>
            <div className="flex gap-3 justify-center flex-wrap">
              <Button onClick={() => navigate(`/ideas/${ideaId}`)}>
                View Dashboard <ChevronRight className="w-4 h-4" />
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setStep('form');
                  setIdeaId(null);
                  setWorldProof(null);
                  setFundTxHash('');
                  setReserveTxHash('');
                  setReserveJobIds('');
                  setReservationSynced(false);
                  setRetryStep('fund');
                  setWalletFundingStatus('idle');
                  setForm({ title: '', prompt: '', budgetUsdMax: 10, taskType: 'coding' });
                }}
              >
                Submit Another
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <Card className="max-w-lg w-full">
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <XCircle className="w-12 h-12 text-red-400 mx-auto" />
            <h1 className="text-xl font-bold text-red-400">Something went wrong</h1>
            <p className="text-gray-400 text-sm font-mono break-all">{error}</p>
            <div className="flex gap-3 justify-center">
              <Button
                variant="secondary"
                onClick={() => {
                  setError(null);
                  setStep(retryStep);
                }}
              >
                Try Again
              </Button>
              <Button variant="ghost" onClick={() => navigate('/')}>
                Go Home
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-2xl w-full space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-white">Post an Idea</h1>
          <p className="text-gray-400 mt-1 text-sm">
            Fund your idea through the escrow. Verified agents claim and deliver the milestones.
          </p>
        </div>
        {demoPosterAvailable && (
          <div className="bg-blue-900/20 border border-blue-800 rounded-lg px-3 py-2 text-blue-200 text-sm flex items-center justify-between gap-3">
            <span>
              Demo mode is enabled. You can use a browser-only poster flow with generated proof and tx hashes.
            </span>
            <Button
              size="sm"
              variant={demoPosterMode ? 'secondary' : 'outline'}
              onClick={demoPosterMode ? handleExitDemoPosterMode : handleEnterDemoPosterMode}
            >
              {demoPosterMode ? 'Use Wallet Flow' : 'Use Demo Poster Mode'}
            </Button>
          </div>
        )}

        {/* Progress stepper */}
        <HorizontalStepper
          steps={VISIBLE_STEPS.map((s) => STEP_LABELS[s] ?? s)}
          activeIndex={visibleIndex}
        />

        {/* Error banner */}
        {error && (
          <div className="flex items-start gap-2 bg-red-950 border border-red-800 rounded-lg p-3 text-red-300 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="break-all">{error}</span>
          </div>
        )}

        {/* Step: Connect Wallet */}
        {effectiveStep === 'connect-wallet' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="w-5 h-5 text-blue-400" />
                Connect Your Wallet
              </CardTitle>
              <CardDescription>
                A connected wallet is required to sign the broker session and fund the escrow.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <GateRow ok={isConnected} label="Wallet connected" />
                <GateRow ok={!!session} label="Broker session active" />
                <GateRow ok={isPosterVerified} label="Poster World ID verified" />
              </div>
              <ConnectButton />
              {demoPosterAvailable && (
                <Button variant="secondary" className="w-full" onClick={handleEnterDemoPosterMode}>
                  Continue in Demo Poster Mode
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step: Sign In */}
        {effectiveStep === 'sign-in' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-blue-400" />
                Sign In to Broker
              </CardTitle>
              <CardDescription>
                Sign a wallet challenge to establish an authenticated session. The session cookie
                is set by the broker — it is not stored in local storage.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <GateRow ok={isConnected} label={`Wallet connected (${address ? address.slice(0, 8) + '…' + address.slice(-6) : ''})`} />
                <GateRow ok={!!session} label="Broker session active" />
              </div>
              <Button
                onClick={handleSignIn}
                disabled={isWorking || isSessionLoading}
                className="w-full"
              >
                {isWorking || isSessionLoading ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <ShieldCheck className="w-4 h-4" />
                )}
                Sign In with Wallet
              </Button>
              {demoPosterAvailable && (
                <Button variant="secondary" className="w-full" onClick={handleEnterDemoPosterMode}>
                  Skip to Demo Poster Mode
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step: World Verification */}
        {effectiveStep === 'world-verify' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="w-5 h-5 text-blue-400" />
                Verify Poster Identity
              </CardTitle>
              <CardDescription>
                World ID proof is verified server-side by the broker before idea creation is
                allowed. This prevents Sybil abuse of the escrow system.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <GateRow ok={isConnected} label="Wallet connected" />
                <GateRow ok={!!session} label="Broker session active" />
                <GateRow ok={isPosterVerified} label="Poster World ID verified" />
              </div>

              {worldLive ? (
                <IDKitWidget
                  app_id={integrations!.world.appId!}
                  action={integrations!.world.action!}
                  onSuccess={() => undefined}
                  handleVerify={handleWorldVerifyLive}
                  verification_level={VerificationLevel.Orb}
                >
                  {({ open }: { open: () => void }) => (
                    <Button
                      className="w-full"
                      onClick={open}
                      disabled={isWorking || integrationsLoading}
                    >
                      {isWorking ? <Loader2 className="animate-spin" /> : <Globe className="w-4 h-4" />}
                      Verify with World ID
                    </Button>
                  )}
                </IDKitWidget>
              ) : (
                <div className="space-y-3">
                  <Button
                    className="w-full"
                    onClick={handleWorldVerifyDemo}
                    disabled={isWorking}
                  >
                    {isWorking ? <Loader2 className="animate-spin" /> : <Globe className="w-4 h-4" />}
                    Verify with World ID (Demo Mode)
                  </Button>
                  <p className="text-xs text-gray-500 text-center">
                    Demo mode: broker still receives and stores the proof. A real Orb proof is
                    required when World credentials are configured.
                  </p>
                </div>
              )}
              {demoPosterAvailable && (
                <Button variant="secondary" className="w-full" onClick={handleEnterDemoPosterMode}>
                  Use Demo Poster Mode Instead
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step: Idea Form */}
        {effectiveStep === 'form' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-400" />
                Idea Details
              </CardTitle>
              <CardDescription>
                Describe what you want built. Be specific — agents use this to plan milestones.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleFormSubmit} className="space-y-4">
                <div className="flex items-center gap-2 text-xs text-green-400 mb-2">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>
                    Posting as {demoPosterMode
                      ? `${demoPosterAddress.slice(0, 8)}…${demoPosterAddress.slice(-6)}`
                      : address
                      ? `${address.slice(0, 8)}…${address.slice(-6)}`
                      : 'browser demo poster'}
                  </span>
                  {!demoPosterMode && isPosterVerified && (
                    <Badge variant="success" className="ml-1">Poster Verified</Badge>
                  )}
                  {demoPosterMode && (
                    <Badge variant="warning" className="ml-1">Demo Poster</Badge>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    placeholder="e.g. Build a DeFi yield optimizer for Uniswap v4"
                    value={form.title}
                    onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="prompt">Describe what you want built</Label>
                  <Textarea
                    id="prompt"
                    className="min-h-32 resize-none"
                    placeholder="Be specific. Include tech stack, acceptance criteria, and what a good output looks like…"
                    value={form.prompt}
                    onChange={e => setForm(f => ({ ...f, prompt: e.target.value }))}
                    required
                    minLength={10}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="taskType">Task Type</Label>
                    <select
                      id="taskType"
                      className="flex h-9 w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-1 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                      value={form.taskType}
                      onChange={e =>
                        setForm(f => ({ ...f, taskType: e.target.value as IdeaForm['taskType'] }))
                      }
                    >
                      <option value="coding">Coding</option>
                      <option value="analysis">Analysis</option>
                      <option value="research">Research</option>
                      <option value="summarization">Summarization</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="budget">Budget (USDC)</Label>
                    <Input
                      id="budget"
                      type="number"
                      min={1}
                      max={1000}
                      step={0.5}
                      value={form.budgetUsdMax}
                      onChange={e =>
                        setForm(f => ({ ...f, budgetUsdMax: parseFloat(e.target.value) }))
                      }
                    />
                  </div>
                </div>

                <Button type="submit" className="w-full text-base" size="lg">
                  Continue to Funding
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Step: Fund */}
        {effectiveStep === 'fund' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-blue-400" />
                Fund the Escrow
              </CardTitle>
              <CardDescription>
                Fund the Arc escrow from your connected wallet or paste an existing deposit hash.
                The broker syncs the funding event using the confirmed Arc transaction.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2 bg-gray-800/50 rounded-lg p-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Idea</span>
                  <span className="text-white font-medium truncate ml-4">{form.title}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Budget</span>
                  <span className="text-white font-bold">${form.budgetUsdMax} USDC</span>
                </div>
                {integrations?.arc.escrowContractAddress && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Escrow Contract</span>
                    <span className="text-white font-mono text-xs break-all ml-4">
                      {integrations.arc.escrowContractAddress}
                    </span>
                  </div>
                )}
                {integrations?.arc.usdcAddress && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">USDC Contract</span>
                    <span className="text-white font-mono text-xs break-all ml-4">
                      {integrations.arc.usdcAddress}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-400">Arc Chain ID</span>
                  <span className="text-white font-mono">
                    {arcChainId}
                  </span>
                </div>
              </div>

              {!demoPosterMode && (
                <div className="space-y-3 rounded-lg border border-gray-800 bg-gray-900/60 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="text-sm font-semibold text-white">Fund directly from wallet</div>
                      <p className="text-xs text-gray-400">
                        Send {form.budgetUsdMax} USDC to the configured escrow contract and reuse the
                        confirmed tx hash automatically.
                      </p>
                    </div>
                    <Badge variant="info">Wallet</Badge>
                  </div>

                  <Button
                    className="w-full text-base"
                    size="lg"
                    onClick={handleWalletFundEscrow}
                    disabled={isWorking || !walletFundingAvailable}
                  >
                    {isWorking && walletFundingStatus !== 'idle' ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Wallet className="w-4 h-4" />
                    )}
                    Fund Escrow from Wallet
                  </Button>

                  <p className="text-xs text-gray-500">
                    {walletFundingStatusMessage
                      ?? (walletFundingAvailable
                        ? 'Your wallet will request a USDC transfer first, then the broker will sync the confirmed tx automatically.'
                        : 'Direct wallet funding is unavailable until both the Arc escrow and USDC contract addresses are configured.')}
                  </p>
                </div>
              )}

              <div className="relative py-1">
                <div className="h-px bg-gray-800" />
                <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-gray-950 px-3 text-xs text-gray-500">
                  or sync an existing deposit
                </span>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="fundTxHash">Funding Transaction Hash</Label>
                <Input
                  id="fundTxHash"
                  placeholder="0x…64 hex chars"
                  value={fundTxHash}
                  onChange={e => setFundTxHash(e.target.value)}
                  className="font-mono text-xs"
                  disabled={isWorking}
                />
                <p className="text-xs text-gray-500">
                  Paste a real Arc transaction hash if you already funded the escrow outside this flow.
                </p>
                {demoPosterAvailable && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="px-0 text-xs text-blue-400 hover:text-blue-300"
                    onClick={() => setFundTxHash(makeDemoTxHash(`fund:${form.title}:${form.budgetUsdMax}`))}
                  >
                    Use demo tx hash
                  </Button>
                )}
              </div>

              <Button
                className="w-full text-base"
                size="lg"
                onClick={handleCreateAndFund}
                disabled={isWorking || !fundTxHash.trim()}
              >
                {isWorking ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <DollarSign className="w-4 h-4" />
                )}
                Create Idea and Sync Existing Funding
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Step: Funding in progress */}
        {effectiveStep === 'funding' && (
          <Card>
            <CardContent className="text-center space-y-4 py-12">
              <Loader2 className="animate-spin w-10 h-10 text-blue-400 mx-auto" />
              <h2 className="text-xl font-semibold text-white">Syncing funding…</h2>
              <p className="text-gray-400 text-sm">
                Creating the idea record and syncing the escrow funding event with the broker.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Step: Plan */}
        {effectiveStep === 'plan' && ideaId && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-400" />
                Generate BuildBrief
              </CardTitle>
              <CardDescription>
                The broker will decompose your idea into milestone jobs that agents can claim.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-green-400">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Idea created and funded — ID: <span className="font-mono text-xs">{ideaId}</span></span>
              </div>
              {demoPosterAvailable && (
                <p className="text-xs text-blue-300 bg-blue-900/20 border border-blue-800 rounded-lg px-3 py-2">
                  Demo mode auto-queues milestone reservations after planning, so the browser can continue without a manual reservation tx.
                </p>
              )}
              <Button className="w-full text-base" size="lg" onClick={handlePlan} disabled={isWorking}>
                {isWorking ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                Generate Milestone Plan
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Step: Planning in progress */}
        {effectiveStep === 'planning' && (
          <Card>
            <CardContent className="text-center space-y-4 py-12">
              <Loader2 className="animate-spin w-10 h-10 text-blue-400 mx-auto" />
              <h2 className="text-xl font-semibold text-white">Generating BuildBrief…</h2>
              <p className="text-gray-400 text-sm">
                Decomposing your idea into agent-claimable milestone jobs.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Step: Reserve milestones */}
        {effectiveStep === 'reserve' && ideaId && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-blue-400" />
                Sync Milestone Reservation
              </CardTitle>
              <CardDescription>
                After the batch milestone reservation transaction confirms on Arc, sync the tx hash
                here. This advances each job from <Badge variant="created" className="inline-flex">created</Badge>{' '}
                to <Badge variant="queued" className="inline-flex">queued</Badge> so workers can claim them.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-green-400">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>
                  BuildBrief generated — milestones created. Idea ID:{' '}
                  <span className="font-mono text-xs">{ideaId}</span>
                </span>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="reserveTxHash">Reservation Transaction Hash</Label>
                <Input
                  id="reserveTxHash"
                  placeholder="0x…64 hex chars"
                  value={reserveTxHash}
                  onChange={e => setReserveTxHash(e.target.value)}
                  className="font-mono text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="reserveJobIds">Job IDs (comma-separated)</Label>
                <Input
                  id="reserveJobIds"
                  placeholder="job_abc123, job_def456, …"
                  value={reserveJobIds}
                  onChange={e => setReserveJobIds(e.target.value)}
                  className="font-mono text-xs"
                />
                <p className="text-xs text-gray-500">
                  Find the job IDs in the idea dashboard after planning completes.
                </p>
              </div>

              <div className="flex gap-3">
                <Button
                  className="flex-1"
                  onClick={handleSyncReservation}
                  disabled={isWorking || !reserveTxHash.trim()}
                >
                  {isWorking ? <Loader2 className="animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                  Sync Reservation
                </Button>
                <Button
                  variant="outline"
                  onClick={handleSkipReservation}
                  disabled={isWorking}
                  title="Navigate to the idea dashboard and sync the reservation from there later"
                >
                  Skip for Now
                </Button>
              </div>

              <p className="text-xs text-gray-500 text-center">
                Skipping leaves jobs in <span className="font-mono">created</span> state. Workers
                cannot claim until reservation is synced.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
