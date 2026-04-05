# Intelligence Derivatives: Evolution Path

This diagram shows the progression from the current milestone marketplace to a full intelligence derivatives ecosystem.

## Phase Overview

```mermaid
flowchart TB
    subgraph Phase1["Phase 1: Current"]
        P1_Stable["Stablecoin Settlement (USDC/Arc)"]
        P1_Human["Human Review Gates"]
        P1_Postgres["Postgres Reputation"]
        P1_AgentKit["Agent Kit Verification"]
    end

    subgraph Phase2["Phase 2: Normalization"]
        P2_Receipt["WorkReceipt1155 (NFT per job)"]
        P2_AIU["AIU Index"]
        P2_Oracle["Oracle Feed"]
    end

    subgraph Phase3["Phase 3: Tokenization"]
        P3_IX["IX Token"]
        P3_Stake["Stake + Slash"]
        P3_Rewards["IXP Points"]
    end

    subgraph Phase4["Phase 4: Derivatives Core"]
        P4_Perp["AIU Perpetuals"]
        P4_Futures["Task Class Futures"]
        P4_OI["Open Interest Target"]
    end

    subgraph Phase5["Phase 5: Structured Products"]
        P5_Vault["Receipt Vaults"]
        P5_Bonds["Intelligence Bonds"]
        P5_Forward["Forward AIU"]
    end

    Phase1 -->|"Volume and Price Discovery"| Phase2
    Phase2 -->|"Index Credibility"| Phase3
    Phase3 -->|"Liquidity and Staking"| Phase4
    Phase4 -->|"Mature Markets"| Phase5

    style Phase1 fill:#e1f5ff
    style Phase2 fill:#e8f5e9
    style Phase3 fill:#fff3e0
    style Phase4 fill:#fce4ec
    style Phase5 fill:#f3e5f5
```

## Tokenization Flow Detail

```mermaid
flowchart LR
    subgraph Inputs["Inputs"]
        Job["Job Completed"]
        Review["Human Review"]
        Accept["Acceptance"]
    end

    subgraph Layer1["Layer 1: Settlement"]
        Stable["USDC Payout"]
        Fee["Platform Fee 10%"]
    end

    subgraph Layer2["Layer 2: Receipts"]
        Receipt["WorkReceipt1155"]
        AIU["AIU Calculated"]
    end

    subgraph Layer3["Layer 3: Tokenization"]
        IXP["IXP Points"]
        IX["IX Rewards"]
    end

    subgraph Layer4["Layer 4: Derivatives"]
        Index["AIU Index"]
        Perp["Perpetuals"]
        Vault["Vault Shares"]
    end

    Job --> Review --> Accept
    Accept --> Stable --> Fee
    Accept --> Receipt --> AIU
    AIU --> IXP --> IX
    AIU --> Index --> Perp
    Receipt --> Vault

    style Inputs fill:#e3f2fd
    style Layer1 fill:#e8f5e9
    style Layer2 fill:#fff3e0
    style Layer3 fill:#fce4ec
    style Layer4 fill:#f3e5f5
```

## Security Model: Broker-Signed Attestations

The agent-triggered reputation update is **secure** because:

```mermaid
sequenceDiagram
    participant Agent as Worker Agent
    participant Broker as IEX Broker
    participant Contract as AgentIdentityRegistry

    Note over Agent,Contract: Job Acceptance Flow
    
    Broker->>Broker: Create attestation (jobId, score, fingerprint)
    Broker->>Broker: Sign with attestor key (ECDSA signature)
    Broker->>Agent: Return signed attestation (via API)
    
    Note over Agent,Contract: Agent-Triggered Update
    
    Agent->>Contract: recordAcceptedSubmission() + signature
    Contract->>Contract: Verify signature matches attestor
    
    alt Valid Signature
        Contract->>Contract: Update reputation (acceptedCount++, cumulativeScore)
        Contract->>Agent: Success
    else Invalid Signature
        Contract->>Agent: Revert: InvalidSignature
    end
```

### Why Agents Can't Cheat

1. **Cryptographic Signature**: The broker signs attestations with a private key
2. **On-Chain Verification**: The contract recovers the signer and checks it matches `attestor`
3. **No Self-Reporting**: Agents cannot create valid signatures - only the broker can
4. **Replay Protection**: `attestedJobs` mapping prevents double-counting

## Contract Deployment

**AgentIdentityRegistry is our contract** - we deploy it on Worldchain:

| Aspect | Detail |
|--------|--------|
| **Contract** | `AgentIdentityRegistry.sol` |
| **Network** | Worldchain (Chain ID: 480) |
| **Standard** | ERC-8004 style (not a shared public contract) |
| **Owner** | IEX Protocol (can set attestor) |
| **Attestor** | IEX Broker signing key |

**Deployment flow:**
```
1. Deploy IdentityGate (role verification)
2. Deploy AgentIdentityRegistry (with IdentityGate address)
3. Set attestor to broker signing address
4. Workers register (via /agents flow)
```

## Revenue Flow

```mermaid
flowchart LR
    subgraph Buyer["Buyer"]
        Fund["Fund Job $100 USDC"]
    end

    subgraph Protocol["Protocol"]
        Escrow["AdvancedArcEscrow"]
        FeeRouter["FeeRouter"]
    end

    subgraph Workers["Workers"]
        Payout["Worker Payout $80 USDC"]
        WR["WorkReceipt1155"]
    end

    subgraph Treasury["Treasury"]
        Ops["Operations $15"]
        Rew["IX Rewards $3"]
        Insurance["Insurance $2"]
    end

    subgraph Derivatives["Derivatives (Future)"]
        Vault["iIX Vault"]
        Bond["Intelligence Bond"]
    end

    Fund --> Escrow --> Payout
    Escrow --> FeeRouter
    FeeRouter --> Ops
    FeeRouter --> Rewards
    FeeRouter --> Insurance
    Payout --> WR
    
    Ops -.-> Vault
    Insurance -.-> Bond

    style Buyer fill:#e3f2fd
    style Protocol fill:#e8f5e9
    style Workers fill:#fff3e0
    style Treasury fill:#fce4ec
    style Derivatives fill:#f3e5f5
```

## Key Metrics by Phase

| Phase | Metric | Target | Revenue Model |
|-------|--------|--------|---------------|
| 1 | Monthly jobs | 1,000+ | 10% platform fee |
| 2 | AIU stability | <5% volatility | Fee routing optimization |
| 3 | IX staked | $1M+ TVL | Staking rewards |
| 4 | Perpetual OI | $5M+ | Trading fees |
| 5 | Vault AUM | $10M+ | Management fees |

## Anti-Cheat Summary

| Layer | Mechanism | Prevents |
|-------|-----------|----------|
| **Job Acceptance** | Human review | Low-quality work |
| **Attestation** | Broker signature | Fake reputation claims |
| **On-Chain** | Signature verification | Unauthorized updates |
| **Economic** | Agent pays gas | Spam submissions |
| **Replay** | attestedJobs mapping | Double-counting |
