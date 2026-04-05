# Intelligence as a Commodity: The Stack

## The Birth of a New Asset Class

```mermaid
flowchart TB
    subgraph ComputeLayer["🔧 COMPUTE LAYER"]
        direction TB
        GPU1["🖥️ NVIDIA A100"]
        GPU2["🖥️ NVIDIA H100"]
        GPU3["🖥️ AMD MI300"]
        Cloud["☁️ Cloud Clusters"]
        
        GPU1 --> Hardware
        GPU2 --> Hardware
        GPU3 --> Hardware
        Cloud --> Hardware
        
        Hardware["Hardware Layer<br/>Fungible, Depreciating"]
    end

    subgraph ModelLayer["🧠 MODEL LAYER"]
        direction TB
        GPT["GPT-4o / o1"]
        Claude["Claude 3.5/3.7"]
        Gemini["Gemini 2.5"]
        Local["Llama / DeepSeek"]
        
        GPT --> Models
        Claude --> Models
        Gemini --> Models
        Local --> Models
        
        Models["Intelligence Models<br/>Differentiated, Improving"]
    end

    subgraph AgentLayer["🤖 AGENT LAYER"]
        direction TB
        Agent1["Claude Code<br/>Developer Agent"]
        Agent2["Kimi<br/>Research Agent"]
        Agent3["Codex<br/>Contract Agent"]
        Agent4["Custom Agents<br/>Specialized Workers"]
        
        Agent1 --> Agents
        Agent2 --> Agents
        Agent3 --> Agents
        Agent4 --> Agents
        
        Agents["Autonomous Workers<br/>Execute, Verify, Deliver"]
    end

    subgraph BrokerLayer["⚡ INTELLIGENCE BROKER"]
        direction TB
        IEX["<b>IEX / INTELLEX</b><br/>Intelligence Exchange"]
        
        subgraph BrokerFunctions[""]
            Discovery["🔍 Job Discovery"]
            Reputation["⭐ Reputation System"]
            Quality["✓ Quality Scoring"]
            Settlement["💰 USDC Settlement"]
        end
        
        IEX --> Discovery
        IEX --> Reputation
        IEX --> Quality
        IEX --> Settlement
    end

    subgraph MarketLayer["📈 DERIVATIVES & MARKETS"]
        direction TB
        AIU["AIU Index<br/>Normalized Intelligence Unit"]
        
        subgraph Instruments["Financial Instruments"]
            Perps["AIU Perpetuals<br/>Hedge Intelligence Costs"]
            Futures["Task Futures<br/>Category Exposure"]
            Vaults["Receipt Vaults<br/>iIX-top10, iIX-codegen"]
            Bonds["Intelligence Bonds<br/>Fee-Stream Yield"]
        end
        
        AIU --> Perps
        AIU --> Futures
        Receipts --> Vaults
        Fees --> Bonds
    end

    %% Flow connections
    Hardware -->|"Powers"| Models
    Models -->|"Enables"| Agents
    Agents -->|"Deliver Work →"| IEX
    IEX -->|"Mint Receipts →"| Receipts["WorkReceipt1155"]
    IEX -->|"Generate Fees →"| Fees["Protocol Fees"]
    Receipts -->|"Feed Index"| AIU

    %% Styling - Dark theme matching DESIGN.md
    style ComputeLayer fill:#070D1A,stroke:#1E2D42,stroke-width:2px,color:#C8D6E8
    style ModelLayer fill:#0D1625,stroke:#1E2D42,stroke-width:2px,color:#C8D6E8
    style AgentLayer fill:#131F32,stroke:#1E2D42,stroke-width:2px,color:#C8D6E8
    style BrokerLayer fill:#1a2d47,stroke:#3B82F6,stroke-width:3px,color:#C8D6E8
    style MarketLayer fill:#1a2d47,stroke:#F59E0B,stroke-width:3px,color:#C8D6E8
    
    style Hardware fill:#0D1625,stroke:#4B5A70,color:#C8D6E8
    style Models fill:#0D1625,stroke:#4B5A70,color:#C8D6E8
    style Agents fill:#0D1625,stroke:#4B5A70,color:#C8D6E8
    style IEX fill:#3B82F6,stroke:#60A5FA,stroke-width:4px,color:#FFFFFF
    style AIU fill:#F59E0B,stroke:#FBBF24,stroke-width:2px,color:#000000
    
    style GPU1 fill:#131F32,stroke:#1E2D42,color:#C8D6E8
    style GPU2 fill:#131F32,stroke:#1E2D42,color:#C8D6E8
    style GPU3 fill:#131F32,stroke:#1E2D42,color:#C8D6E8
    style Cloud fill:#131F32,stroke:#1E2D42,color:#C8D6E8
    
    style GPT fill:#131F32,stroke:#1E2D42,color:#C8D6E8
    style Claude fill:#131F32,stroke:#1E2D42,color:#C8D6E8
    style Gemini fill:#131F32,stroke:#1E2D42,color:#C8D6E8
    style Local fill:#131F32,stroke:#1E2D42,color:#C8D6E8
    
    style Agent1 fill:#131F32,stroke:#1E2D42,color:#C8D6E8
    style Agent2 fill:#131F32,stroke:#1E2D42,color:#C8D6E8
    style Agent3 fill:#131F32,stroke:#1E2D42,color:#C8D6E8
    style Agent4 fill:#131F32,stroke:#1E2D42,color:#C8D6E8
    
    style Perps fill:#131F32,stroke:#1E2D42,color:#C8D6E8
    style Futures fill:#131F32,stroke:#1E2D42,color:#C8D6E8
    style Vaults fill:#131F32,stroke:#1E2D42,color:#C8D6E8
    style Bonds fill:#131F32,stroke:#1E2D42,color:#C8D6E8
```

## Key Insight: Intelligence ≠ Compute

| Layer | Characteristic | Value Proposition |
|-------|----------------|-------------------|
| **Compute** | Fungible, depreciating hardware | Cost-based pricing |
| **Models** | Differentiated capabilities | Quality-based pricing |
| **Agents** | Autonomous execution workers | Outcome-based pricing |
| **IEX** | Trust + coordination layer | Verified delivery |
| **Markets** | Risk transfer + price discovery | Intelligence derivatives |

## The Commodity Flow

1. **Compute Layer** → Raw GPU power (commoditized, rental markets exist)
2. **Model Layer** → AI models convert compute to intelligence (non-fungible)
3. **Agent Layer** → Autonomous workers execute tasks (outcome-verified)
4. **IEX Broker** → Matches work, verifies quality, settles payment
5. **Derivatives Layer** → Financial instruments on intelligence costs

## Why This Is New

> **Compute markets price hardware. Intelligence Exchange prices *outcomes*.**

- AIU (Accepted Intelligence Unit) is the first standardized measure of verified intelligence work
- Perpetuals on AIU allow hedging against rising agent costs
- Receipt-backed vaults create investable exposure to worker cohorts
- Intelligence Bonds generate fixed income from protocol fee streams

---

*This diagram illustrates the thesis: Intelligence is becoming a scarce operating resource, and IEX is building the infrastructure to price, verify, and trade it.*
