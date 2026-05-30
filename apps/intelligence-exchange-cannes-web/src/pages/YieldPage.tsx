import { useState } from 'react';
import { useAccount, useReadContract, useReadContracts, useWriteContract, useSwitchChain } from 'wagmi';
import { parseUnits, formatUnits, type Address } from 'viem';
import { Loader2, TrendingUp, ArrowRight, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { NavLink } from 'react-router-dom';
import { intelTokenAbi, intelStakingAbi } from '../lib/intelStakingAbi';
import { isArcEnabled } from '../config';

const INTEL_TOKEN_ADDRESS = (import.meta.env.VITE_INTEL_TOKEN_ADDRESS ?? '') as Address;
const INTEL_STAKING_ADDRESS = (import.meta.env.VITE_INTEL_STAKING_ADDRESS ?? '') as Address;
const LIQUIDITY_MINING_ADDRESS = (import.meta.env.VITE_LIQUIDITY_MINING_ADDRESS ?? '') as Address;
const INTEL_DECIMALS = 18;

const CONTRACT_CHAIN_ID = isArcEnabled() ? Number(import.meta.env.VITE_ARC_CHAIN_ID ?? '5042002') : 0;

const liquidityMiningAbi = [
  { name: 'stake', type: 'function', inputs: [{ type: 'uint256' }] },
  { name: 'unstake', type: 'function', inputs: [{ type: 'uint256' }] },
  { name: 'claimRewards', type: 'function', inputs: [] },
  { name: 'totalStaked', type: 'function', outputs: [{ type: 'uint256' }] },
  { name: 'rewardRate', type: 'function', outputs: [{ type: 'uint256' }] },
  { name: 'pendingReward', type: 'function', inputs: [{ name: '', type: 'address' }], outputs: [{ type: 'uint256' }] },
] as const;

function fmt(raw: bigint | undefined, decimals = 4): string {
  if (raw === undefined) return '—';
  const n = Number(formatUnits(raw, INTEL_DECIMALS));
  return n.toLocaleString(undefined, { maximumFractionDigits: decimals });
}

function secondsToDuration(s: bigint): string {
  const n = Number(s);
  if (n >= 86400) return `${Math.floor(n / 86400)}d ${Math.floor((n % 86400) / 3600)}h`;
  if (n >= 3600) return `${Math.floor(n / 3600)}h ${Math.floor((n % 3600) / 60)}m`;
  return `${Math.floor(n / 60)}m`;
}

export function YieldPage() {
  const { address, isConnected, chain } = useAccount();
  const { switchChain } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();

  const [lpStakeInput, setLpStakeInput] = useState('');
  const [lpUnstakeInput, setLpUnstakeInput] = useState('');
  const [txStatus, setTxStatus] = useState<{ msg: string; type: 'success' | 'error' | 'pending' } | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  const stakingDeployed = Boolean(INTEL_TOKEN_ADDRESS && INTEL_STAKING_ADDRESS);
  const lpMiningDeployed = Boolean(LIQUIDITY_MINING_ADDRESS);
  const wrongChain = isConnected && chain?.id !== CONTRACT_CHAIN_ID;

  // Read staking contract state
  const { data: stakingData } = useReadContracts({
    contracts: [
      { address: INTEL_STAKING_ADDRESS, abi: intelStakingAbi, functionName: 'totalStaked' },
      { address: INTEL_STAKING_ADDRESS, abi: intelStakingAbi, functionName: 'currentEpoch' },
      { address: INTEL_STAKING_ADDRESS, abi: intelStakingAbi, functionName: 'epochLength' },
      { address: INTEL_STAKING_ADDRESS, abi: intelStakingAbi, functionName: 'cooldown' },
    ],
    query: { enabled: stakingDeployed },
  });

  const totalStaked = stakingData?.[0]?.result as bigint | undefined;
  const currentEpoch = stakingData?.[1]?.result as bigint | undefined;
  const epochLength = stakingData?.[2]?.result as bigint | undefined;
  const cooldownSeconds = stakingData?.[3]?.result as bigint | undefined;

  // Read LP mining contract state
  const { data: lpMiningData, refetch: refetchLpMining } = useReadContracts({
    contracts: [
      { address: LIQUIDITY_MINING_ADDRESS, abi: liquidityMiningAbi, functionName: 'totalStaked' },
      { address: LIQUIDITY_MINING_ADDRESS, abi: liquidityMiningAbi, functionName: 'rewardRate' },
    ],
    query: { enabled: lpMiningDeployed },
  });

  const { data: lpWalletData, refetch: refetchLpWallet } = useReadContracts({
    contracts: address ? [
      { address: LIQUIDITY_MINING_ADDRESS, abi: liquidityMiningAbi, functionName: 'pendingReward', args: [address] },
    ] : [],
    query: { enabled: lpMiningDeployed && Boolean(address), refetchInterval: 15_000 },
  });

  const lpTotalStaked = lpMiningData?.[0]?.result as bigint | undefined;
  const lpRewardRate = lpMiningData?.[1]?.result as bigint | undefined;
  const lpPendingReward = lpWalletData?.[0]?.result as bigint | undefined;

  const refetchLp = () => { void refetchLpMining(); void refetchLpWallet(); };

  async function withTx(label: string, fn: () => Promise<`0x${string}`>) {
    setLoading(label);
    setTxStatus({ msg: `${label}…`, type: 'pending' });
    try {
      const hash = await fn();
      setTxStatus({ msg: `${label} submitted: ${hash.slice(0, 18)}…`, type: 'success' });
      setTimeout(refetchLp, 3000);
    } catch (e: unknown) {
      const msg = (e as { shortMessage?: string; message?: string }).shortMessage ?? (e as Error).message ?? 'Unknown error';
      setTxStatus({ msg: `${label} failed: ${msg}`, type: 'error' });
    } finally {
      setLoading(null);
    }
  }

  async function handleLpApproveAndStake() {
    if (!address) return;
    const amount = parseUnits(lpStakeInput, INTEL_DECIMALS);
    if (amount <= 0n) return;

    await withTx('Staking INTEL', () =>
      writeContractAsync({ address: LIQUIDITY_MINING_ADDRESS, abi: liquidityMiningAbi, functionName: 'stake', args: [amount] })
    );
    setLpStakeInput('');
  }

  async function handleLpUnstake() {
    const amount = parseUnits(lpUnstakeInput, INTEL_DECIMALS);
    if (amount <= 0n) return;
    await withTx('Unstaking', () =>
      writeContractAsync({ address: LIQUIDITY_MINING_ADDRESS, abi: liquidityMiningAbi, functionName: 'unstake', args: [amount] })
    );
    setLpUnstakeInput('');
  }

  async function handleLpClaimRewards() {
    await withTx('Claiming rewards', () =>
      writeContractAsync({ address: LIQUIDITY_MINING_ADDRESS, abi: liquidityMiningAbi, functionName: 'claimRewards' })
    );
  }

  return (
    <div className="min-h-screen bg-[#070D1A] text-white">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Yield Opportunities</h1>
          <p className="text-slate-400 text-sm mt-1">
            All INTEL yield sources in one place. Every reward stream is tied to real protocol activity.
          </p>
        </div>

        {!stakingDeployed && !lpMiningDeployed && (
          <Alert className="border-amber-700 bg-amber-900/20">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            <AlertDescription className="text-amber-300">
              Yield contracts are not yet deployed. Set environment variables after contract deployment.
            </AlertDescription>
          </Alert>
        )}

        {wrongChain && (
          <Alert className="border-amber-700 bg-amber-900/20">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            <AlertDescription className="text-amber-300 flex items-center gap-3">
              Switch to Arc Testnet to interact with yield contracts.
              <Button size="sm" variant="outline" className="border-amber-600 text-amber-300 h-7 text-xs"
                onClick={() => void switchChain({ chainId: CONTRACT_CHAIN_ID })}>
                Switch Network
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {txStatus && (
          <Alert className={txStatus.type === 'error' ? 'border-red-700 bg-red-900/20' : txStatus.type === 'success' ? 'border-green-700 bg-green-900/20' : 'border-blue-700 bg-blue-900/20'}>
            <AlertDescription className={txStatus.type === 'error' ? 'text-red-300' : txStatus.type === 'success' ? 'text-green-300' : 'text-blue-300'}>
              {txStatus.msg}
            </AlertDescription>
          </Alert>
        )}

        {/* CARD 1: INTEL Staking */}
        <Card className="border-l-2 border-blue-500 border-slate-800 bg-[#0D1625] rounded-md">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base text-white">INTEL Staking</CardTitle>
              <Badge variant="success" className="text-xs">Live</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-300">
              Stake INTEL to earn 9% of every accepted task settlement + 45% of ETH mint proceeds as yield.
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-xs text-slate-500">APR Estimate</p>
                <p className="text-sm font-semibold text-white mt-0.5">
                  {stakingDeployed ? '—' : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Epoch</p>
                <p className="text-sm font-semibold text-white mt-0.5">{currentEpoch?.toString() ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Cooldown</p>
                <p className="text-sm font-semibold text-white mt-0.5">
                  {cooldownSeconds ? secondsToDuration(cooldownSeconds) : '—'}
                </p>
              </div>
            </div>
            <NavLink to="/staking">
              <Button variant="outline" className="w-full border-slate-600 text-slate-300">
                Go to Staking <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </NavLink>
          </CardContent>
        </Card>

        {/* CARD 2: LP Mining */}
        <Card className="border-l-2 border-emerald-500 border-slate-800 bg-[#0D1625] rounded-md">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base text-white">LP Mining</CardTitle>
              <Badge variant="info" className="text-xs">New</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {!lpMiningDeployed && (
              <Alert className="border-amber-700 bg-amber-900/20">
                <AlertTriangle className="h-4 w-4 text-amber-400" />
                <AlertDescription className="text-amber-300">
                  Liquidity mining contract not yet deployed. Set <code className="font-mono text-xs">VITE_LIQUIDITY_MINING_ADDRESS</code>.
                </AlertDescription>
              </Alert>
            )}
            <p className="text-sm text-slate-300">
              20% of every BuybackBurn run + POL fee collection funds this pool. Stake INTEL to earn a share of protocol buyback revenue.
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-xs text-slate-500">Total Staked</p>
                <p className="text-sm font-semibold text-white mt-0.5">{fmt(lpTotalStaked)} INTEL</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Reward Rate</p>
                <p className="text-sm font-semibold text-white mt-0.5">{lpRewardRate ? `${formatUnits(lpRewardRate, 18)} INTEL/s` : '—'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Your Stake</p>
                <p className="text-sm font-semibold text-white mt-0.5">—</p>
              </div>
            </div>
            {lpMiningDeployed && (
              <>
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      min="0"
                      placeholder="Amount (INTEL)"
                      value={lpStakeInput}
                      onChange={e => setLpStakeInput(e.target.value)}
                      className="bg-slate-900 border-slate-700 text-white placeholder-slate-500 rounded-sm"
                      disabled={loading !== null || wrongChain}
                    />
                  </div>
                  <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                    disabled={!lpStakeInput || Number(lpStakeInput) <= 0 || loading !== null || wrongChain}
                    onClick={() => void handleLpApproveAndStake()}>
                    {loading === 'Staking INTEL' ? (
                      <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Staking…</>
                    ) : (
                      <><TrendingUp className="w-4 h-4 mr-2" /> Stake</>
                    )}
                  </Button>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      min="0"
                      placeholder="Amount (INTEL)"
                      value={lpUnstakeInput}
                      onChange={e => setLpUnstakeInput(e.target.value)}
                      className="bg-slate-900 border-slate-700 text-white placeholder-slate-500 rounded-sm"
                      disabled={loading !== null || wrongChain}
                    />
                  </div>
                  <Button variant="outline" className="w-full border-slate-600 text-slate-300"
                    disabled={!lpUnstakeInput || Number(lpUnstakeInput) <= 0 || loading !== null || wrongChain}
                    onClick={() => void handleLpUnstake()}>
                    {loading === 'Unstaking' ? (
                      <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Unstaking…</>
                    ) : (
                      'Unstake'
                    )}
                  </Button>
                  {lpPendingReward !== undefined && lpPendingReward > 0n && (
                    <Button variant="ghost" className="w-full text-emerald-400 hover:text-emerald-300"
                      disabled={loading !== null}
                      onClick={() => void handleLpClaimRewards()}>
                      {loading === 'Claiming rewards' ? (
                        <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Claiming…</>
                      ) : (
                        <>Claim Rewards ({fmt(lpPendingReward)} INTEL)</>
                      )}
                    </Button>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* CARD 3: Epoch Performance Rewards */}
        <Card className="border-l-2 border-amber-500 border-slate-800 bg-[#0D1625] rounded-md">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base text-white">Epoch Performance Rewards</CardTitle>
              <Badge variant="warning" className="text-xs">Workers</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-300">
              Top workers by AIU score earn bonus INTEL each epoch from the epoch reward pool. Earn by completing accepted tasks and ranking in the top percentile.
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-xs text-slate-500">Current Epoch</p>
                <p className="text-sm font-semibold text-white mt-0.5">{currentEpoch?.toString() ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Your AIU Rank</p>
                <p className="text-sm font-semibold text-white mt-0.5">—</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Epoch Pool Size</p>
                <p className="text-sm font-semibold text-white mt-0.5">—</p>
              </div>
            </div>
            <p className="text-xs text-slate-500 italic">
              Rankings are computed off-chain by the broker and submitted each epoch.
            </p>
          </CardContent>
        </Card>

        {/* CARD 4: Task Settlement Yield */}
        <Card className="border-l-2 border-violet-500 border-slate-800 bg-[#0D1625] rounded-md">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base text-white">Task Settlement Yield</CardTitle>
              <Badge variant="warning" className="text-xs">Workers</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-300">
              81% of every accepted task goes directly to the worker. Submit quality work to earn.
            </p>
            <NavLink to="/jobs">
              <Button variant="outline" className="w-full border-slate-600 text-slate-300">
                Browse Tasks <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </NavLink>
          </CardContent>
        </Card>

        {/* How the flywheels work */}
        <Card className="border-slate-800 bg-[#0D1625]">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-white">How the flywheels work</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-slate-300">
              <li className="flex items-start gap-2">
                <span className="text-blue-400 mt-1">•</span>
                <span>Stakers earn 9% of task settlements + 45% of ETH mint proceeds, creating long-term alignment with protocol growth.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 mt-1">•</span>
                <span>LP mining rewards stakers with buyback revenue, funded by 20% of BuybackBurn runs + POL fee collection.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-400 mt-1">•</span>
                <span>Workers earn 81% of task settlements directly, plus epoch performance bonuses for top AIU scores.</span>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}