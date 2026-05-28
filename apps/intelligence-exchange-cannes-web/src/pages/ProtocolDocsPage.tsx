import React from 'react';

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

type AccessLevel = 'Public' | 'Owner' | 'Operator' | 'View' | 'Self' | 'Attestor' | 'Minter' | 'Treasury';

interface MethodRow {
  name: string;
  access: AccessLevel;
  description: string;
}

interface ContractSection {
  name: string;
  address?: string;
  methods: MethodRow[];
}

// ──────────────────────────────────────────────────────────────────────────────
// Mermaid diagram source
// ──────────────────────────────────────────────────────────────────────────────

const MERMAID_SOURCE = `flowchart TD
    U[User / Browser] -->|selfMint payable| MC[IntelMintController]
    MC -->|mintAllowance check| IS[IntelStaking]
    MC -->|consumeAllowance| IS
    MC -->|mint| IT[IntelToken ERC-20]
    MC -->|50% ETH| POL[IntelPOLManager]
    MC -->|45% ETH depositEthYield| IS
    MC -->|5% ETH| TR[Treasury]

    B[Buyer] -->|fund idea| ESC[IdeaEscrow / AdvancedArcEscrow]
    ESC -->|settlement 81/9/10| W[Worker / Staker / Treasury]
    BRK[Broker] -->|recordAcceptedSubmission| AIR[AgentIdentityRegistry]
    BRK -->|mint receipt| WR[WorkReceipt1155 ERC-1155]

    TL[IntelTimelockController 48h] -->|governs| IS
    TL -->|governs| MC
    TL -.->|holds treasury| IT2[2M INTEL reserve]

    IV[IntelVesting 4yr] -->|releases| TW[Team Wallet]
    POL -.->|Phase 2| UV3[Uniswap V3 INTEL/WETH]

    style MC fill:#1e3a5f,stroke:#3B82F6
    style IS fill:#1e3a5f,stroke:#3B82F6
    style IT fill:#1a3a1a,stroke:#22c55e
    style TL fill:#3a2a00,stroke:#F59E0B
    style IV fill:#3a2a00,stroke:#F59E0B
    style POL fill:#1a2a3a,stroke:#60a5fa
    style WR fill:#2a1a3a,stroke:#a78bfa`;

// ──────────────────────────────────────────────────────────────────────────────
// Public method reference data
// ──────────────────────────────────────────────────────────────────────────────

