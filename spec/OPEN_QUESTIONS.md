## Intelligence Exchange Open Questions

These questions must be answered before the MVP build can be one-shot executed. They represent genuine unknown unknowns or decisions that require human input.

---

### Q1: What are the exact MVP task types and their scoring rubrics?

This is the most critical pre-build question. The platform cannot score quality without explicit rubrics. Proposed MVP set:

| Task Type | Scoring Signal | Auto-Scorable? |
|---|---|---|
| Code review | ESLint/ruff findings correctly identified, severity rating matches CI output | Yes (against CI results) |
| Test generation | Tests added pass, coverage delta >= threshold, no flaky tests | Yes (run tests) |
| PR summary | Structured output hits required fields, no hallucinated facts vs. diff | Partial (rule-based) |

**Decision needed:** Confirm this set or replace with alternatives. Each task type requires a dedicated scoring module to be built.

---

### Q2: Worker economics — is the math viable?

The fundamental tension: workers pay for AI compute with their own API keys and get paid per completed job. For this to work:

```
worker_payout_per_job > (avg_tokens_used × model_cost_per_token) + time_cost
```

Example for a "code review" job:
- Claude Sonnet input: ~4K tokens context + 1K output = ~$0.02 API cost
- Job payout at 10% platform take-rate: if buyer pays $0.30, worker gets $0.27, profit = $0.25

This works at current model prices, but:
- Workers on GPT-4o face ~4x higher API costs at the same output quality.
- Workers using local/free models (Ollama, local LLaMA) have near-zero compute cost — but quality scoring must handle output variance.

**Decision needed:** Set minimum job floor prices per task type. Define acceptable model tiers for each task class. Decide if local/unmetered models are allowed.

---

### Q3: How do you prevent workers from gaming quality scores?

Known attack vectors:
1. **Fake CI results**: worker returns fabricated lint pass/fail outputs without actually running the code.
2. **Template spam**: worker returns a slightly modified template that passes structural validation but adds no value.
3. **Sybil supply**: one actor registers multiple workers to capture available jobs.
4. **Replay attacks**: worker submits a prior job's output for a new job in the same task class.

**Mitigations needed (pick before build):**
- Reproducible test execution in an isolated sandbox (prevent fake CI).
- Semantic diversity check against recent submissions by the same worker.
- Rate limiting on claim velocity per worker account.
- Trust tier gating: new workers (T0) face score thresholds before accessing higher-value jobs.

**Decision needed:** Which mitigations are in MVP vs Phase 2? The sandbox approach (Decision for fake CI prevention) is expensive to build early but critical for trust.

---

### Q4: How does the platform differentiate from Daydreams?

Daydreams (taskmarket + router) is the closest existing competitor. From their docs:
- Agent-first task market with `claim`, `bounty`, and `auction` modes.
- Strong protocol surface (agent cards, A2A messaging).
- OpenRouter integration for model routing.

**The gap Intelligence Exchange must own:**
1. **Stable-settlement onboarding**: Daydreams is crypto-native. Intelligence Exchange uses stable-denominated budgets, acceptance-gated payout, and optional fiat bridging instead of volatile-token wages.
2. **Worker runtime + quality assurance**: Daydreams treats workers as black boxes. Intelligence Exchange actively scores outputs and enforces quality thresholds.
3. **Enterprise compliance posture**: Daydreams is open protocol. Intelligence Exchange can target regulated buyers who need auditable execution chains.

**Decision needed:** Is this differentiation enough for launch? Or should the MVP copy Daydreams' protocol surface and compete on compliance + quality?

---

### Q5: What is the worker payout onboarding path?

Stablecoin-first payout simplifies protocol settlement, but it still leaves onboarding choices:

1. **Wallet-first only**: workers receive stablecoin to a connected wallet after identity verification.
2. **Wallet-first + fiat bridge**: workers receive stablecoin by default, with an optional off-ramp or card/invoice bridge later.
3. **Wallet-first + optional token rewards**: workers receive stablecoin payout plus opt-in utility-token rewards or stake requirements for premium job classes.

Tradeoffs:
- Wallet-first is fastest for protocol delivery and best matches the current escrow demo.
- Fiat bridges improve accessibility but add operator and compliance complexity.
- Token rewards can improve stickiness, but mandatory token exposure for all workers is likely too much friction early.

