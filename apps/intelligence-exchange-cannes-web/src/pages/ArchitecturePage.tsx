import React, { useEffect, useRef, useState } from 'react';

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

interface ContractRow {
  contract: string;
  role: string;
  keySecurityFeature: string;
  callers: string;
}

interface FlowStep {
  step: string;
  actors: string;
  action: string;
}

// ──────────────────────────────────────────────────────────────────────────────
// Nav sections
// ──────────────────────────────────────────────────────────────────────────────

const NAV_SECTIONS = [
  { id: 'contract-architecture', label: 'Contract Architecture' },
  { id: 'user-flow', label: 'User Flow' },
  { id: 'contracts', label: 'Contract Table' },
  { id: 'security', label: 'Security Model' },
  { id: 'demo', label: 'Demo Instructions' },
];

// ──────────────────────────────────────────────────────────────────────────────
// Contract data
// ──────────────────────────────────────────────────────────────────────────────

const CONTRACTS: ContractRow[] = [
  {
    contract: 'IntelToken',
    role: 'ERC-20 token',
    keySecurityFeature: 'Pausable transfers, Ownable2Step',
    callers: 'IntelMintController, TaskEscrow, EpochRewardDistributor, BuybackBurn',
  },
  {
    contract: 'IntelVesting',
    role: 'Team vesting',
    keySecurityFeature: '6-month cliff, 24-month linear vesting',
    callers: 'Treasury multisig',
  },
  {
    contract: 'IntelTimelockController',
    role: 'Governance timelock',
    keySecurityFeature: '48h minimum delay, emergency cancel',
    callers: 'Proposer (Gnosis Safe)',
  },
  {
    contract: 'IntelMintController',
    role: 'Token minting',
    keySecurityFeature: 'TWAP staleness guard, epoch mint cap, utilization multiplier',
    callers: 'Public, Operator (allowlist)',
  },
  {
    contract: 'IntelPOLManager',
    role: 'Protocol-owned liquidity',
    keySecurityFeature: 'Phase 2 UniV3 integration, owner-only withdrawals',
    callers: 'Owner (timelock)',
  },
  {
    contract: 'IntelStaking',
    role: 'INTEL staking pool',
    keySecurityFeature: '7-day unbonding, maxStakePerDeposit cap',
    callers: 'Public, Operator (yield deposit)',
  },
  {
    contract: 'AgentIdentityRegistry',
    role: 'Agent reputation',
    keySecurityFeature: 'Broker attestor gate, immutable reputation records',
    callers: 'Broker (Attestor role)',
  },
  {
    contract: 'WorkReceipt1155',
    role: 'Soulbound work NFTs',
    keySecurityFeature: 'Soulbound (non-transferable), operator-only mint',
    callers: 'Broker (Operator)',
  },
  {
    contract: 'ReviewerCredential',
    role: 'Reviewer tier system',
    keySecurityFeature: 'Soulbound ERC-1155, tier-gated acceptance',
    callers: 'Broker (Operator)',
  },
  {
    contract: 'IdentityGate',
    role: 'WorldID verification',
    keySecurityFeature: 'Optional WorldID gate, soft dependency',
    callers: 'Public, WorkerStakeManager, ReviewerStakeManager',
  },
  {
    contract: 'TaskEscrow',
    role: 'Settlement (81/9/10)',
    keySecurityFeature: 'Reentrancy guards, buyer-first funding',
    callers: 'Buyer, Broker (setWorker, release)',
  },
  {
    contract: 'WorkerStakeManager',
    role: 'Worker staking/slashing',
    keySecurityFeature: 'Stake requirement for high-value tasks, slashable',
    callers: 'Public, DisputeResolution (slash)',
  },
  {
    contract: 'ReviewerStakeManager',
    role: 'Reviewer bonds/fees',
    keySecurityFeature: 'Bond requirement, fee share, slashable',
    callers: 'Public, DisputeResolution (slash), ReviewerQueue (eligibility)',
  },
  {
    contract: 'DisputeResolution',
    role: 'Staker jury disputes',
    keySecurityFeature: 'Quorum-based voting, slashing enforcement',
    callers: 'Public (stakers), Broker (escalation)',
  },
  {
    contract: 'ReviewerQueue',
    role: 'Reviewer assignment',
    keySecurityFeature: 'Stake-gated eligibility, tier-weighted selection',
    callers: 'Public, Broker (assignment)',
  },
  {
    contract: 'EpochRewardDistributor',
    role: 'Performance bonuses',
    keySecurityFeature: 'AIU-ranked distribution, epoch-gated',
    callers: 'Operator (timelock)',
  },
  {
    contract: 'CategoryRegistry',
    role: 'Task categories',
    keySecurityFeature: 'Immutable category definitions',
    callers: 'Operator',
  },
  {
    contract: 'BuybackBurn',
    role: 'Treasury buyback/burn',
    keySecurityFeature: 'TWAP-gated execution, owner-only trigger',
    callers: 'Owner (timelock)',
  },
];