const CONTRACT_METHODS: ContractSection[] = [
  {
    name: 'IntelToken',
    methods: [
      { name: 'transfer(to, amount)', access: 'Public', description: 'ERC-20 transfer' },
      { name: 'approve(spender, amount)', access: 'Public', description: 'ERC-20 allowance approval' },
      { name: 'mint(to, amount)', access: 'Minter', description: 'Mint new tokens — only callable by minter role (IntelMintController)' },
      { name: 'burn(amount)', access: 'Public', description: 'Burn caller tokens' },
      { name: 'pause() / unpause()', access: 'Owner', description: 'Freeze / resume all transfers' },
      { name: 'setMinter(addr)', access: 'Owner', description: 'Set the minter address (timelock-gated in Phase 2)' },
      { name: 'transferOwnership(nominee)', access: 'Owner', description: 'Nominate new owner' },
      { name: 'acceptOwnership()', access: 'Self', description: 'Nominee accepts ownership' },
    ],
  },
  {
    name: 'IntelStaking',
    methods: [
      { name: 'stake(amount)', access: 'Public', description: 'Stake INTEL tokens into the pool' },
      { name: 'requestUnstake(amount)', access: 'Public', description: 'Queue an unstake, starts cooldown timer' },
      { name: 'claimUnstake()', access: 'Public', description: 'Claim unstaked tokens after cooldown' },
      { name: 'claimYield()', access: 'Public', description: 'Claim accumulated INTEL yield' },
      { name: 'claimEthYield()', access: 'Public', description: 'Claim accumulated ETH yield from mint revenue' },
      { name: 'depositYield(amount)', access: 'Operator', description: 'Deposit INTEL yield into pool (operator only)' },
      { name: 'depositEthYield()', access: 'Operator', description: 'Deposit ETH yield into pool — payable (operator only)' },
      { name: 'mintAllowance(account)', access: 'View', description: 'Return the current mint allowance for an account' },
      { name: 'consumeAllowance(account, amount)', access: 'Operator', description: 'Consume mint allowance — called by IntelMintController' },
      { name: 'setParams(epochLen, cooldown, K, maxStake)', access: 'Owner', description: 'Update pool parameters (timelock-gated in Phase 2)' },
      { name: 'setOperator(addr)', access: 'Owner', description: 'Set operator address' },
      { name: 'pause() / unpause()', access: 'Owner', description: 'Freeze / resume all stake operations' },
    ],
  },
  {
    name: 'IntelMintController',
    methods: [
      { name: 'selfMint(intelAmount, maxPrice)', access: 'Public', description: 'Buy INTEL with ETH at the current bonding curve price — payable' },
      { name: 'quoteMint(intelAmount)', access: 'View', description: 'Return the ETH cost for a given INTEL amount' },
      { name: 'mintPrice()', access: 'View', description: 'Return the current INTEL mint price in ETH' },
      { name: 'executeMint(to, intelAmount)', access: 'Operator', description: 'Operator-triggered mint bypassing bonding curve (allowlist path)' },
      { name: 'setEpochMintCap(cap)', access: 'Owner', description: 'Update the per-epoch mint cap (timelock-gated in Phase 2)' },
      { name: 'pauseMinting() / unpauseMinting()', access: 'Owner', description: 'Freeze / resume minting' },
      { name: 'updateTWAP()', access: 'Operator', description: 'Update the time-weighted average price oracle' },
      { name: 'setOperator(addr)', access: 'Owner', description: 'Set operator address' },
    ],
  },
  {
    name: 'IntelTimelockController',
    methods: [
      { name: 'queue(target, value, data, predecessor, salt, delay)', access: 'Owner', description: 'Queue a governance operation; minimum delay = 48h' },
      { name: 'execute(target, value, data, predecessor, salt)', access: 'Public', description: 'Execute a queued operation after delay has passed' },
      { name: 'cancel(id)', access: 'Owner', description: 'Cancel a pending operation before execution' },
      { name: 'adminCancel(id)', access: 'Owner', description: 'Emergency cancel — admin key, no delay required' },
      { name: 'setDelay(delay)', access: 'Self', description: 'Change the minimum delay — must be routed through execute()' },
      { name: 'setProposer(addr)', access: 'Self', description: 'Change proposer address — must be routed through execute()' },
      { name: 'setAdmin(addr)', access: 'Self', description: 'Change admin address — must be routed through execute()' },
    ],
  },
  {
    name: 'IntelVesting',
    methods: [
      { name: 'vestedAmount(timestamp)', access: 'View', description: 'Return INTEL vested as of a given timestamp' },
      { name: 'releasable()', access: 'View', description: 'Return INTEL available to release now' },
      { name: 'release()', access: 'Public', description: 'Release vested tokens to beneficiary' },
      { name: 'revoke()', access: 'Treasury', description: 'Revoke unvested tokens before cliff — treasury only' },
    ],
  },
  {
    name: 'IntelPOLManager',
    methods: [
      { name: 'withdrawEth(amount, to)', access: 'Owner', description: 'Withdraw ETH from the POL reserve' },
      { name: 'withdrawIntel(amount, to)', access: 'Owner', description: 'Withdraw INTEL from the POL reserve' },
      { name: 'enablePhase2()', access: 'Owner', description: 'Enable Phase 2 — unlock Uniswap V3 integration' },
      { name: 'deployToUniV3(ethAmount, intelAmount, tickLower, tickUpper)', access: 'Owner', description: 'Deploy liquidity to the INTEL/WETH Uniswap V3 pool — Phase 2 only' },
    ],
  },
  {
    name: 'AgentIdentityRegistry',
    methods: [
      { name: 'recordAcceptedSubmission(agentId, jobId, digest)', access: 'Attestor', description: 'Record a broker-accepted submission and update reputation score' },
      { name: 'getReputation(agentId)', access: 'View', description: 'Return the on-chain reputation score for an agent' },
      { name: 'getAttestationDigest(agentId, jobId)', access: 'View', description: 'Return the stored attestation digest for a specific submission' },
    ],
  },
  {
    name: 'WorkReceipt1155',
    methods: [
      { name: 'mint(to, jobId, data)', access: 'Operator', description: 'Mint a work receipt NFT for a completed job — operator (broker) only' },
      { name: 'setOperator(addr)', access: 'Owner', description: 'Update the operator (broker) address' },
      { name: 'uri(tokenId)', access: 'View', description: 'Return ERC-1155 metadata URI for a receipt token' },
    ],
  },
  {
    name: 'IdeaEscrow',
    methods: [
      { name: 'fundIdea(ideaId)', access: 'Public', description: 'Deposit ETH to fund a posted idea — payable' },
      { name: 'submitWork(ideaId, submissionHash)', access: 'Public', description: 'Submit work hash against a funded idea' },
      { name: 'acceptSubmission(ideaId, submissionIndex)', access: 'Public', description: 'Buyer accepts a submission; triggers 81/9/10 settlement split' },
      { name: 'disputeSubmission(ideaId, submissionIndex)', access: 'Public', description: 'Buyer disputes a submission; opens dispute window' },
    ],
  },
  {
    name: 'AdvancedArcEscrow',
    methods: [
      { name: 'fundIdea(ideaId)', access: 'Public', description: 'Deposit ETH to fund an idea — payable; identity gate enforced' },
      { name: 'submitWork(ideaId, submissionHash)', access: 'Public', description: 'Submit work with identity gate guard (WorldID or attestation)' },
      { name: 'acceptSubmission(ideaId, submissionIndex)', access: 'Public', description: 'Buyer accepts; triggers 81/9/10 settlement via IntelStaking' },
      { name: 'disputeSubmission(ideaId, submissionIndex)', access: 'Public', description: 'Buyer disputes; triggers dispute resolution flow' },
    ],
  },
];

