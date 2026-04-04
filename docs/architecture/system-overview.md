# System Architecture

This diagram shows the current Cannes demo loop as implemented in the repo: web and CLI clients talk to the broker, the broker enforces human and agent gates, and settlement or reputation state syncs outward to Arc, Worldchain, and 0G.

## Data Flow Overview

```mermaid
flowchart TB
  subgraph Clients["Clients"]
    Web["Web App<br/>( posters, reviewers )"]
    CLI["Worker CLI<br/>( agents )"]
  end

  subgraph Broker["Broker API (Hono)"]
    Auth["Auth Service"]
    Jobs["Job Service"]
    Chain["Chain Sync Service"]
    AgentKit["Agent Kit Service"]
  end

  subgraph Data["Data Layer"]
    Postgres[("Postgres<br/>Jobs, Reputation<br/>Attestations")]
    Redis[("Redis<br/>Queues, Sessions<br/>Agent Kit Nonces")]
  end

  subgraph World["World Stack"]
    WorldID["World ID<br/>Human Verification"]
    AgentBook["AgentBook<br/>Human-Backed Check"]
    IdentityGate["IdentityGate<br/>Role Verification"]
    Registry["AgentIdentityRegistry<br/>ERC-8004 Reputation"]
  end

  subgraph Settlement["Settlement"]
    Arc["AdvancedArcEscrow<br/>USDC Escrow"]
    ZeroG["0G Storage<br/>Dossier Upload"]
  end

  %% Client flows
  Web -->|"1. Sign in"| Auth
  CLI -->|"1. Agent Kit header"| Auth
  
  %% Auth flows
  Auth <-->|"Verify human"| WorldID
  Auth <-->|"Check registration"| AgentBook
  Auth -->|"2. Authorized"| Jobs
  
  %% Job flows
  Jobs -->|"Store job"| Postgres
  Jobs -->|"Queue job"| Redis
  Jobs -->|"3. Worker claims"| CLI
  
  %% Worker completion flow
  CLI -->|"4. Submit work"| Jobs
  Jobs -->|"5. Reviewer accepts"| Web
  
  %% Settlement flow
  Jobs -->|"6. Build tx"| Chain
  Chain <-->|"Fund / Release"| Arc
  Chain -->|"Record on-chain"| Postgres
  
  %% Reputation flows
  Jobs -->|"Update reputation"| Postgres
  CLI -->|"Trigger sync (agent-paid gas)"| Registry
  Registry -->|"Verify signature"| Chain
  
  %% Worldchain flows
  Jobs <-->|"Check role"| IdentityGate
  Jobs <-->|"Register agent"| Registry
  
  %% Storage flow
  Jobs -->|"Upload dossier"| ZeroG

  style Clients fill:#e0f2fe
  style Broker fill:#dcfce7
  style Data fill:#fef3c7
  style World fill:#fce7f3
  style Settlement fill:#f3e8ff
```

## Detailed Component Diagram

```mermaid
flowchart LR
  subgraph Clients["Human and Agent Entry Points"]
    Web["Web app<br/>posters, reviewers,<br/>worker operators"]
    CLI["Worker CLI<br/>claim, fetch skill.md,<br/>submit"]
  end

  subgraph Broker["Broker"]
    Auth["Wallet auth<br/>World role checks<br/>Agent Kit guards"]
    Jobs["Idea intake<br/>brief generation<br/>job claim/review flow"]
    Queue["Lease expiry + requeue"]
    Postgres[("Postgres")]
    Redis[("Redis")]
  end

  subgraph WorldStack["World Stack"]
    WorldID["World ID"]
    AgentBook["AgentBook"]
    IdentityGate["IdentityGate<br/>Worldchain"]
    Registry["AgentIdentityRegistry<br/>Worldchain"]
  end

  subgraph Settlement["Settlement and Artifacts"]
    Arc["AdvancedArcEscrow<br/>Arc"]
    ZeroG["0G dossier storage"]
  end

  Web -->|sign in, post ideas,<br>review output| Auth
  CLI -->|signed claim/submit flow| Auth
  Auth --> Jobs
  Jobs --> Queue
  Jobs --> Postgres
  Queue --> Redis

  Auth <--> |poster / worker / reviewer proofs| WorldID
  Auth <--> |human-backed agent discovery| AgentBook
  Jobs <--> |worker role sync| IdentityGate
  Jobs <--> |registration sync + attestation| Registry
  Jobs --> |reputation tracking| Postgres
  Jobs <--> |tx builders, funding,<br>release and dispute sync| Arc
  Jobs -->|accepted dossier upload| ZeroG
```

## Current Responsibilities

- `apps/intelligence-exchange-cannes-web`: browser UI for posters, reviewers, and worker operators
- `apps/intelligence-exchange-cannes-worker`: CLI bridge for claiming work, fetching `skill.md`, and submitting results
- `apps/intelligence-exchange-cannes-broker`: Hono API, policy enforcement, queue orchestration, review loop, and chain-sync edges
- `packages/intelligence-exchange-cannes-contracts`: Worldchain identity / registry contracts plus Arc escrow contract

## Notes

- The broker remains the control plane. Human review still decides whether work is accepted.
- Arc release and dispute state are synced into broker state; the broker does not claim autonomous settlement beyond those visible hooks.
- World ID, AgentBook, IdentityGate, and the worker registry are separate gates with different purposes: human proof, agent discovery access, worker role sync, and registration / attested reputation.
<<<<<<< Updated upstream
- Broker tracks reputation in Postgres (real-time); on-chain reputation in AgentIdentityRegistry (ERC-8004 style) is updated via agent-triggered attestation submission (agent pays gas).
- Ideal flow: After payout, broker prepares attestation → Agent submits to registry (self-paid gas) → On-chain reputation updated (acceptedCount, cumulativeScore).
=======
- Broker tracks reputation in Postgres (real-time); on-chain reputation in AgentIdentityRegistry requires explicit attestation submission (agent-triggered, agent-paid gas).
>>>>>>> Stashed changes
