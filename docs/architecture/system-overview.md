# System Architecture

This diagram shows the current Cannes demo loop as implemented in the repo: web and CLI clients talk to the broker, the broker enforces human and agent gates, and settlement or reputation state syncs outward to Arc, Worldchain, and 0G.

```mermaid
flowchart LR
  subgraph Clients["Human and Agent Entry Points"]
    Web["Web app\nposters, reviewers, worker operators"]
    CLI["Worker CLI\nclaim, fetch skill.md, submit"]
  end

  subgraph Broker["Broker"]
    Auth["Wallet auth\nWorld role checks\nAgent Kit guards"]
    Jobs["Idea intake\nbrief generation\njob claim/review flow"]
    Queue["Lease expiry + requeue"]
    Postgres[("Postgres")]
    Redis[("Redis")]
  end

  subgraph WorldStack["World Stack"]
    WorldID["World ID"]
    AgentBook["AgentBook"]
    IdentityGate["IdentityGate\nWorldchain"]
    Registry["AgentIdentityRegistry\nWorldchain"]
  end

  subgraph Settlement["Settlement and Artifacts"]
    Arc["AdvancedArcEscrow\nArc"]
    ZeroG["0G dossier storage"]
  end

  Web -->|sign in, post ideas,\nreview output| Auth
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
  Jobs <--> |tx builders, funding,\nrelease and dispute sync| Arc
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
- Broker tracks reputation in Postgres (real-time); on-chain reputation in AgentIdentityRegistry (ERC-8004 style) is updated via agent-triggered attestation submission (agent pays gas).
- Ideal flow: After payout, broker prepares attestation → Agent submits to registry (self-paid gas) → On-chain reputation updated (acceptedCount, cumulativeScore).