// ──────────────────────────────────────────────────────────────────────────────
// Circuit breaker data
// ──────────────────────────────────────────────────────────────────────────────

const CIRCUIT_BREAKERS = [
  { trigger: 'IntelStaking.pause()', what: 'stake / unstake / claim all revert', reset: 'Owner (→ Timelock in Phase 2)' },
  { trigger: 'IntelMintController.pauseMinting()', what: 'selfMint / executeMint revert', reset: 'Owner (→ Timelock in Phase 2)' },
  { trigger: 'IntelToken.pause()', what: 'all ERC-20 transfers revert', reset: 'Token owner' },
  { trigger: 'maxStakePerDeposit exceeded', what: 'single deposit reverts; others unaffected', reset: 'Owner can raise cap' },
  { trigger: 'epochMintCap exceeded', what: 'minting reverts until next epoch or cap is raised', reset: 'Owner can raise cap' },
  { trigger: 'TimelockController GRACE_PERIOD expired', what: 'operation cannot execute; must be re-queued', reset: 'Re-queue via proposer' },
];

const DECENTRALIZATION_PHASES = [
  { phase: 'Now', when: 'Deployed', change: 'Deployer EOA as bootstrap operator and admin' },
  { phase: 'Month 1', when: 'After audits pass', change: 'Rotate operator to Gnosis Safe (3-of-5)' },
  { phase: 'Month 3', when: 'After mainnet stability (90d)', change: 'Transfer ownership of IntelStaking + IntelMintController to TimelockController' },
  { phase: 'Month 6', when: 'After 6mo on-chain history', change: 'Enable Uniswap V3 TWAP oracle (Phase 2 flag on IntelPOLManager)' },
  { phase: 'Month 12', when: 'After POL reserve established', change: 'Enable deployToUniV3 — full POL deployment' },
];

// ──────────────────────────────────────────────────────────────────────────────
// Badge component
// ──────────────────────────────────────────────────────────────────────────────

const ACCESS_BADGE: Record<AccessLevel | string, string> = {
  Public:    'bg-blue-900/40 text-blue-300 border border-blue-800/40',
  Owner:     'bg-amber-900/40 text-amber-300 border border-amber-800/40',
  Operator:  'bg-purple-900/40 text-purple-300 border border-purple-800/40',
  Attestor:  'bg-purple-900/40 text-purple-300 border border-purple-800/40',
  Minter:    'bg-purple-900/40 text-purple-300 border border-purple-800/40',
  Treasury:  'bg-amber-900/40 text-amber-300 border border-amber-800/40',
  View:      'bg-gray-800 text-gray-400 border border-gray-700/40',
  Self:      'bg-red-900/40 text-red-300 border border-red-800/40',
};

