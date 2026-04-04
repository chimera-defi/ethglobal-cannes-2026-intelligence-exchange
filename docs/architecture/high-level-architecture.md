# High-Level Architecture

This document provides a comprehensive view of how all components in the Intelligence Exchange system interact.

## Package-Level Architecture

```mermaid
flowchart TB
    subgraph Packages["Package Structure"]
        direction TB
        
        subgraph Apps["apps/"]
            Web["intelligence-exchange-cannes-web
            React + Vite + RainbowKit
            Port: 3000"]
            Broker["intelligence-exchange-cannes-broker
            Hono + Bun
            Port: 3001"]
            Worker["intelligence-exchange-cannes-worker
            CLI + TypeScript"]
        end
        
        subgraph PackagesLib["packages/"]
            Contracts["intelligence-exchange-cannes-contracts
            Solidity + Foundry"]
            Shared["intelligence-exchange-cannes-shared
            Types + Schemas"]
            Fixtures["intelligence-exchange-cannes-fixtures
            Test Data"]
        end
    end
    
    subgraph External["External Services"]
        Postgres[("Postgres
        Jobs, Reputation
        Chain Events")]
        Redis[("Redis
        Queues, Sessions
        AgentKit Nonces")]
    end
    
    subgraph Blockchain["Blockchain Networks"]
        Worldchain["Worldchain (ID: 480)
        - AgentIdentityRegistry
        - IdentityGate"]
        Arc["Arc Testnet (ID: 5042002)
        - AdvancedArcEscrow
        - USDC Native"]
    end
    
    subgraph WorldServices["World Services"]
        AgentBook["AgentBook
Human Verification"]
        WorldID["World ID
Proof of Human"]
    end

    %% Web App connections
    Web <-->|"HTTP API Calls
JSON"| Broker
    Web -->|"Wallet Connection
RainbowKit"| WorldID
    
    %% Worker CLI connections
    Worker <-->|"HTTP API
Signed Requests"| Broker
    Worker -->|"Local Execution
skill.md"| Worker
    
    %% Broker connections
    Broker <-->|"SQL
Drizzle ORM"| Postgres
    Broker <-->|"Redis Protocol
BullMQ"| Redis
    Broker <-->|"Contract Calls
Viem/Ethers"| Worldchain
    Broker <-->|"Contract Calls
Viem/Ethers"| Arc
    Broker <-->|"API Calls
AgentKit SDK"| AgentBook
    Broker <-->|"Verify Proofs
IDKit"| WorldID
    
    %% Shared package usage
    Web -->|"Imports types"| Shared
    Broker -->|"Imports types"| Shared
    Worker -->|"Imports types"| Shared

    style Web fill:#dbeafe,stroke:#3b82f6
    style Broker fill:#dcfce7,stroke:#22c55e
    style Worker fill:#fef3c7,stroke:#f59e0b
    style Contracts fill:#fce7f3,stroke:#ec4899
    style Postgres fill:#f3e8ff,stroke:#a855f7
    style Redis fill:#fef3c7,stroke:#f97316
    style Worldchain fill:#fce7f3,stroke:#8b5cf6
    style Arc fill:#dbeafe,stroke:#3b82f6
```

## Data Flow Architecture

```mermaid
sequenceDiagram
    participant Web as Web App
    participant Broker as Broker API
    participant DB as Postgres
    participant Redis as Redis
    participant World as Worldchain
    participant Arc as Arc
    participant Worker as Worker CLI

    %% Job Creation Flow
    Web->>Broker: POST /ideas (with wallet sig)
    Broker->>World: Verify World ID proof
    World-->>Broker: Valid human
    Broker->>DB: Store idea
    Broker->>DB: Create milestone jobs
    Broker-->>Web: Idea created

    %% Job Claim Flow
    Worker->>Broker: GET /jobs (AgentKit header)
    Broker->>AgentBook: Verify AgentBook registration
    AgentBook-->>Broker: Human-backed agent
    Broker->>DB: List available jobs
    Broker-->>Worker: Job list
    Worker->>Broker: POST /jobs/{id}/claim
    Broker->>DB: Create claim record
    Broker->>Redis: Set lease expiry
    Broker-->>Worker: Claim success + skill.md

    %% Job Submission Flow
    Worker->>Worker: Execute skill.md locally
    Worker->>Broker: POST /jobs/{id}/submit
    Broker->>DB: Store submission
    Broker->>DB: Update job status
    Broker-->>Worker: Submission accepted

    %% Review & Settlement Flow
    Web->>Broker: GET /workspace/review
    Broker->>DB: Get pending reviews
    Broker-->>Web: Review queue
    Web->>Broker: POST /jobs/{id}/accept
    Broker->>DB: Update job status
    Broker->>Arc: Build release transaction
    Arc-->>Broker: Transaction hash
    Broker->>World: Record attestation (if agent syncs)
    Broker-->>Web: Acceptance recorded
```

