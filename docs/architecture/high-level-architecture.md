# High-Level Architecture

This document provides a comprehensive view of how all components in the Intelligence Exchange system interact.

## Package-Level Architecture

![Package Level Architecture](./diagrams/package-level.png)

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

![Component Interaction Map](./diagrams/component-interaction.png)

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

![Contract Architecture](./diagrams/contract-architecture.png)

## Environment Variables Map

![Environment Variables](./diagrams/environment-variables.png)

## Security Boundaries

![Security Boundaries](./diagrams/security-boundaries.png)

## Deployment View

![Deployment View](./diagrams/deployment-view.png)