function AccessBadge({ level }: { level: AccessLevel }) {
  const cls = ACCESS_BADGE[level] ?? ACCESS_BADGE.View;
  return (
    <span
      className={`inline-block px-1.5 py-0.5 rounded-sm text-xs font-medium ${cls}`}
      style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
    >
      {level}
    </span>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Section heading
// ──────────────────────────────────────────────────────────────────────────────

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="text-xl font-semibold text-white mb-4 mt-10 pb-2 border-b border-slate-800"
      style={{ fontFamily: 'Departure Mono, monospace' }}
    >
      {children}
    </h2>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3
      className="text-base font-semibold text-slate-200 mb-3 mt-6"
      style={{ fontFamily: 'Departure Mono, monospace' }}
    >
      {children}
    </h3>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Main page
// ──────────────────────────────────────────────────────────────────────────────

export function ProtocolDocsPage() {
  const copyToClipboard = () => {
    navigator.clipboard.writeText(MERMAID_SOURCE).catch(() => undefined);
  };

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: '#070D1A', fontFamily: 'Plus Jakarta Sans, sans-serif' }}
    >
      <div className="max-w-5xl mx-auto px-4 py-10">
        {/* Page title */}
        <div className="mb-8">
          <h1
            className="text-3xl font-bold text-white"
            style={{ fontFamily: 'Departure Mono, monospace' }}
          >
            Protocol Reference
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Contract architecture, public method reference, security triggers, governance model, and decentralization roadmap.
          </p>
        </div>

        {/* ── Section 1: Architecture Diagram ─────────────────────────────── */}
        <SectionHeading>Contract Architecture</SectionHeading>

        <div
          className="rounded-md border border-slate-800 overflow-hidden"
          style={{ backgroundColor: '#0D1625' }}
        >
          <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800">
            <span className="text-xs text-slate-500" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
              mermaid flowchart
            </span>
            <button
              onClick={copyToClipboard}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors px-2 py-0.5 rounded-sm border border-blue-800/40 hover:border-blue-700"
            >
              Copy to Mermaid Live Editor
            </button>
          </div>
          <pre
            className="p-4 text-xs leading-relaxed overflow-x-auto"
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              color: '#C8D6E8',
              backgroundColor: '#070D1A',
            }}
          >
{`flowchart TD
    U[User / Browser] -->|selfMint payable| MC[IntelMintController]
    MC -->|mintAllowance check| IS[IntelStaking]
    MC -->|consumeAllowance| IS
    MC -->|mint| IT[IntelToken ERC-20]
    MC -->|50% ETH| POL[IntelPOLManager]
    MC -->|45% ETH depositEthYield| IS
    MC -->|5% ETH| TR[Treasury]

    B[Buyer] -->|fund idea| ESC[IdeaEscrow / AdvancedArcEscrow]
    ESC -->|settlement 81/9/10| W[Worker / Staker / Treasury]
    BRK[Broker] -->|recordAcceptedSubmission| AIR[AgentIdentityRegistry]
    BRK -->|mint receipt| WR[WorkReceipt1155 ERC-1155]

    TL[IntelTimelockController 48h] -->|governs| IS
    TL -->|governs| MC
    TL -.->|holds treasury| IT2[2M INTEL reserve]

    IV[IntelVesting 4yr] -->|releases| TW[Team Wallet]
    POL -.->|Phase 2| UV3[Uniswap V3 INTEL/WETH]`}
          </pre>
        </div>

        {/* ASCII flow summary */}
        <div
          className="mt-4 rounded-md border border-slate-800 p-4 text-xs leading-6"
          style={{
            backgroundColor: '#0D1625',
            fontFamily: 'JetBrains Mono, monospace',
            color: '#C8D6E8',
          }}
        >
          <div className="text-slate-500 mb-3 text-xs">// Contract interaction summary</div>
          <div>User (browser)</div>
          <div>  │ selfMint(intelAmount, maxPrice) [payable]</div>
          <div>  ▼</div>
          <div>IntelMintController ──checks allowance──► IntelStaking.mintAllowance()</div>
          <div>  │                  ──consumes──────────► IntelStaking.consumeAllowance()</div>
          <div>  │                  ──mints────────────► IntelToken.mint()</div>
          <div>  │</div>
          <div>  ├─ 50% ETH ──────────────────────────► IntelPOLManager (POL reserve)</div>
          <div>  ├─ 45% ETH ──────────────────────────► IntelStaking.depositEthYield()</div>
          <div>  └─  5% ETH ──────────────────────────► Treasury</div>
          <div className="mt-3">User (buyer) ──funds idea──► IdeaEscrow / AdvancedArcEscrow</div>
          <div>Broker ──accepts submission──► AgentIdentityRegistry.recordAcceptedSubmission()</div>
          <div>Broker ──mints receipt──────► WorkReceipt1155.mint()</div>
          <div>Settlement: Worker 81% / Staker pool 9% / Treasury 10%</div>
          <div className="mt-3">Governance:</div>
          <div>IntelTimelockController (48h delay)</div>
          <div>  ──governs──► IntelStaking (setParams, pause)</div>
          <div>  ──governs──► IntelMintController (setParams, pause)</div>
          <div>  ──holds────► Treasury reserve (2M INTEL)</div>
          <div>IntelVesting ──releases over 4yr──► Team wallet (2M INTEL)</div>
          <div>IntelPOLManager ──Phase 2──► Uniswap V3 INTEL/WETH pool</div>
        </div>

        {/* ── Section 2: Public Method Reference ──────────────────────────── */}
        <SectionHeading>Public Method Reference</SectionHeading>

        <div className="space-y-6">
          {CONTRACT_METHODS.map((contract) => (
            <div
              key={contract.name}
              className="rounded-md border border-slate-800 overflow-hidden"
              style={{ backgroundColor: '#0D1625' }}
            >
              <div className="px-4 py-2 border-b border-slate-800 bg-slate-900/60">
                <span
                  className="text-sm font-semibold text-blue-300"
                  style={{ fontFamily: 'JetBrains Mono, monospace' }}
                >
                  {contract.name}
                </span>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#070D1A' }}>
                    <th
                      className="text-left px-4 py-2 text-xs font-medium text-slate-500 w-1/3"
                      style={{ fontFamily: 'JetBrains Mono, monospace' }}
                    >
                      Function
                    </th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-slate-500 w-24">
                      Access
                    </th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-slate-500">
                      Description
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {contract.methods.map((method, i) => (
                    <tr
                      key={method.name}
                      style={{ backgroundColor: i % 2 === 0 ? '#0D1625' : '#070D1A' }}
                    >
                      <td
                        className="px-4 py-2 text-xs text-slate-300 align-top"
                        style={{ fontFamily: 'JetBrains Mono, monospace' }}
                      >
                        {method.name}
                      </td>
                      <td className="px-4 py-2 align-top">
                        <AccessBadge level={method.access} />
                      </td>
                      <td className="px-4 py-2 text-xs text-slate-400 align-top">
                        {method.description}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>

        {/* ── Section 3: Security & Circuit Breakers ───────────────────────── */}
        <SectionHeading>Security &amp; Circuit Breakers</SectionHeading>

        <SubHeading>Circuit Breakers</SubHeading>
        <div
          className="rounded-md border border-slate-800 overflow-hidden"
          style={{ backgroundColor: '#0D1625' }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#070D1A' }}>
                <th className="text-left px-4 py-2 text-xs font-medium text-slate-500">Trigger</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-slate-500">What happens</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-slate-500">Who can reset</th>
              </tr>
            </thead>
            <tbody>
              {CIRCUIT_BREAKERS.map((row, i) => (
                <tr key={row.trigger} style={{ backgroundColor: i % 2 === 0 ? '#0D1625' : '#070D1A' }}>
                  <td
                    className="px-4 py-2.5 text-xs text-red-300 align-top"
                    style={{ fontFamily: 'JetBrains Mono, monospace' }}
                  >
                    {row.trigger}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-300 align-top">{row.what}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-400 align-top">{row.reset}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <SubHeading>Decentralization Triggers</SubHeading>
        <div
          className="rounded-md border border-slate-800 overflow-hidden"
          style={{ backgroundColor: '#0D1625' }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#070D1A' }}>
                <th className="text-left px-4 py-2 text-xs font-medium text-slate-500 w-24">Phase</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-slate-500 w-40">When</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-slate-500">Change</th>
              </tr>
            </thead>
            <tbody>
              {DECENTRALIZATION_PHASES.map((row, i) => (
                <tr key={row.phase} style={{ backgroundColor: i % 2 === 0 ? '#0D1625' : '#070D1A' }}>
                  <td
                    className="px-4 py-2.5 text-xs font-semibold text-amber-300 align-top"
                    style={{ fontFamily: 'JetBrains Mono, monospace' }}
                  >
                    {row.phase}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-400 align-top">{row.when}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-300 align-top">{row.change}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Section 4: Governance ────────────────────────────────────────── */}
        <SectionHeading>Governance Model</SectionHeading>

        <div className="space-y-4">
          {/* Phase 1 */}
          <div
            className="rounded-md border border-amber-800/30 p-4"
            style={{ backgroundColor: '#0D1625' }}
          >
            <div
              className="text-sm font-semibold text-amber-300 mb-3"
              style={{ fontFamily: 'Departure Mono, monospace' }}
            >
              Phase 1 — Deployer (Current)
            </div>
            <ul className="space-y-1 text-sm text-slate-400">
              <li className="flex gap-2">
                <span className="text-amber-600 mt-0.5">›</span>
                All admin keys held by deployer EOA
              </li>
              <li className="flex gap-2">
                <span className="text-amber-600 mt-0.5">›</span>
                TimelockController deployed with 48h delay
              </li>
              <li className="flex gap-2">
                <span className="text-amber-600 mt-0.5">›</span>
                Deployer is initial proposer + admin
              </li>
            </ul>
          </div>

          {/* Phase 2 */}
          <div
            className="rounded-md border border-blue-800/30 p-4"
            style={{ backgroundColor: '#0D1625' }}
          >
            <div
              className="text-sm font-semibold text-blue-300 mb-3"
              style={{ fontFamily: 'Departure Mono, monospace' }}
            >
              Phase 2 — Timelock + Multisig (Target)
            </div>
            <ul className="space-y-1 text-sm text-slate-400">
              <li className="flex gap-2">
                <span className="text-blue-500 mt-0.5">›</span>
                Gnosis Safe 3-of-5 as proposer
              </li>
              <li className="flex gap-2">
                <span className="text-blue-500 mt-0.5">›</span>
                TimelockController 48h delay gates all parameter changes
              </li>
              <li className="flex gap-2">
                <span className="text-blue-500 mt-0.5">›</span>
                Ownership of IntelStaking and IntelMintController transferred to timelock via{' '}
                <code
                  className="text-xs text-slate-300 bg-slate-800 px-1 rounded-sm"
                  style={{ fontFamily: 'JetBrains Mono, monospace' }}
                >
                  transferOwnership → acceptOwnership
                </code>
              </li>
            </ul>
          </div>

          {/* What the timelock gates */}
          <div
            className="rounded-md border border-slate-800 p-4"
            style={{ backgroundColor: '#0D1625' }}
          >
            <div
              className="text-sm font-semibold text-slate-300 mb-3"
              style={{ fontFamily: 'Departure Mono, monospace' }}
            >
              What the Timelock Gates (48h delay)
            </div>
            <ul className="space-y-1 text-sm text-slate-400">
              {[
                'setParams() on IntelStaking — epoch length, cooldown, K, caps',
                'setFloorPrice(), setEpochMintCap() on IntelMintController',
                'setMinter() on IntelToken',
                'Treasury withdrawals from IntelTimelockController balance',
              ].map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="text-slate-600 mt-0.5">›</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Emergency powers */}
          <div
            className="rounded-md border border-red-900/30 p-4"
            style={{ backgroundColor: '#0D1625' }}
          >
            <div
              className="text-sm font-semibold text-red-400 mb-3"
              style={{ fontFamily: 'Departure Mono, monospace' }}
            >
              Emergency Powers (immediate, no timelock delay)
            </div>
            <ul className="space-y-1 text-sm text-slate-400">
              {[
                'pause() on IntelStaking — can be held by 1-of-5 key for speed',
                'pauseMinting() on IntelMintController',
                'adminCancel() on TimelockController — cancel a malicious queued operation',
              ].map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="text-red-700 mt-0.5">›</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* What INTEL is NOT */}
          <div
            className="rounded-md border border-slate-800 p-4"
            style={{ backgroundColor: '#0D1625' }}
          >
            <div
              className="text-sm font-semibold text-slate-500 mb-3"
              style={{ fontFamily: 'Departure Mono, monospace' }}
            >
              What INTEL is NOT
            </div>
            <ul className="space-y-1 text-sm text-slate-500">
              {[
                'Not a governance token — no on-chain voting',
                'Not inflationary by design — max supply capped at 100M',
                'Not custodial — no protocol-held user funds outside escrows',
              ].map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="text-slate-700 mt-0.5">›</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Footer note */}
        <div className="mt-10 pb-10 text-xs text-slate-600 border-t border-slate-800 pt-4">
          Full governance spec:{' '}
          <a
            href="https://github.com/chimera-defi/ethglobal-cannes-2026-intelligence-exchange/blob/main/docs/governance.md"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-400"
          >
            docs/governance.md
          </a>
        </div>
      </div>
    </div>
  );
}