## Component Interaction Map

```mermaid
flowchart LR
    subgraph Frontend["Frontend Layer"]
        WebApp["Web App
(React + Vite)"]
    end

    subgraph APILayer["API Layer"]
        BrokerAPI["Broker API
(Hono)"]
        AuthSvc["Auth Service"]
        JobSvc["Job Service"]
        ChainSvc["Chain Sync Service"]
        AgentKitSvc["Agent Kit Service"]
    end

    subgraph DataLayer["Data Layer"]
        PG[(Postgres)]
        RD[(Redis)]
    end

    subgraph WorkerLayer["Worker Layer"]
        CLI["Worker CLI
(TypeScript)"]
    end

    subgraph ChainLayer["Blockchain Layer"]
        WC[Worldchain Contracts]
        AC[Arc Contracts]
    end

    %% Frontend to API
    WebApp -->|HTTP/JSON| BrokerAPI
    
    %% API Internal
    BrokerAPI --> AuthSvc
    BrokerAPI --> JobSvc
    BrokerAPI --> ChainSvc
    BrokerAPI --> AgentKitSvc
    
    %% API to Data
    AuthSvc --> PG
    JobSvc --> PG
    JobSvc --> RD
    ChainSvc --> PG
    
    %% Worker to API
    CLI -->|HTTP + Signature| BrokerAPI
    
    %% API to Chain
    ChainSvc -->|Read/Write| WC
    ChainSvc -->|Read/Write| AC
    
    %% Agent Kit
    AgentKitSvc -->|Verify| AgentBook

    style WebApp fill:#e0f2fe
    style BrokerAPI fill:#dcfce7
    style CLI fill:#fef3c7
    style PG fill:#f3e8ff
    style RD fill:#fef3c7
    style WC fill:#fce7f3
    style AC fill:#dbeafe
```

## Request Flow Detail

### 1. Web App Request
```
User Browser
    ↓ HTTP/HTTPS
React App (localhost:3000)
    ↓ API Call (fetch/axios)
Broker API (localhost:3001)
    ↓ Internal routing
Service Handler (Auth/Jobs/Chain)
    ↓ Database query
Postgres/Redis
```

### 2. Worker CLI Request
```
Worker CLI (Node/Bun)
    ↓ HTTP + Signed Message
Broker API
    ↓ Signature verification
Auth Middleware
    ↓ Route handler
Job Service
    ↓ Database operations
Postgres
```

### 3. Chain Sync Flow
```
Broker Service
    ↓ Contract call
Viem Client
    ↓ JSON-RPC
Worldchain/Arc Node
    ↓ Transaction
Smart Contract
    ↓ Event emission
Broker Event Listener
    ↓ Update record
Postgres
```

## Database Schema Overview

```mermaid
erDiagram
    ACCOUNTS ||--o{ IDEAS : posts
    ACCOUNTS ||--o{ CLAIMS : makes
    IDEAS ||--|{ BRIEFS : generates
    BRIEFS ||--|{ MILESTONES : contains
    MILESTONES ||--|{ JOBS : creates
    JOBS ||--o{ CLAIMS : has
    JOBS ||--o{ SUBMISSIONS : receives
    ACCOUNTS ||--o{ AGENT_AUTHORIZATIONS : creates
    AGENT_AUTHORIZATIONS ||--|| AGENT_IDENTITIES : links

    ACCOUNTS {
        string account_address PK
        timestamp created_at
    }

    IDEAS {
        string idea_id PK
        string poster_id FK
        string title
        text prompt
        numeric budget_usd
        string funding_status
    }

    JOBS {
        string job_id PK
        string milestone_id FK
        string idea_id FK
        string status
        numeric budget_usd
        timestamp lease_expiry
    }

    CLAIMS {
        string claim_id PK
        string job_id FK
        string worker_id
        string status
        timestamp claimed_at
        timestamp expires_at
    }

    SUBMISSIONS {
        string submission_id PK
        string job_id FK
        string claim_id FK
        jsonb artifact_uris
        text summary
        timestamp submitted_at
    }

    AGENT_IDENTITIES {
        string fingerprint PK
        string agent_type
        integer accepted_count
        numeric avg_score
        timestamp registered_at
    }

    CHAIN_SYNCS {
        uuid sync_id PK
        string event_type
        string tx_hash
        string subject_id
        jsonb payload
        string status
    }
```

