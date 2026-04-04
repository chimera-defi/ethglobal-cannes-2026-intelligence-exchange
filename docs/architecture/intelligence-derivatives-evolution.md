# Intelligence Derivatives: Evolution Path

This diagram shows the progression from the current milestone marketplace to a full intelligence derivatives ecosystem.

## Phase Overview

```mermaid
flowchart TB
    subgraph Phase1["Phase 1: Current (Months 0-6)"]
        P1_Stable["Stablecoin Settlement<br/>USDC/Arc"]
        P1_Human["Human Review Gates"]
        P1_Postgres["Postgres Reputation"]
        P1_AgentKit["Agent Kit Verification"]
    end

    subgraph Phase2["Phase 2: Normalization (Months 3-9)"]
        P2_Receipt["WorkReceipt1155<br/>NFT per accepted job"]
        P2_AIU["AIU Index<br/>Normalized intelligence units"]
        P2_Oracle["Oracle Feed<br/>Daily AIU publication"]
    end

    subgraph Phase3["Phase 3: Tokenization (Months 6-12)"]
        P3_IX["IX Token<br/>Utility & coordination"]
        P3_Stake["Stake + Slash<br/>Worker collateral"]
        P3_Rewards["IXP Points<br/>Activity → Token bridge"]
    end

    subgraph Phase4["Phase 4: Derivatives Core (Months 9-15)"]
        P4_Perp["AIU Perpetuals<br/>10x max leverage"]
        P4_Futures["Task Class Futures<br/>Code, design, research"]
        P4_OI["Open Interest<br/>$5M+ target"]
    end

    subgraph Phase5["Phase 5: Structured Products (Months 12-24)"]
        P5_Vault["Receipt Vaults<br/>iIX-top10, iIX-codegen"]
        P5_Bonds["Intelligence Bonds<br/>Fee stream backed"]
        P5_Forward["Forward AIU<br/>Physical delivery"]
    end

    Phase1 -->|"Volume &<br/>Price Discovery"| Phase2
    Phase2 -->|"Index<br/>Credibility"| Phase3
    Phase3 -->|"Liquidity &<br/>Staking"| Phase4
    Phase4 -->|"Mature<br/>Markets"| Phase5

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
        Stable["USDC Payout<br/>Worker paid"]
        Fee["Platform Fee<br/>10%"]
    end

    subgraph Layer2["Layer 2: Receipts"]
        Receipt["WorkReceipt1155<br/>Minted"]
        AIU["AIU Calculated<br/>Task weight × Quality"]
    end

    subgraph Layer3["Layer 3: Tokenization"]
        IXP["IXP Points<br/>Creator + Finisher"]
        IX["IX Rewards<br/>Epoch distribution"]
    end

    subgraph Layer4["Layer 4: Derivatives"]
        Index["AIU Index<br/>24h TWAP"]
        Perp["Perpetuals<br/>Long/Short AIU"]
        Vault["Vault Shares<br/>Cohort exposure"]
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
    
    Broker->>Broker: Create attestation<br/>(jobId, score, fingerprint)
    Broker->>Broker: Sign with attestor key<br/>(ECDSA signature)
    Broker->>Agent: Return signed attestation<br/>(via API)
    
    Note over Agent,Contract: Agent-Triggered Update
    
    Agent->>Contract: recordAcceptedSubmission()<br/>+ signature
    Contract->>Contract: Verify signature<br/>matches attestor
    
    alt Valid Signature
        Contract->>Contract: Update reputation<br/>acceptedCount++, cumulativeScore
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
        Fund["Fund Job<br/>$100 USDC"]
    end

    subgraph Protocol["Protocol"]
        Escrow["AdvancedArcEscrow"]
        FeeRouter["FeeRouter"]
    end

    subgraph Workers["Workers"]
        Payout["Worker Payout<br/>$80 USDC"]
        Receipt["WorkReceipt1155"]
    end

    subgraph Treasury["Treasury"]
        Ops["Operations<br/>$15"]
        Rewards["IX Rewards<br/>$3"]
        Insurance["Insurance<br/>$2"]
    end

    subgraph Derivatives["Derivatives (Future)"]
        Vault["iIX Vault<br/>Fee share"]
        Bond["Intelligence Bond<br/>Yield"]
    end

    Fund --> Escrow --> Payout
    Escrow --> FeeRouter
    FeeRouter --> Ops
    FeeRouter --> Rewards
    FeeRouter --> Insurance
    Payout --> Receipt
    
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