const FLOW_STEPS: FlowStep[] = [
  {
    step: '1',
    actors: 'Buyer',
    action: 'Mints INTEL via IntelMintController (pays ETH)',
  },
  {
    step: '2',
    actors: 'Buyer',
    action: 'Approves + calls TaskEscrow.fundTask(jobId, amount)',
  },
  {
    step: '3',
    actors: 'Worker',
    action: 'Stakes INTEL in WorkerStakeManager (one-time setup)',
  },
  {
    step: '4',
    actors: 'Worker → Broker',
    action: 'Claims job → broker calls TaskEscrow.setWorker(jobId, worker)',
  },
  {
    step: '5',
    actors: 'Worker',
    action: 'Submits artifacts',
  },
  {
    step: '6',
    actors: 'Reviewer',
    action: 'Accepts submission (requires ReviewerCredential tier ≥ 0)',
  },
  {
    step: '7',
    actors: 'Broker',
    action: 'Calls TaskEscrow.release(jobId, worker) → 81% INTEL to worker, 9% to IntelStaking, 10% to treasury',
  },
  {
    step: '8',
    actors: 'Protocol',
    action: 'WorkReceipt1155 NFT minted to worker',
  },
  {
    step: '9',
    actors: 'Protocol',
    action: 'AgentIdentityRegistry attestation recorded',
  },
  {
    step: '10',
    actors: 'Protocol',
    action: 'ReviewerCredential tier evaluated',
  },
  {
    step: '11',
    actors: 'Protocol',
    action: 'CategoryRegistry completion recorded',
  },
  {
    step: '12',
    actors: 'Protocol',
    action: 'EpochRewardDistributor pays bonus INTEL to top workers',
  },
];

// ──────────────────────────────────────────────────────────────────────────────
// Components
// ──────────────────────────────────────────────────────────────────────────────

function SectionHeading({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="text-xl font-semibold text-white mb-4 mt-10 pb-2 border-b border-slate-800 scroll-mt-6"
      style={{ fontFamily: 'Departure Mono, monospace' }}>
      {children}
    </h2>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-base font-semibold text-slate-200 mb-3 mt-6"
      style={{ fontFamily: 'Departure Mono, monospace' }}>
      {children}
    </h3>
  );
}

