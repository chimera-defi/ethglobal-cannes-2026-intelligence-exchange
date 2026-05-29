# Inference Market — Architecture

**Status:** Design draft  
**Last updated:** 2026-05-08  
**Depends on:** `packages/protocol-core/` settlement primitives

## Overview

A marketplace for model inference pricing and routing. Buyers submit prompts; the market routes to the cheapest/fastest/highest-quality model provider. Settlement in `INTEL`.

## Key Differences from Intelligence Exchange

| Dimension | Intelligence Exchange | Inference Market |
|---|---|---|
| Unit of work | Milestone | Inference request (tokens, latency, quality) |
| Claim model | Worker claims milestone | Automatic broker routing |
| Scoring | Human reviewer + rubric | LLM-as-judge + latency SLA |
| Settlement | Milestone-based | Per-request micro-payments, batched |
| Quality gate | Human approval | Automated LLM judge |

## Settlement Primitive

Reuses `protocol-core/contracts/settlement/MilestoneEscrow.sol` with batching:

- Multiple inference requests batched into a single milestone for gas efficiency
- `vestingDuration = 0` (instant on batch completion)
- `disputeWindow = 24 hours` (buyer can dispute output quality)

## System Components

### 1. Provider Registry

Inference providers register:
- Model identifier (e.g., `meta-llama/Llama-3.1-70B`, `openai/gpt-4o`)
- Price per input/output token in INTEL
- Max latency SLA (ms)
- Context window size
- Supported modalities (text, image, audio)

### 2. Routing Engine

Buyer submits:
- Prompt
- Routing preference: `cheapest`, `fastest`, `best_quality`, `balanced`
- Max price per token
- Required modalities

Broker routes to provider matching preference. Routing is deterministic and reproducible.

### 3. LLM-as-Judge Scorer

After inference completion:
- Judge model evaluates output quality on relevance, coherence, safety
- Latency measured against provider SLA
- Combined score determines payout ratio

**Important:** Judge is not decentralized in v1. Centralized judge with transparent rubric.

### 4. Batch Settlement

- Requests accumulate over 5-minute windows
- Batch milestone created with all requests
- Provider receives payout for accepted requests in batch
- Rejected requests (judge failed) are not paid

## Data Model

### `InferenceRequest`
- `requestId`
- `buyerId`
- `promptHash`
- `modelPreference` (specific model or `auto`)
- `routingPreference`
- `maxPricePerTokenIntel`
- `inputTokens`, `outputTokens`
- `latencyMs`
- `providerId`
- `judgeScore` (0-100)
- `status` (pending, routed, completed, judged, paid, disputed)

### `InferenceProvider`
- `providerId`
- `modelId`
- `pricePerInputTokenIntel`
- `pricePerOutputTokenIntel`
- `maxLatencyMs`
- `contextWindow`
- `modalities`
- `avgJudgeScore`
- `totalRequests`

## Tokenomics

- 80% provider payout
- 10% staker yield
- 10% protocol treasury (higher treasury for LLM-judge costs)

## Open Questions

1. **Judge decentralization**: Who pays for quality scoring? In v1, protocol treasury subsidizes. In v2, could use optimistic scoring with challenger bonds.
2. **Routing oracle**: Centralized broker routing vs. on-chain AMM-style routing. AMM routing would require on-chain price discovery for each provider.
3. **Model availability**: How to verify a provider actually runs the claimed model? Sampling + hash verification of output distribution?
4. **Prompt privacy**: Some buyers won't want prompts visible to broker. End-to-end encryption between buyer and provider?

## Integration with Protocol Core

```
Buyer prompt → Routing Engine → Provider inference → Judge scoring
     ↓              ↓                    ↓                  ↓
  Price limit   Provider list      Output + latency    Quality score
     ↓              ↓                    ↓                  ↓
  Batch escrow   Route choice      Latency check      Payout ratio
```

## Migration Path from Cannes

1. Reuse `protocol-core` settlement and identity layers
2. Create `apps/inference-market/` with provider registry + router
3. Add `inference` role to `RoleRegistry`
4. Create `InferenceBatcher` contract extending `MilestoneEscrow`
5. Integrate LLM judge API (external service in v1)

## Risks

- **Judge bias**: Centralized judge can be gamed or has model-specific preferences
- **Provider concentration**: Cheap providers win all routes; quality providers exit
- **Latency gaming**: Providers can cache common prompts to beat SLA without real inference
- **Cost scaling**: LLM judge costs scale with request volume; must be cheaper than inference itself