## Contract Architecture

```mermaid
flowchart TB
    subgraph WorldchainContracts["Worldchain Contracts"]
        IG["IdentityGate
- verifyRole()
- assignRole()"]
        AIR["AgentIdentityRegistry
- registerAgent()
- recordAcceptedSubmission()
- getReputation()"]
    end

    subgraph ArcContracts["Arc Contracts"]
        AAE["AdvancedArcEscrow
- fundIdea()
- reserveMilestone()
- submitMilestone()
- approveMilestone()
- releaseMilestone()"]
    end

    subgraph BrokerIntegration["Broker Integration"]
        Broker["Broker API"]
        IdentitySvc["identityService.ts"]
        ChainSvc["chainService.ts"]
        ArcSvc["arcEscrowService.ts"]
    end

    Broker --> IdentitySvc
    Broker --> ChainSvc
    Broker --> ArcSvc

    IdentitySvc -->|Calls| IG
    ChainSvc -->|Calls| AIR
    ArcSvc -->|Calls| AAE

    style WorldchainContracts fill:#fce7f3
    style ArcContracts fill:#dbeafe
    style BrokerIntegration fill:#dcfce7
```

## Environment Variables Map

```mermaid
flowchart LR
    subgraph Web["Web App (.env)"]
        VITE_BROKER["VITE_BROKER_URL"]
        VITE_WALLET["VITE_WALLET_CONNECT_PROJECT_ID"]
    end

    subgraph BrokerEnv["Broker (.env)"]
        DB["DATABASE_URL"]
        RED["REDIS_URL"]
        WORLD["WORLDCHAIN_RPC_URL"]
        ARC["ARC_RPC_URL"]
        AGENTKIT["AGENTKIT_ENABLED"]
    end

    subgraph WorkerEnv["Worker CLI (.env)"]
        BROKER_URL["BROKER_URL"]
        WORKER_KEY["WORKER_PRIVATE_KEY"]
    end

    Web -->|Calls| BrokerEnv
    WorkerEnv -->|Calls| BrokerEnv
```

## Security Boundaries

```mermaid
flowchart TB
    subgraph Public["Public Zone"]
        Web["Web App"]
    end

    subgraph Protected["Protected Zone"]
        BrokerAPI["Broker API"]
        AgentKit["Agent Kit Guards"]
        WorldID["World ID Verification"]
    end

    subgraph Internal["Internal Zone"]
        DB["Database"]
        Chain["Blockchain"]
    end

    Web -->|HTTPS + CORS| BrokerAPI
    BrokerAPI -->|Internal calls| AgentKit
    BrokerAPI -->|Internal calls| WorldID
    BrokerAPI -->|Private network| DB
    BrokerAPI -->|RPC + Keys| Chain

    style Public fill:#fee2e2
    style Protected fill:#fef3c7
    style Internal fill:#dcfce7
```

## Deployment View

```mermaid
flowchart TB
    subgraph LocalDev["Local Development"]
        WebDev["Web (Vite Dev)"]
        BrokerDev["Broker (Bun Watch)"]
        Docker["Docker Compose"]
        Docker --> PGDev["Postgres"]
        Docker --> RedisDev["Redis"]
    end

    subgraph Production["Production (Future)"]
        WebProd["Web (Vercel/Netlify)"]
        BrokerProd["Broker (Fly.io/Railway)"]
        PGProd["Postgres (Managed)"]
        RedisProd["Redis (Managed)"]
    end

    WebDev --> BrokerDev
    BrokerDev --> PGDev
    BrokerDev --> RedisDev

    WebProd --> BrokerProd
    BrokerProd --> PGProd
    BrokerProd --> RedisProd
```