function Surface({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-md border border-slate-800 ${className}`}
      style={{ backgroundColor: '#0D1625' }}>
      {children}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Main page
// ──────────────────────────────────────────────────────────────────────────────

export function ArchitecturePage() {
  const [activeSection, setActiveSection] = useState('contract-architecture');
  const contentRef = useRef<HTMLDivElement>(null);

  // Scroll-spy: track which section is in view
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { rootMargin: '-20% 0px -70% 0px', threshold: 0 },
    );
    NAV_SECTIONS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  const copyArchitectureDiagram = () => {
    const src = `flowchart TB
    subgraph L1["Layer 1 — Token"]
        IT[IntelToken]
        IV[IntelVesting]
        ITC[IntelTimelockController]
    end
    
    subgraph L2["Layer 2 — Market"]
        IMC[IntelMintController]
        IPM[IntelPOLManager]
        IS[IntelStaking]
    end
    
    subgraph L3["Layer 3 — Reputation"]
        AIR[AgentIdentityRegistry]
        WR[WorkReceipt1155]
        RC[ReviewerCredential]
        IG[IdentityGate]
    end
    
    subgraph L4["Layer 4 — Settlement"]
        TE[TaskEscrow]
    end
    
    subgraph L5["Layer 5 — Security"]
        WSM[WorkerStakeManager]
        RSM[ReviewerStakeManager]
        DR[DisputeResolution]
        RQ[ReviewerQueue]
    end
    
    subgraph L6["Layer 6 — Rewards"]
        ERD[EpochRewardDistributor]
        CR[CategoryRegistry]
        BBB[BuybackBurn]
    end
    
    TE -->|depositYield 9%| IS
    TE -->|transfer 81%| IT
    TE -->|transfer 10%| IT
    DR -->|slash| WSM
    DR -->|slash| RSM
    RQ -->|isEligible| RSM
    RC -->|reads review count| RSM
    ERD -->|transfer bonus| IT
    BBB -->|TWAP| IPM
    IPM -->|UniV3 swap+burn| BBB`;
    navigator.clipboard.writeText(src).catch(() => undefined);
  };

  const copyUserFlowDiagram = () => {
    const src = `flowchart LR
    A[Buyer] -->|1. Mint INTEL| B[Smart Contracts]
    A -->|2. Fund Task| B
    C[Worker] -->|3. Stake INTEL| B
    C -->|4. Claim Job| D[Broker]
    D -->|setWorker| B
    C -->|5. Submit Artifacts| D
    E[Reviewer] -->|6. Accept Submission| B
    D -->|7. Release| B
    B -->|81% to Worker| C
    B -->|9% to Stakers| F[Protocol]
    B -->|10% to Treasury| F
    B -->|8. Mint NFT| F
    B -->|9. Record Attestation| F
    B -->|10. Update Tier| F
    B -->|11. Record Category| F
    B -->|12. Distribute Bonus| F`;
    navigator.clipboard.writeText(src).catch(() => undefined);
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#070D1A', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
      <div className="max-w-6xl mx-auto px-4 py-10">

        {/* Page title */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white" style={{ fontFamily: 'Departure Mono, monospace' }}>
            Contract Architecture
          </h1>
          <p className="mt-2 text-sm text-slate-400 max-w-2xl">
            Complete smart contract architecture and protocol flow documentation for Intelligence Exchange.
            Covers all 18 active contracts, settlement flows, security model, and demo instructions.
          </p>
        </div>

        <div className="flex gap-8">

          {/* ── Sticky left sidebar nav ────────────────────────────────────── */}
          <nav className="hidden lg:block w-48 flex-shrink-0">
            <div className="sticky top-6">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3"
                style={{ fontFamily: 'Departure Mono, monospace' }}>
                On this page
              </div>
              <ul className="space-y-0.5">
                {NAV_SECTIONS.map(({ id, label }) => (
                  <li key={id}>
                    <a
                      href={`#${id}`}
                      className={`block px-2 py-1.5 rounded-sm text-sm transition-colors ${
                        activeSection === id
                          ? 'text-blue-400 bg-blue-900/20 border-l-2 border-blue-500'
                          : 'text-slate-500 hover:text-slate-300 border-l-2 border-transparent'
                      }`}
                    >
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </nav>

          {/* ── Main content ────────────────────────────────────────────────── */}
          <div ref={contentRef} className="flex-1 min-w-0">

            {/* ── Section 1: Contract Architecture ─────────────────────────── */}
            <SectionHeading id="contract-architecture">Contract Architecture</SectionHeading>

            <p className="text-sm text-slate-400 mb-6 max-w-2xl">
              The protocol consists of 18 active contracts organized into 6 layers. Each layer has a specific
              responsibility in the system, from token management to settlement and rewards.
            </p>

            {/* Mermaid diagram */}
            <Surface className="p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <SubHeading>Layer Architecture</SubHeading>
                <button
                  onClick={copyArchitectureDiagram}
                  className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                  style={{ fontFamily: 'JetBrains Mono, monospace' }}
                >
                  Copy Mermaid
                </button>
              </div>
              <pre className="text-xs text-slate-300 overflow-x-auto"
                style={{ fontFamily: 'JetBrains Mono, monospace', lineHeight: '1.5' }}>
{`flowchart TB
    subgraph L1["Layer 1 — Token"]
        IT[IntelToken]
        IV[IntelVesting]
        ITC[IntelTimelockController]
    end
    
    subgraph L2["Layer 2 — Market"]
        IMC[IntelMintController]
        IPM[IntelPOLManager]
        IS[IntelStaking]
    end
    
    subgraph L3["Layer 3 — Reputation"]
        AIR[AgentIdentityRegistry]
        WR[WorkReceipt1155]
        RC[ReviewerCredential]
        IG[IdentityGate]
    end
    
    subgraph L4["Layer 4 — Settlement"]
        TE[TaskEscrow]
    end
    
    subgraph L5["Layer 5 — Security"]
        WSM[WorkerStakeManager]
        RSM[ReviewerStakeManager]
        DR[DisputeResolution]
        RQ[ReviewerQueue]
    end
    
    subgraph L6["Layer 6 — Rewards"]
        ERD[EpochRewardDistributor]
        CR[CategoryRegistry]
        BBB[BuybackBurn]
    end
    
    TE -->|depositYield 9%| IS
    TE -->|transfer 81%| IT
    TE -->|transfer 10%| IT
    DR -->|slash| WSM
    DR -->|slash| RSM
    RQ -->|isEligible| RSM
    RC -->|reads review count| RSM
    ERD -->|transfer bonus| IT
    BBB -->|TWAP| IPM
    IPM -->|UniV3 swap+burn| BBB`}
              </pre>
            </Surface>

            {/* Layer descriptions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {[
                {
                  title: 'Layer 1 — Token',
                  description: 'Core ERC-20 token with vesting and governance timelock controls.',
                  contracts: 'IntelToken, IntelVesting, IntelTimelockController',
                },
                {
                  title: 'Layer 2 — Market',
                  description: 'Minting, protocol-owned liquidity, and staking pool management.',
                  contracts: 'IntelMintController, IntelPOLManager, IntelStaking',
                },
                {
                  title: 'Layer 3 — Reputation',
                  description: 'Agent identity, work receipts, reviewer credentials, and verification gates.',
                  contracts: 'AgentIdentityRegistry, WorkReceipt1155, ReviewerCredential, IdentityGate',
                },
                {
                  title: 'Layer 4 — Settlement',
                  description: 'Task escrow with 81/9/10 settlement split (worker/stakers/treasury).',
                  contracts: 'TaskEscrow',
                },
                {
                  title: 'Layer 5 — Security',
                  description: 'Staking, slashing, dispute resolution, and reviewer queue management.',
                  contracts: 'WorkerStakeManager, ReviewerStakeManager, DisputeResolution, ReviewerQueue',
                },
                {
                  title: 'Layer 6 — Rewards',
                  description: 'Performance bonuses, category tracking, and treasury buyback/burn.',
                  contracts: 'EpochRewardDistributor, CategoryRegistry, BuybackBurn',
                },
              ].map(({ title, description, contracts }) => (
                <Surface key={title} className="p-4">
                  <div className="text-sm font-semibold text-blue-300 mb-2"
                    style={{ fontFamily: 'Departure Mono, monospace' }}>
                    {title}
                  </div>
                  <div className="text-sm text-slate-400 mb-3">{description}</div>
                  <div className="text-xs text-slate-500" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    {contracts}
                  </div>
                </Surface>
              ))}
            </div>

            {/* ── Section 2: User Flow ─────────────────────────────────────── */}
            <SectionHeading id="user-flow">User Flow</SectionHeading>

            <p className="text-sm text-slate-400 mb-6 max-w-2xl">
              The complete lifecycle shows how buyers, workers, reviewers, brokers, smart contracts, and the protocol
              interact to settle AI work output.
            </p>

            {/* User flow diagram */}
            <Surface className="p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <SubHeading>Complete Protocol Flow</SubHeading>
                <button
                  onClick={copyUserFlowDiagram}
                  className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                  style={{ fontFamily: 'JetBrains Mono, monospace' }}
                >
                  Copy Mermaid
                </button>
              </div>
              <pre className="text-xs text-slate-300 overflow-x-auto"
                style={{ fontFamily: 'JetBrains Mono, monospace', lineHeight: '1.5' }}>
{`flowchart LR
    A[Buyer] -->|1. Mint INTEL| B[Smart Contracts]
    A -->|2. Fund Task| B
    C[Worker] -->|3. Stake INTEL| B
    C -->|4. Claim Job| D[Broker]
    D -->|setWorker| B
    C -->|5. Submit Artifacts| D
    E[Reviewer] -->|6. Accept Submission| B
    D -->|7. Release| B
    B -->|81% to Worker| C
    B -->|9% to Stakers| F[Protocol]
    B -->|10% to Treasury| F
    B -->|8. Mint NFT| F
    B -->|9. Record Attestation| F
    B -->|10. Update Tier| F
    B -->|11. Record Category| F
    B -->|12. Distribute Bonus| F`}
              </pre>
            </Surface>

            {/* Step-by-step breakdown */}
            <SubHeading>Step-by-Step Breakdown</SubHeading>
            <div className="space-y-2 mb-6">
              {FLOW_STEPS.map(({ step, actors, action }) => (
                <div key={step} className="flex gap-4 items-start p-3 rounded-md border border-slate-800"
                  style={{ backgroundColor: '#0D1625' }}>
                  <div className="text-xs font-bold text-blue-500 w-8 flex-shrink-0 pt-0.5"
                    style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                    {step}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-white mb-0.5"
                      style={{ fontFamily: 'Departure Mono, monospace' }}>
                      {actors}
                    </div>
                    <div className="text-sm text-slate-400">{action}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* ── Section 3: Contract Table ─────────────────────────────────── */}
            <SectionHeading id="contracts">Contract Table</SectionHeading>

            <p className="text-sm text-slate-400 mb-6 max-w-2xl">
              Reference table for all 18 active contracts, their roles, key security features, and authorized callers.
            </p>

            <Surface className="overflow-hidden mb-6">
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#070D1A' }}>
                    <th className="text-left px-4 py-2 text-xs font-medium text-slate-500">Contract</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-slate-500">Role</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-slate-500">Key Security Feature</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-slate-500">Callers</th>
                  </tr>
                </thead>
                <tbody>
                  {CONTRACTS.map((row, i) => (
                    <tr key={row.contract} style={{ backgroundColor: i % 2 === 0 ? '#0D1625' : '#070D1A' }}>
                      <td className="px-4 py-2.5 text-sm text-slate-200 font-medium"
                        style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                        {row.contract}
                      </td>
                      <td className="px-4 py-2.5 text-sm text-slate-300">{row.role}</td>
                      <td className="px-4 py-2.5 text-sm text-slate-400">{row.keySecurityFeature}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-500"
                        style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                        {row.callers}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Surface>

            {/* ── Section 4: Security Model ─────────────────────────────────── */}
            <SectionHeading id="security">Security Model</SectionHeading>

            <p className="text-sm text-slate-400 mb-6 max-w-2xl">
              The protocol uses multiple layers of economic and cryptographic security to ensure safe settlement
              and prevent malicious behavior.
            </p>

            <div className="space-y-3 mb-6">
              {[
                {
                  title: 'Human Acceptance Gate',
                  description: 'No INTEL flows without a human reviewer accepting. All settlements require explicit human approval before funds are released.',
                },
                {
                  title: 'Economic Security',
                  description: 'Workers and reviewers both stake INTEL and can be slashed for malicious behavior. This creates economic alignment with protocol success.',
                },
                {
                  title: 'Anti-Reflexivity',
                  description: 'Mint price rises with demand via utilizationMultiplier. This prevents speculative minting during demand surges and makes the protocol self-braking.',
                },
                {
                  title: 'Dispute Resolution',
                  description: 'Staker jury can override fraudulent reviewer decisions through the DisputeResolution contract. Slashing is enforced on both workers and reviewers.',
                },
                {
                  title: 'Soulbound Reputation',
                  description: 'WorkReceipt1155 and ReviewerCredential are non-transferable soulbound tokens. Reputation cannot be bought or sold—only earned through verified work.',
                },
              ].map(({ title, description }) => (
                <Surface key={title} className="p-4">
                  <div className="text-sm font-semibold text-amber-300 mb-2"
                    style={{ fontFamily: 'Departure Mono, monospace' }}>
                    {title}
                  </div>
                  <div className="text-sm text-slate-400">{description}</div>
                </Surface>
              ))}
            </div>

            {/* ── Section 5: Demo Instructions ─────────────────────────────── */}
            <SectionHeading id="demo">Demo Instructions</SectionHeading>

            <p className="text-sm text-slate-400 mb-6 max-w-2xl">
              Run the full end-to-end demo on a local Ethereum mainnet fork to see the complete protocol in action.
            </p>

            <Surface className="p-6 mb-6">
              <SubHeading>Local Demo Setup</SubHeading>
              <ol className="space-y-4 text-sm text-slate-400 list-none">
                {[
                  {
                    step: '1',
                    code: 'MAINNET_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY',
                    description: 'Set your Ethereum mainnet RPC URL in the contracts .env file',
                  },
                  {
                    step: '2',
                    code: 'cd packages/intelligence-exchange-cannes-contracts',
                    description: 'Navigate to the contracts package',
                  },
                  {
                    step: '3',
                    code: 'make demo-fork',
                    description: 'Run the demo script. This forks Ethereum mainnet, deploys all 18 contracts, and runs the full E2E test',
                  },
                ].map(({ step, code, description }) => (
                  <li key={step} className="flex gap-3">
                    <span className="text-slate-600 flex-shrink-0 font-bold">{step}.</span>
                    <div className="flex-1">
                      <div className="mb-2">{description}</div>
                      <pre className="text-xs text-slate-300 bg-slate-900/50 p-3 rounded border border-slate-700 overflow-x-auto"
                        style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                        {code}
                      </pre>
                    </div>
                  </li>
                ))}
              </ol>
            </Surface>

            <Surface className="p-4">
              <div className="text-xs text-slate-500">
                <strong className="text-slate-400">Note:</strong> The demo deploys all contracts to a local mainnet fork, so you can interact with them as if they were on mainnet without spending real ETH. All state is reset when you stop the fork.
              </div>
            </Surface>

          </div>
        </div>
      </div>
    </div>
  );
}