**Decision needed from:** founder (risk tolerance) + legal review.

---

### Q6: What is the provider ToS compliance strategy?

Using Claude API or OpenAI API to complete jobs for third parties may violate provider terms. Current official constraints point to the same risk boundary:

- Anthropic Commercial Terms (effective 2025-06-17): customers may power their own products for end users, but may not resell the services without approval; Anthropic Credit Terms prohibit transferring or selling credits.
- OpenAI Service Credit Terms (updated 2026-01-01): service credits may not be transferred, sold, gifted, or traded; OpenAI Services Agreement also prohibits buying, selling, or transferring API keys.

**The BYOK model partially mitigates this**: workers use their own keys, executing jobs for their own account. The platform never holds or routes through provider credentials. However, this is a novel legal position.

**Decision needed:** Obtain legal review of the BYOK execution model before launch. Determine if "worker uses their own key to complete a buyer's job" constitutes prohibited resale under applicable ToS. This could be a go/no-go blocker.

---

### Q7: What is the dispute resolution process in detail?

When a buyer disputes an accepted job, what happens?

Current spec says "dispute workflow with replayable artifacts" but is not specific. Required decisions:

1. **Evidence standard**: what must the buyer submit to open a dispute? (e.g., specific test failure, incorrect fact claim)
2. **Dispute window**: how long after acceptance can a buyer dispute? (Proposed: 72 hours)
3. **Arbitration**: who decides — platform reviewer, automated re-score, or third party?
4. **Outcome options**: refund buyer only, clawback worker payout, or shared liability?
5. **Appeals**: can workers appeal a dispute decision?

**Decision needed from:** product lead + legal.

---

### Q8: What tech does the quality scorer use?

The "semantic grader model" mentioned in the spec needs to be specified:

Options:
1. **Rule-based only** (for code tasks): lint output parsing, test runner result parsing. Fast, cheap, deterministic. Limited to structured task types.
2. **LLM grader** (for prose tasks): a second LLM call evaluates the output against a rubric. Adds ~$0.02-0.05 per job in grading costs; introduces model-grader bias.
3. **Hybrid**: rule-based first pass, LLM fallback for ambiguous cases.

**Decision needed:** Which approach for MVP? Rule-based only is strongly recommended for the MVP task set (all scorable code tasks), with LLM grader as Phase 2 for prose task expansion.

---

### Q9: What is the minimum useful utility-token loop?

If the platform later launches a utility token, it needs a concrete job-facing purpose that does not replace stable settlement. Candidate utilities:

1. **Worker staking**: premium claims require stake that can be slashed for fraud or severe quality failures.
2. **Buyer access tiers**: buyers lock tokens for lower fees, larger caps, or faster routing.
3. **Reward routing**: a bounded portion of protocol take-rate funds rewards, rebates, or an optional burn sink.
4. **Points conversion**: funded task creators and accepted task finishers earn points that convert into token emissions at epoch close.

Non-goals for the first token version:
- no token-denominated base wages
- no provider-credit resale
- no claim that the token itself is a futures contract on "intelligence"

**Decision needed:** Pick the initial utility set, define whether worker stake is optional or mandatory by job class, cap how much token exposure workers can take versus stable payout, and confirm whether `points_only` tasks are platform-owned only at launch.

---

## Resolved Decisions

| Question | Resolution | Source |
|---|---|---|
| Broker API tech | Hono + Bun | ARCHITECTURE_DECISIONS.md D2 |
| Job queue | BullMQ + Redis | ARCHITECTURE_DECISIONS.md D3 |
| Worker daemon | TypeScript CLI | ARCHITECTURE_DECISIONS.md D4 |
| Worker auth model | BYOK (bring own API key) | ARCHITECTURE_DECISIONS.md D5 |
| Payment rail | stablecoin escrow first; fiat bridge optional | ARCHITECTURE_DECISIONS.md D6 |
| MVP task market mode | claim only | ARCHITECTURE_DECISIONS.md D12 |
| Supply onboarding | Curated (manual review) | ARCHITECTURE_DECISIONS.md D7 |
| Database | Postgres + Redis | ARCHITECTURE_DECISIONS.md D1/D3 |
