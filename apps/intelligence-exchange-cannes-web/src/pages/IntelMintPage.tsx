import { useState } from 'react';
import { useAccount, useReadContracts, useWriteContract, useSwitchChain } from 'wagmi';
import { parseUnits, formatUnits, type Address } from 'viem';
import { Loader2, Coins, Info, AlertTriangle, Zap } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { intelMintControllerAbi } from '../lib/intelMintControllerAbi';
import { intelStakingAbi } from '../lib/intelStakingAbi';

const INTEL_MINT_CONTROLLER_ADDRESS = (import.meta.env.VITE_INTEL_MINT_CONTROLLER_ADDRESS ?? '') as Address;
const INTEL_TOKEN_ADDRESS = (import.meta.env.VITE_INTEL_TOKEN_ADDRESS ?? '') as Address;
const INTEL_STAKING_ADDRESS = (import.meta.env.VITE_INTEL_STAKING_ADDRESS ?? '') as Address;
const CONTRACT_CHAIN_ID = Number(import.meta.env.VITE_ARC_CHAIN_ID ?? '5042002');
const INTEL_DECIMALS = 18;

function fmtEth(raw: bigint | undefined, dp = 6): string {
  if (raw === undefined) return '—';
  const n = Number(formatUnits(raw, 18));
  return n.toLocaleString(undefined, { maximumFractionDigits: dp });
}

function fmtIntel(raw: bigint | undefined, dp = 4): string {
  if (raw === undefined) return '—';
  const n = Number(formatUnits(raw, INTEL_DECIMALS));
  return n.toLocaleString(undefined, { maximumFractionDigits: dp });
}

