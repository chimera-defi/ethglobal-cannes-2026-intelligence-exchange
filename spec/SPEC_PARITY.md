## Current Spec Parity

Snapshot as of 2026-04-04.

Short version:

- Cannes MVP spec: high parity for the core judgeable loop
- Full `SPEC.md` v1 surface: medium parity
- Agent-first v2: mostly roadmap
- Cannes prize mapping: strongest today on Arc, World ID 4.0, and 0G

## Cannes MVP Parity

Implemented in the repo today:

- poster wallet sign-in plus World-gated idea creation
- funded idea flow with planning and milestone reservation sync
- worker authorization, signed claim, `skill.md` pickup, submit, and unclaim
- human accept / reject flow
- release sync plus accepted-submission attestation sync
- accepted dossier upload to 0G when a live environment is configured
- local deterministic demo mode with seeded jobs and acceptance coverage

Still conditional or incomplete:

- public-network proof depends on real Arc, World, and 0G environment configuration
- demo fallbacks still exist in parts of the UI so rehearsals do not block on sponsor uptime
- the marketplace remains controlled-supply rather than open-liquidity

## Full Spec Parity (`SPEC.md`)

### 1. Buyer API and job ingress

Status: partial

- implemented as Cannes-specific idea ingress and milestone planning
- not yet exposed as the broader generic `/v1/jobs` product surface described in the base spec

### 2. Broker and matching engine

Status: partial

- queueing, lease-based claims, and requeue handling are implemented
- multi-objective routing, shadow workers, and richer pricing policy are not

### 3. Worker runtime

Status: partial

- local worker CLI exists and the web app supports signed worker actions
- no always-on hosted runner or true autonomous worker daemon

### 4. Prompt packaging and execution sandbox

Status: partial

- broker-generated `skill.md` packaging exists
- deterministic sandbox checks and deeper telemetry remain limited

### 5. Quality, trust, and abuse layer

Status: partial

- deterministic scoring, World gating, agent authorization, and reputation attestation exist
- semantic grader pipelines, abuse heuristics, and validation registries are not first-class yet

### 6. Ledger and settlement

Status: partial

- funding, reservation, release, and attestation sync exist
- settlement batches, dispute cases, and adapterized payment rails are still spec-level

## Agent-First V2 Parity

Status: low

Not implemented yet:

- `claim` / `bounty` / `benchmark` / `auction` task-market modes as live broker behavior
- bid flow
- agent manifest ingestion
- A2A messaging
- deterministic autonomous state / action loop
- clean payment, identity, and messaging adapter interfaces

What does exist as groundwork:

- signed worker actions
- agent fingerprints and on-chain registration sync
- attested reputation updates

Those are useful foundations, but they are not v2 parity on their own.

## Cannes Prize Mapping Parity

### Arc

Status: strong but partial

- escrow contracts exist
- funding and release sync are wired
- spend events can be recorded against the job lifecycle
- repo still needs stronger proof of real onchain nanopayment execution to fully lean on the agent-economy story

### World ID 4.0

Status: strong

- posters, workers, and reviewers can be role-gated
- wallet-backed sessions and signed worker actions are already part of the flow

### Agent Kit

Status: weak / follow-up

- there is no explicit Agent Kit-specific workflow or user-facing product surface in the repo today
- current World alignment is more honest as World ID 4.0 than as Agent Kit

### 0G

Status: strong but environment-dependent

- accepted dossiers can upload through the live 0G SDK path
- public proof still depends on real environment configuration

### ENS and Ledger

Status: planned only

- narrative-level add-ons in the spec
- not implemented in the current product

## README And Landing Page Changes To Keep Honest

README should:

- name the actual primary prize targets
- distinguish current implementation from v2 roadmap
- include separate usage guidance for humans and for agents
- point reviewers to the MVP spec, prize mapping, and this parity snapshot

Landing page should:

- say "controlled-supply pilot" explicitly
- show separate "For humans" and "For agents" usage paths
- show sponsor targets with honest status, not blanket logo claims
- avoid implying open liquidity, autonomous payouts, or Agent Kit parity that the repo does not yet prove
