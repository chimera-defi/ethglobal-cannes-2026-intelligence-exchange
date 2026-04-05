# Intelligence Exchange Presentation Diagrams

## Overview

This directory contains architecture diagrams designed for presentations, illustrating the core thesis:

> **Intelligence is becoming a scarce operating resource — IEX is building the infrastructure to price, verify, and trade it.**

## Files

| File | Format | Purpose |
|------|--------|---------|
| `intelligence-commodity-stack.md` | Mermaid | Documentation-friendly version for embedding in specs |
| `intelligence-commodity-stack.svg` | SVG (900×1200) | Detailed presentation slide with all components |
| `intelligence-stack-vertical.svg` | SVG (1000×800) | Simplified vertical stack optimized for talks |

## The Stack Visualized

```
┌─────────────────────────────────────────────────────────────┐
│  📈 DERIVATIVES & FINANCIAL MARKETS FOR INTELLIGENCE        │
│  • AIU Perpetuals    • Task Futures                         │
│  • Receipt Vaults    • Intelligence Bonds                   │
├─────────────────────────────────────────────────────────────┤
│  ⚡ IEX / INTELLEX — INTELLIGENCE BROKER                    │
│  Verify • Coordinate • Settle                               │
├─────────────────────────────────────────────────────────────┤
│  🤖 AGENT LAYER                                             │
│  Claude Code • Kimi • Codex • Custom Agents (247 active)    │
├─────────────────────────────────────────────────────────────┤
│  🧠 MODEL LAYER                                             │
│  GPT-4o • Claude 3.5 • Gemini 2.5 • Llama/DeepSeek          │
├─────────────────────────────────────────────────────────────┤
│  🔧 COMPUTE LAYER                                           │
│  NVIDIA A100 • NVIDIA H100 • AMD MI300 • Cloud Clusters     │
└─────────────────────────────────────────────────────────────┘
```

## Key Message Points

### 1. Intelligence ≠ Compute

| Market Type | What It Prices | Example |
|-------------|----------------|---------|
| **GPU Rental** | Hardware depreciation | $2/hour for A100 |
| **USDCI** | Mortgage yield on servers | Tokenized GPU debt |
| **GPU Futures** | Hardware spot prices | Betting on GPU scarcity |
| **IEX** | **Accepted intelligence output** | Verified, benchmarked work |

### 2. The Commodity Flow

1. **Compute** → Raw GPU power (commoditized, rental markets exist)
2. **Models** → Convert compute to intelligence (differentiated, improving)
3. **Agents** → Autonomous workers (outcome-verified, reputation-tracked)
4. **IEX** → Trust and coordination layer (human review, USDC settlement)
5. **Derivatives** → Financial instruments on intelligence costs (hedging, speculation)

### 3. Why This Is New

- **AIU (Accepted Intelligence Unit)**: First standardized measure of verified intelligence work
- **Perpetuals on AIU**: Hedge against rising agent costs, like energy futures for AI
- **Receipt Vaults**: Investable exposure to worker cohorts (iIX-top10, iIX-codegen)
- **Intelligence Bonds**: Fixed income from protocol fee streams

### 4. The Endgame

> A liquid marketplace where buyers post work at fair prices, workers compete on quality, and derivatives allow hedging exposure to intelligence costs.

**Intelligence becomes as tradable as compute, but priced on output quality rather than hardware specs.**

## Usage Instructions

### For Markdown Documents

Embed the Mermaid diagram from `intelligence-commodity-stack.md`:

```markdown
![Intelligence Stack](./intelligence-commodity-stack.md)
```

### For Presentations

Use the SVG files directly:

1. **Detailed version** (`intelligence-commodity-stack.svg`): Best for detailed architecture reviews
2. **Vertical version** (`intelligence-stack-vertical.svg`): Best for stage presentations (cleaner, larger text)

### Export to PNG

If PNG is needed for specific presentation software:

```bash
# Using ImageMagick (if installed)
convert -density 300 intelligence-stack-vertical.svg intelligence-stack.png

# Or open in Chrome/Safari and screenshot
```

## Design Notes

The diagrams follow the [DESIGN.md](../../../DESIGN.md) system:

- **Background**: Navy-black (#070D1A)
- **Primary accent**: Blue (#3B82F6) for IEX layer
- **Amber accent**: (#F59E0B) for derivatives layer — signals "financial instruments"
- **Typography**: Monospace for headers, sans-serif for body
- **No decorative elements**: Every visual element communicates information

## Related Documents

- [spec/INTELLIGENCE_DERIVATIVES.md](../../../spec/INTELLIGENCE_DERIVATIVES.md) — Full derivatives specification
- [docs/architecture/intelligence-derivatives-evolution.md](../intelligence-derivatives-evolution.md) — Phase-by-phase rollout
- [README.md](../../../README.md) — The Future: Intelligence as a Tradable Asset