export function IntelMintPage() {
  const { address, isConnected, chain } = useAccount();
  const { switchChain } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();

  const [intelAmount, setIntelAmount] = useState('');
  const [txStatus, setTxStatus] = useState<{ msg: string; type: 'success' | 'error' | 'pending' } | null>(null);
  const [loading, setLoading] = useState(false);

  const contractsDeployed = Boolean(INTEL_MINT_CONTROLLER_ADDRESS && INTEL_TOKEN_ADDRESS && INTEL_STAKING_ADDRESS);
  const wrongChain = isConnected && chain?.id !== CONTRACT_CHAIN_ID;

  // Parse the INTEL amount typed by the user
  let parsedAmount = 0n;
  try {
    if (intelAmount && Number(intelAmount) > 0) {
      parsedAmount = parseUnits(intelAmount, INTEL_DECIMALS);
    }
  } catch {
    parsedAmount = 0n;
  }

  // ─── Read contract state ─────────────────────────────────────────────────
  const { data: globalData, refetch: refetchGlobal } = useReadContracts({
    contracts: [
      { address: INTEL_MINT_CONTROLLER_ADDRESS, abi: intelMintControllerAbi, functionName: 'mintPrice' },
      { address: INTEL_MINT_CONTROLLER_ADDRESS, abi: intelMintControllerAbi, functionName: 'twap' },
      { address: INTEL_MINT_CONTROLLER_ADDRESS, abi: intelMintControllerAbi, functionName: 'floorPrice' },
      { address: INTEL_MINT_CONTROLLER_ADDRESS, abi: intelMintControllerAbi, functionName: 'premiumBps' },
    ],
    query: { enabled: contractsDeployed, refetchInterval: 30_000 },
  });

  const { data: quoteData } = useReadContracts({
    contracts: [
      {
        address: INTEL_MINT_CONTROLLER_ADDRESS,
        abi: intelMintControllerAbi,
        functionName: 'quoteMint',
        args: [parsedAmount],
      },
    ],
    query: { enabled: contractsDeployed && parsedAmount > 0n },
  });

  const { data: walletData, refetch: refetchWallet } = useReadContracts({
    contracts: address ? [
      { address: INTEL_STAKING_ADDRESS, abi: intelStakingAbi, functionName: 'mintAllowance', args: [address] },
    ] : [],
    query: { enabled: contractsDeployed && Boolean(address), refetchInterval: 15_000 },
  });

  const mintPrice = globalData?.[0]?.result as bigint | undefined;
  const twap = globalData?.[1]?.result as bigint | undefined;
  const floorPrice = globalData?.[2]?.result as bigint | undefined;
  const premiumBps = globalData?.[3]?.result as bigint | undefined;
  const quotedCost = quoteData?.[0]?.result as bigint | undefined;
  const mintAllowance = walletData?.[0]?.result as bigint | undefined;

  const refetch = () => { void refetchGlobal(); void refetchWallet(); };

  async function handleMintEth() {
    if (!address || parsedAmount === 0n || quotedCost === undefined) return;
    setLoading(true);
    setTxStatus({ msg: 'Submitting mint transaction…', type: 'pending' });
    try {
      // Allow 1% slippage on maxPrice
      const maxPrice = (mintPrice ?? 0n) * 101n / 100n;
      const hash = await writeContractAsync({
        address: INTEL_MINT_CONTROLLER_ADDRESS,
        abi: intelMintControllerAbi,
        functionName: 'selfMint',
        args: [parsedAmount, maxPrice],
        value: quotedCost,
      });
      setTxStatus({ msg: `Mint submitted: ${hash.slice(0, 18)}…`, type: 'success' });
      setIntelAmount('');
      setTimeout(refetch, 3000);
    } catch (e: unknown) {
      const msg = (e as { shortMessage?: string; message?: string }).shortMessage ?? (e as Error).message ?? 'Unknown error';
      setTxStatus({ msg: `Mint failed: ${msg}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  }

  // ─── Not deployed notice ─────────────────────────────────────────────────
  if (!contractsDeployed) {
    return (
      <div className="min-h-screen bg-[#070D1A] text-white p-6 max-w-2xl mx-auto pt-12">
        <h1 className="text-2xl font-bold mb-2">Mint INTEL</h1>
        <Alert className="border-amber-700 bg-amber-900/20">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          <AlertDescription className="text-amber-300 space-y-1">
            <p>Contracts not deployed yet — set the following in <code className="font-mono text-xs">.env.local</code> after Track D deploy:</p>
            <ul className="mt-2 space-y-1 font-mono text-xs">
              <li>VITE_INTEL_TOKEN_ADDRESS</li>
              <li>VITE_INTEL_STAKING_ADDRESS</li>
              <li>VITE_INTEL_MINT_CONTROLLER_ADDRESS</li>
            </ul>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#070D1A] text-white">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Mint INTEL</h1>
          <p className="text-slate-400 text-sm mt-1">
            Buy INTEL tokens at the curve price via IntelMintController. ETH mint routes proceeds automatically.
          </p>
        </div>

        {!isConnected && (
          <div className="flex items-center gap-3">
            <ConnectButton />
            <span className="text-slate-500 text-sm">Connect wallet to mint</span>
          </div>
        )}

        {wrongChain && (
          <Alert className="border-amber-700 bg-amber-900/20">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            <AlertDescription className="text-amber-300 flex items-center gap-3">
              Switch to Arc Testnet to interact with the mint controller.
              <Button size="sm" variant="outline" className="border-amber-600 text-amber-300 h-7 text-xs"
                onClick={() => void switchChain({ chainId: CONTRACT_CHAIN_ID })}>
                Switch Network
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {txStatus && (
          <Alert className={
            txStatus.type === 'error'
              ? 'border-red-700 bg-red-900/20'
              : txStatus.type === 'success'
                ? 'border-green-700 bg-green-900/20'
                : 'border-blue-700 bg-blue-900/20'
          }>
            <AlertDescription className={
              txStatus.type === 'error'
                ? 'text-red-300'
                : txStatus.type === 'success'
                  ? 'text-green-300'
                  : 'text-blue-300'
            }>
              {txStatus.msg}
            </AlertDescription>
          </Alert>
        )}

        {/* Price stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Mint Price', value: mintPrice !== undefined ? fmtEth(mintPrice) + ' ETH' : '—' },
            { label: 'TWAP', value: twap !== undefined ? fmtEth(twap) + ' ETH' : '—' },
            { label: 'Floor Price', value: floorPrice !== undefined ? fmtEth(floorPrice) + ' ETH' : '—' },
            { label: 'Premium', value: premiumBps !== undefined ? (Number(premiumBps) / 100).toFixed(1) + '%' : '—' },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-md border border-slate-800 bg-[#0D1625] p-3">
              <p className="text-xs text-slate-500">{label}</p>
              <p className="text-sm font-semibold text-white mt-0.5">{value}</p>
            </div>
          ))}
        </div>

        {/* Routing split info */}
        <Card className="border-slate-800 bg-[#0D1625]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-300 flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-blue-400" /> Mint Proceeds Routing
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-blue-400">50%</p>
              <p className="text-xs text-slate-400 mt-0.5">Protocol-Owned Liquidity (POL)</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-emerald-400">45%</p>
              <p className="text-xs text-slate-400 mt-0.5">ETH Yield → Stakers</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-amber-400">5%</p>
              <p className="text-xs text-slate-400 mt-0.5">Treasury</p>
            </div>
          </CardContent>
        </Card>

        {/* Wallet stats */}
        {isConnected && address && (
          <Card className="border-slate-800 bg-[#0D1625]">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-300">Your Mint Allowance</CardTitle>
              <CardDescription className="text-slate-500 text-xs">
                Stakers earn a per-epoch allowance to mint at curve price. Stake INTEL to earn allowance.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-mono font-semibold text-amber-300">
                {fmtIntel(mintAllowance)} <span className="text-xs text-slate-500">INTEL this epoch</span>
              </p>
            </CardContent>
          </Card>
        )}

        {/* Mint form */}
        {isConnected && (
          <Card className="border-slate-800 bg-[#0D1625]">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-white flex items-center gap-2">
                <Coins className="w-4 h-4 text-blue-400" /> Mint INTEL (ETH)
              </CardTitle>
              <CardDescription className="text-slate-400 text-xs">
                Pay in native ETH. 45% of your payment is routed to INTEL stakers as ETH yield.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-xs text-slate-500 mb-1.5 block">INTEL Amount to Mint</label>
                <Input
                  type="number"
                  min="0"
                  placeholder="e.g. 1000"
                  value={intelAmount}
                  onChange={e => setIntelAmount(e.target.value)}
                  className="bg-slate-900 border-slate-700 text-white placeholder-slate-500 rounded-sm"
                  disabled={loading || wrongChain}
                />
              </div>

              {/* Quote display */}
              {parsedAmount > 0n && (
                <div className="rounded-md border border-slate-700 bg-slate-900/50 p-3 space-y-1.5">
                  <p className="text-xs text-slate-400 font-medium">Quote</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">You receive</span>
                    <span className="text-sm font-mono text-white">{intelAmount} INTEL</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">You pay</span>
                    <span className="text-sm font-mono text-blue-300">
                      {quotedCost !== undefined ? fmtEth(quotedCost) + ' ETH' : <Loader2 className="w-3 h-3 animate-spin inline" />}
                    </span>
                  </div>
                  {quotedCost !== undefined && (
                    <>
                      <div className="border-t border-slate-700 mt-1 pt-1.5 grid grid-cols-3 gap-1 text-[10px]">
                        <div className="text-center">
                          <p className="text-slate-600">POL (50%)</p>
                          <p className="text-blue-400 font-mono">{fmtEth(quotedCost / 2n)} ETH</p>
                        </div>
                        <div className="text-center">
                          <p className="text-slate-600">Stakers (45%)</p>
                          <p className="text-emerald-400 font-mono">{fmtEth(quotedCost * 45n / 100n)} ETH</p>
                        </div>
                        <div className="text-center">
                          <p className="text-slate-600">Treasury (5%)</p>
                          <p className="text-amber-400 font-mono">{fmtEth(quotedCost * 5n / 100n)} ETH</p>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              <Button
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                disabled={!intelAmount || parsedAmount === 0n || quotedCost === undefined || loading || wrongChain}
                onClick={() => void handleMintEth()}
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Minting…</>
                ) : (
                  <><Coins className="w-4 h-4 mr-2" /> Mint INTEL (ETH)</>
                )}
              </Button>

              {quotedCost !== undefined && parsedAmount > 0n && (
                <p className="text-[10px] text-slate-600 text-center">
                  Slippage protection: up to 1% price increase accepted automatically.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Info card */}
        <Card className="border-slate-800 bg-[#0D1625]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-400 flex items-center gap-2">
              <Info className="w-3.5 h-3.5" /> How minting works
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-slate-500 space-y-1.5">
            <p>• INTEL is minted at a dynamic curve price: <strong className="text-slate-400">max(TWAP + premium, floor)</strong>.</p>
            <p>• Each mint routes proceeds: <strong className="text-blue-400">50% POL</strong>, <strong className="text-emerald-400">45% ETH yield to stakers</strong>, <strong className="text-amber-400">5% treasury</strong>.</p>
            <p>• Stakers receive ETH directly into the IntelStaking contract and can claim it any time via <strong className="text-slate-400">claimEthYield()</strong>.</p>
            <p>• The <strong className="text-slate-400">mint allowance</strong> per epoch is determined by your staked amount — stake more INTEL to unlock larger minting capacity.</p>
            <p>• Price increases with utilization: high pending job volume → higher multiplier → higher mint price.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
