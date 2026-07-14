import { useState } from 'react';
import { useAccount, useReadContract, useReadContracts, useWriteContract, useSwitchChain } from 'wagmi';
import { parseUnits, formatUnits, type Address } from 'viem';
import { Loader2, TrendingUp, Lock, Unlock, Coins, Info, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { intelTokenAbi, intelStakingAbi } from '../lib/intelStakingAbi';
import { isArcEnabled } from '../config';

const INTEL_TOKEN_ADDRESS = (import.meta.env.VITE_INTEL_TOKEN_ADDRESS ?? '') as Address;
const INTEL_STAKING_ADDRESS = (import.meta.env.VITE_INTEL_STAKING_ADDRESS ?? '') as Address;
const INTEL_DECIMALS = 18;

const CONTRACT_CHAIN_ID = isArcEnabled() ? Number(import.meta.env.VITE_ARC_CHAIN_ID ?? '5042002') : 0;

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

export function StakingPage() {
  const { address, isConnected, chain } = useAccount();
  const { switchChain } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();

  const [stakeInput, setStakeInput] = useState('');
  const [unstakeInput, setUnstakeInput] = useState('');
  const [txStatus, setTxStatus] = useState<{ msg: string; type: 'success' | 'error' | 'pending' } | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  const contractsDeployed = Boolean(INTEL_TOKEN_ADDRESS && INTEL_STAKING_ADDRESS);
  const wrongChain = isConnected && chain?.id !== CONTRACT_CHAIN_ID;

  // ─── Read contract state ─────────────────────────────────────────────────
  const { data: globalData, refetch: refetchGlobal } = useReadContracts({
    contracts: [
      { address: INTEL_STAKING_ADDRESS, abi: intelStakingAbi, functionName: 'totalStaked' },
      { address: INTEL_STAKING_ADDRESS, abi: intelStakingAbi, functionName: 'currentEpoch' },
      { address: INTEL_STAKING_ADDRESS, abi: intelStakingAbi, functionName: 'epochLength' },
      { address: INTEL_STAKING_ADDRESS, abi: intelStakingAbi, functionName: 'cooldown' },
      { address: INTEL_STAKING_ADDRESS, abi: intelStakingAbi, functionName: 'globalCapRemaining' },
      { address: INTEL_STAKING_ADDRESS, abi: intelStakingAbi, functionName: 'epochStartTime' },
    ],
    query: { enabled: contractsDeployed },
  });

  const { data: walletData, refetch: refetchWallet } = useReadContracts({
    contracts: address ? [
      { address: INTEL_TOKEN_ADDRESS, abi: intelTokenAbi, functionName: 'balanceOf', args: [address] },
      { address: INTEL_TOKEN_ADDRESS, abi: intelTokenAbi, functionName: 'allowance', args: [address, INTEL_STAKING_ADDRESS] },
      { address: INTEL_STAKING_ADDRESS, abi: intelStakingAbi, functionName: 'pendingYield', args: [address] },
      { address: INTEL_STAKING_ADDRESS, abi: intelStakingAbi, functionName: 'mintAllowance', args: [address] },
      { address: INTEL_STAKING_ADDRESS, abi: intelStakingAbi, functionName: 'stakers', args: [address] },
      { address: INTEL_STAKING_ADDRESS, abi: intelStakingAbi, functionName: 'pendingEthYield', args: [address] },
    ] : [],
    query: { enabled: contractsDeployed && Boolean(address), refetchInterval: 15_000 },
  });

  const totalStaked = globalData?.[0]?.result as bigint | undefined;
  const currentEpoch = globalData?.[1]?.result as bigint | undefined;
  const epochLength = globalData?.[2]?.result as bigint | undefined;
  const cooldownSeconds = globalData?.[3]?.result as bigint | undefined;
  const globalCapRemaining = globalData?.[4]?.result as bigint | undefined;
  const epochStartTime = globalData?.[5]?.result as bigint | undefined;

  const intelBalance = walletData?.[0]?.result as bigint | undefined;
  const allowance = walletData?.[1]?.result as bigint | undefined;
  const pendingYield = walletData?.[2]?.result as bigint | undefined;
  const mintAllowance = walletData?.[3]?.result as bigint | undefined;
  const stakerInfo = walletData?.[4]?.result as readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint] | undefined;
  const pendingEthYield = walletData?.[5]?.result as bigint | undefined;

  const stakedAmount = stakerInfo?.[0];
  const pendingUnstake = stakerInfo?.[2];
  const unstakeAvailableAt = stakerInfo?.[3];
  const unstakeReady = unstakeAvailableAt !== undefined && unstakeAvailableAt > 0n
    ? BigInt(Math.floor(Date.now() / 1000)) >= unstakeAvailableAt
    : false;

  const refetch = () => { void refetchGlobal(); void refetchWallet(); };

  async function withTx(label: string, fn: () => Promise<`0x${string}`>) {
    setLoading(label);
    setTxStatus({ msg: `${label}…`, type: 'pending' });
    try {
      const hash = await fn();
      setTxStatus({ msg: `${label} submitted: ${hash.slice(0, 18)}…`, type: 'success' });
      setTimeout(refetch, 3000);
    } catch (e: unknown) {
      const msg = (e as { shortMessage?: string; message?: string }).shortMessage ?? (e as Error).message ?? 'Unknown error';
      setTxStatus({ msg: `${label} failed: ${msg}`, type: 'error' });
    } finally {
      setLoading(null);
    }
  }

  async function handleApproveAndStake() {
    if (!address) return;
    const amount = parseUnits(stakeInput, INTEL_DECIMALS);
    if (amount <= 0n) return;

    // Approve if needed
    if ((allowance ?? 0n) < amount) {
      await withTx('Approving INTEL', () =>
        writeContractAsync({ address: INTEL_TOKEN_ADDRESS, abi: intelTokenAbi, functionName: 'approve', args: [INTEL_STAKING_ADDRESS, amount] })
      );
      // wait a beat then stake
      await new Promise(r => setTimeout(r, 2000));
    }

    await withTx('Staking INTEL', () =>
      writeContractAsync({ address: INTEL_STAKING_ADDRESS, abi: intelStakingAbi, functionName: 'stake', args: [amount] })
    );
    setStakeInput('');
  }

  async function handleRequestUnstake() {
    const amount = parseUnits(unstakeInput, INTEL_DECIMALS);
    if (amount <= 0n) return;
    await withTx('Requesting unstake', () =>
      writeContractAsync({ address: INTEL_STAKING_ADDRESS, abi: intelStakingAbi, functionName: 'requestUnstake', args: [amount] })
    );
    setUnstakeInput('');
  }

  async function handleUnstake() {
    await withTx('Unstaking', () =>
      writeContractAsync({ address: INTEL_STAKING_ADDRESS, abi: intelStakingAbi, functionName: 'unstake' })
    );
  }

  async function handleClaimYield() {
    await withTx('Claiming yield', () =>
      writeContractAsync({ address: INTEL_STAKING_ADDRESS, abi: intelStakingAbi, functionName: 'claimYield' })
    );
  }

  async function handleClaimEthYield() {
    await withTx('Claiming ETH yield', () =>
      writeContractAsync({ address: INTEL_STAKING_ADDRESS, abi: intelStakingAbi, functionName: 'claimEthYield' })
    );
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  if (!contractsDeployed) {
    return (
      <div className="min-h-screen bg-[#070D1A] text-white p-6 max-w-2xl mx-auto pt-12">
        <h1 className="text-2xl font-bold mb-2">INTEL Staking</h1>
        <Alert className="border-amber-700 bg-amber-900/20">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          <AlertDescription className="text-amber-300">
            Staking contracts are not yet deployed. Set <code className="font-mono text-xs">VITE_INTEL_TOKEN_ADDRESS</code> and{' '}
            <code className="font-mono text-xs">VITE_INTEL_STAKING_ADDRESS</code> after Track D deploy.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#070D1A] text-white">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">INTEL Staking</h1>
          <p className="text-slate-400 text-sm mt-1">
            Stake INTEL to earn epoch mint allowances and 9% staker yield from all accepted jobs.
          </p>
        </div>

        {!isConnected && (
          <div className="flex items-center gap-3">
            <ConnectButton />
            <span className="text-slate-500 text-sm">Connect wallet to stake</span>
          </div>
        )}

        {wrongChain && (
          <Alert className="border-amber-700 bg-amber-900/20">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            <AlertDescription className="text-amber-300 flex items-center gap-3">
              Switch to Arc Testnet to interact with the staking contract.
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

        {/* Global stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {[
            { label: 'Total Staked', value: fmt(totalStaked) + ' INTEL' },
            { label: 'Current Epoch', value: currentEpoch?.toString() ?? '—' },
            { label: 'Epoch Length', value: epochLength ? secondsToDuration(epochLength) : '—' },
            { label: 'Unstake Cooldown', value: cooldownSeconds ? secondsToDuration(cooldownSeconds) : '—' },
            { label: 'Global Cap Left', value: fmt(globalCapRemaining) + ' INTEL' },
            { label: 'Epoch Ends', value: epochStartTime && epochLength ? secondsToDuration((epochStartTime + epochLength) - BigInt(Math.floor(Date.now() / 1000))) : '—' },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-md border border-slate-800 bg-[#0D1625] p-3">
              <p className="text-xs text-slate-500">{label}</p>
              <p className="text-sm font-semibold text-white mt-0.5">{value}</p>
            </div>
          ))}
        </div>

        {/* Epoch progress bar */}
        {epochStartTime && epochLength && (
          <div className="space-y-1">
            <div className="h-1 bg-slate-800 rounded-full w-full">
              <div 
                style={{ width: `${Math.min(100, Math.max(0, Number((BigInt(Math.floor(Date.now() / 1000)) - epochStartTime) * 100n / epochLength)))}%` }}
                className="h-1 bg-blue-500 rounded-full"
              />
            </div>
          </div>
        )}

        {isConnected && address && (
          <>
            {/* Wallet summary */}
            <Card className="border-slate-800 bg-[#0D1625]">
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-white">Your Position</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                <div>
                  <p className="text-xs text-slate-500">INTEL Balance</p>
                  <p className="text-sm font-mono font-semibold text-white">{fmt(intelBalance)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Staked</p>
                  <p className="text-sm font-mono font-semibold text-blue-300">{fmt(stakedAmount)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Pending Yield (INTEL)</p>
                  <p className="text-sm font-mono font-semibold text-green-300">{fmt(pendingYield)}</p>
                  {pendingYield !== undefined && pendingYield > 0n && (
                    <Button size="sm" variant="ghost" className="mt-1 h-6 px-2 text-xs text-green-400 hover:text-green-300"
                      disabled={loading !== null} onClick={() => void handleClaimYield()}>
                      {loading === 'Claiming yield' ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Claim'}
                    </Button>
                  )}
                </div>
                <div>
                  <p className="text-xs text-slate-500">Pending ETH Yield</p>
                  <p className="text-sm font-mono font-semibold text-emerald-300">
                    {pendingEthYield !== undefined ? formatUnits(pendingEthYield, 18) + ' ETH' : '—'}
                  </p>
                  {pendingEthYield !== undefined && pendingEthYield > 0n && (
                    <Button size="sm" variant="ghost" className="mt-1 h-6 px-2 text-xs text-emerald-400 hover:text-emerald-300"
                      disabled={loading !== null} onClick={() => void handleClaimEthYield()}>
                      {loading === 'Claiming ETH yield' ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Claim ETH'}
                    </Button>
                  )}
                </div>
                <div>
                  <p className="text-xs text-slate-500">Mint Allowance</p>
                  <p className="text-sm font-mono font-semibold text-amber-300">{fmt(mintAllowance)}</p>
                  <Badge variant="info" className="mt-1 text-[10px] h-4">this epoch</Badge>
                </div>
              </CardContent>
            </Card>

            {/* Pending unstake */}
            {pendingUnstake !== undefined && pendingUnstake > 0n && (
              <Card className="border-amber-800/40 bg-amber-900/10">
                <CardContent className="pt-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-amber-300">
                      {fmt(pendingUnstake)} INTEL queued for unstake
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {unstakeReady
                        ? 'Cooldown complete — ready to withdraw'
                        : unstakeAvailableAt
                          ? `Available ${new Date(Number(unstakeAvailableAt) * 1000).toLocaleString()}`
                          : 'Cooldown active'}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" className="border-amber-700 text-amber-300 shrink-0"
                    disabled={!unstakeReady || loading !== null}
                    onClick={() => void handleUnstake()}>
                    {loading === 'Unstaking' ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Unlock className="w-3.5 h-3.5 mr-1.5" />}
                    Withdraw
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Stake */}
            <Card className="border-slate-800 bg-[#0D1625]">
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-white flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-blue-400" /> Stake INTEL
                </CardTitle>
                <CardDescription className="text-slate-400 text-xs">
                  Earn mint allowances proportional to √(staked). Yield comes from the 9% staker pool on all accepted jobs.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min="0"
                    placeholder="Amount (INTEL)"
                    value={stakeInput}
                    onChange={e => setStakeInput(e.target.value)}
                    className="bg-slate-900 border-slate-700 text-white placeholder-slate-500 rounded-sm"
                    disabled={loading !== null || wrongChain}
                  />
                  <Button variant="ghost" size="sm" className="text-xs text-slate-400 shrink-0"
                    onClick={() => intelBalance !== undefined && setStakeInput(formatUnits(intelBalance, INTEL_DECIMALS))}
                    disabled={!intelBalance}>
                    Max
                  </Button>
                </div>
                <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                  disabled={!stakeInput || Number(stakeInput) <= 0 || loading !== null || wrongChain}
                  onClick={() => void handleApproveAndStake()}>
                  {loading?.startsWith('Approving') ? (
                    <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Approving…</>
                  ) : loading === 'Staking INTEL' ? (
                    <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Staking…</>
                  ) : (
                    <><Coins className="w-4 h-4 mr-2" /> Approve &amp; Stake</>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Request unstake */}
            {stakedAmount !== undefined && stakedAmount > 0n && (
              <Card className="border-slate-800 bg-[#0D1625]">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base text-white flex items-center gap-2">
                    <Lock className="w-4 h-4 text-slate-400" /> Request Unstake
                  </CardTitle>
                  <CardDescription className="text-slate-400 text-xs">
                    {cooldownSeconds ? `${secondsToDuration(cooldownSeconds)} cooldown` : 'Cooldown applies'} before funds are withdrawable.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      min="0"
                      placeholder="Amount (INTEL)"
                      value={unstakeInput}
                      onChange={e => setUnstakeInput(e.target.value)}
                      className="bg-slate-900 border-slate-700 text-white placeholder-slate-500 rounded-sm"
                      disabled={loading !== null || wrongChain}
                    />
                    <Button variant="ghost" size="sm" className="text-xs text-slate-400 shrink-0"
                      onClick={() => stakedAmount !== undefined && setUnstakeInput(formatUnits(stakedAmount, INTEL_DECIMALS))}>
                      Max
                    </Button>
                  </div>
                  <Button variant="outline" className="w-full border-slate-600 text-slate-300"
                    disabled={!unstakeInput || Number(unstakeInput) <= 0 || loading !== null || wrongChain}
                    onClick={() => void handleRequestUnstake()}>
                    {loading === 'Requesting unstake'
                      ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Queuing…</>
                      : <><Lock className="w-4 h-4 mr-2" /> Request Unstake</>}
                  </Button>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* Info card */}
        <Card className="border-slate-800 bg-[#0D1625]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-400 flex items-center gap-2">
              <Info className="w-3.5 h-3.5" /> How staking works
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-slate-500 space-y-1.5">
            <p>• Stake INTEL to earn a per-epoch <strong className="text-slate-400">mint allowance</strong> — the right to mint new INTEL at curve price.</p>
            <p>• Allowance = k × √(staked), capped at 5M INTEL per wallet per epoch.</p>
            <p>• Every accepted job on the marketplace routes <strong className="text-slate-400">9% of the settlement</strong> to the staker yield pool.</p>
            <p>• Yield is distributed pro-rata based on staked share at deposit time — late stakers cannot claim retroactive yield.</p>
            <p>• Unstaking requires a {cooldownSeconds ? secondsToDuration(cooldownSeconds) : '3-day'} cooldown to prevent mercenary capital.</p>
            <p>• <strong className="text-slate-400">ETH yield</strong> is deposited by IntelMintController from mint proceeds (45% of each ETH mint routed here). Claim it separately as native ETH.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
