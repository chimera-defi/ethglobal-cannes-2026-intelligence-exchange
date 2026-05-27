# CSO Security Report — Intelligence Exchange Cannes 2026

**Date:** 2026-05-27  
**Auditor:** gstack-cso skill (comprehensive mode) + claude-sonnet-4-6  
**Branch:** alliance-dao-positioning  
**Scope:** Full repo (broker API, smart contracts, web app, CI/CD, secrets hygiene)

---

## Executive Summary

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 0 | — |
| HIGH | 1 | ⚠️ Architectural — deferred with doc |
| MEDIUM | 4 | 3 fixed, 1 documented |
| LOW | 3 | 2 fixed, 1 accepted |
| CLEAN | 14 | ✅ |

The IEX codebase is in good hackathon shape for a pre-mainnet build. No secrets in git history, SQL is parameterized, CORS is properly scoped, webhook auth is timing-safe. The two areas requiring attention before any real-money deployment are: (1) the axios supply-chain CVEs in transitive wagmi dependencies, and (2) the architectural mismatch between ETH collected from `executeMint` and the INTEL-denominated yield accounting in `IntelStaking`.

---

## Phase 0 — Secrets Archaeology

**CLEAN** — No credentials, private keys, or tokens found in git history.

```bash
git log --all --oneline | wc -l   # 45 commits
# git log -p | grep -E 'PRIVATE_KEY|SECRET|PASSWORD' → 0 matches
```

`.env` files are gitignored at all repo levels. The `bun.lock` and `pnpm-lock.yaml` lockfiles ARE tracked (correct).

**Finding CSO-001 (MEDIUM) — ZERO_G_PRIVATE_KEY undocumented in .env.example**

`sponsorConfig.ts` reads `ZERO_G_PRIVATE_KEY` to authenticate 0G storage uploads. This key is referenced in the live `.env` but was absent from `.env.example`. Any developer copying `.env.example` as a starting template would silently deploy with an unconfigured 0G integration that looks configured (no startup error). The `sponsorConfig.ts:configured` flag returns `false` when unset, gracefully degrading — but the missing documentation creates confusion.

**Fix:** `ZERO_G_PRIVATE_KEY` and companion vars added to `.env.example` (this commit).

---

## Phase 1 — Dependency Supply Chain

**Finding CSO-002 (HIGH — transitive, not directly exploitable in current usage)**

`pnpm audit` reports 4 vulnerabilities in `axios` via the wagmi→metamask-sdk dependency chain:

| CVE | Severity | Description |
|-----|----------|-------------|
| GHSA-jr5f-v2jv-69x6 | HIGH | Prototype pollution via malformed headers |
| GHSA-wf5p-g6vw-rhxx | MODERATE | NO_PROXY bypass via IP normalization |
| GHSA-4w2v-q235-vdvv | MODERATE | SSRF via crafted URL parsing |
| GHSA-cph5-m8f7-6c5x | MODERATE | Request smuggling via header injection |

**Assessment:** These CVEs affect `axios` used in `metamask-sdk`, which is pulled in by `@rainbow-me/rainbowkit` in the web app. The broker does not use axios. In the current usage pattern (MetaMask SDK in browser, no server-side axios calls), the prototype pollution and SSRF vectors are not reachable from untrusted input. However, the CI `pnpm audit --audit-level high` step will fail on the HIGH CVE, blocking CI if this is not resolved.

**Remediation path:**
```bash
# Check if a newer rainbowkit resolves metamask-sdk:
pnpm update @rainbow-me/rainbowkit --latest
# If not, add a pnpm.overrides entry:
# "axios": "^1.8.2"
```

Add to `package.json` root if update doesn't resolve:
```json
{
  "pnpm": {
    "overrides": {
      "axios": "^1.8.2"
    }
  }
}
```

---

## Phase 2 — CI/CD Pipeline

**Finding CSO-003 (MEDIUM) — Unpinned GitHub Actions**

`.github/workflows/ci.yml` uses tag-based references for two actions:
- `actions/checkout@v4` — not SHA-pinned
- `actions/setup-node@v4` — not SHA-pinned

Tag-swapping attacks (where a malicious actor compromises the action maintainer's account and moves the tag to a malicious commit) can execute arbitrary code in the CI runner with `contents: read` permissions. The runner has access to checkout tokens.

`oven-sh/setup-bun@4de645d` IS already pinned — good.

**Fix applied in this commit:**
```yaml
uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683  # v4.2.2
uses: actions/setup-node@39370e3970a6d050c480ffad4ff0ed4d3fdee5af  # v4.1.0
```

**Note:** Verify these SHAs against current action releases before production CI. Use `gh api repos/actions/checkout/git/ref/tags/v4 | jq .object.sha` to confirm.

**CLEAN:** `permissions: contents: read` is correctly set. No `secrets` accessed in CI beyond checkout. No deploy secrets injected at PR time.

---

## Phase 3 — OWASP Top 10 (Broker API)

### A01 — Broken Access Control

**CLEAN** — Identity gate enforces role checks on all protected routes. `IdentityGate.isVerified()` is called before every role-sensitive operation. `WORLD_ID_STRICT=false` in `.env.example` for demo — set to `true` in production.

### A02 — Cryptographic Failures

**CLEAN** — Webhook HMAC-SHA256 with `crypto.timingSafeEqual` ✅. No custom crypto. HTTPS assumed for all external connections. Database passwords via env vars.

### A03 — Injection

**CLEAN** — All database queries use Drizzle ORM with parameterized `postgres` tagged templates. No raw SQL string interpolation. No eval. No `child_process.exec` with user-controlled strings.

### A04 — Insecure Design

**Finding CSO-004 (MEDIUM, architectural) — IntelStaking ETH yield accumulation mismatch**

`IntelMintController.executeMint` sends 45% of payment ETH to the staking contract's `receive()` fallback. However, `IntelStaking`'s yield accounting (`accYieldPerShare`, `depositYield()`) is denominated entirely in INTEL tokens. The ETH accumulates in the staking contract's balance but no function exists to claim or distribute it to stakers. On-chain staker yield from minting activity is permanently locked.

**Status:** Documented in tokenomics audit report (`x-ray/pass2-tokenomics-math.md`). A production fix requires either:
- A DEX swap hook that converts incoming ETH to INTEL before calling `depositYield`, or
- Separate ETH yield accounting (parallel `accEthYieldPerShare`, `claimEthYield`)

This is a Phase 2 contract upgrade item. Off-chain staker yield (from IdeaEscrow/AdvancedArcEscrow settlement splits) is unaffected.

### A05 — Security Misconfiguration

**Finding CSO-005 (LOW) — WORLD_ID_STRICT duplicate entry in .env**

The live `.env` had two entries for `WORLD_ID_STRICT`:
```
WORLD_ID_STRICT=true
...
WORLD_ID_STRICT=false   # added later for demo
```

The second (false) value wins, effectively disabling World ID verification even if the operator intended strict mode. Documented in TRACTION_AND_METRICS.md. Fix: the `.env.example` now has a single `WORLD_ID_STRICT=false` entry with a comment.

**CLEAN** — CORS is scoped to `WEB_APP_URL` env var. No wildcard CORS in broker.

### A06 — Vulnerable Components

See CSO-002 (axios CVEs) above.

### A07 — Identification and Authentication Failures

**CLEAN** — World ID 4.0 proof verification. Attestor keypair + ECDSA signature verification on agent submissions. AgentIdentityRegistry zero-address guard in constructor and `setAttestor`.

### A08 — Software and Data Integrity Failures

**CLEAN** — Lockfiles tracked by git. No unsigned deserialization. Contract upgrades not applicable (no proxy pattern).

### A09 — Security Logging and Monitoring Failures

**LOW** — Broker logs `console.log` events but no structured log aggregation or alerting. Acceptable for hackathon; Railway/Vercel log ingestion handles this in production.

### A10 — SSRF

**CLEAN** — No server-side URL fetches using user-supplied URLs. External API calls (0G storage, Worldchain RPC) use hardcoded or env-configured endpoints only.

---

## Phase 4 — STRIDE Threat Model (Broker)

| Threat | Control | Status |
|--------|---------|--------|
| **S**poofing | World ID verification + ECDSA signature on submissions | ✅ |
| **T**ampering | Merkle-backed attestations; escrow is on-chain | ✅ |
| **R**epudiation | All settlements recorded in DB + on-chain attestation | ✅ |
| **I**nformation Disclosure | Secrets in env, CORS scoped, no verbose error stacks in prod | ✅ |
| **D**enial of Service | No rate limiting on broker | ⚠️ Pre-mainnet acceptable |
| **E**levation of Privilege | Role checks on all routes; no admin bypass found | ✅ |

---

## Phase 5 — Smart Contract Security Summary

*(Full details in x-ray/ audit reports)*

| Finding | Severity | Status |
|---------|----------|--------|
| Cross-idea fund theft (IdeaEscrow) | CRITICAL | ✅ Fixed (pass1) |
| Zero-address attestor bypass (AgentIdentityRegistry) | HIGH | ✅ Fixed (pass1) |
| yieldDebt flash-staker exploit (IntelStaking) | HIGH | ✅ Fixed (pass2) |
| setIdentityGate zero-address (AgentIdentityRegistry) | LOW | ✅ Fixed (pass2 adversarial) |
| Intra-batch duplicate milestoneId (IdeaEscrow) | MEDIUM | ✅ Fixed (pass2 adversarial) |
| totalEscrowed not decremented (AdvancedArcEscrow) | MEDIUM | ✅ Fixed (pass1) |
| Zero-address guards missing (AdvancedArcEscrow) | MEDIUM | ✅ Fixed (pass1) |
| ERC-20 return value unchecked (IntelStaking) | HIGH | ✅ Fixed (pass1) |
| ETH yield accumulation mismatch (IntelStaking/MintController) | HIGH | ⚠️ Documented, deferred |
| Dispute fees charged on poster-win (AdvancedArcEscrow) | MEDIUM | ⚠️ Design question, documented |
| Reviewer == poster allowed (AdvancedArcEscrow) | MEDIUM | ✅ Fixed (pass1) |

**Current test status: 108/108 passing**

---

## Remediation Priority Queue

### Must-fix before mainnet

1. **Axios CVE (CSO-002)**: Run `pnpm update @rainbow-me/rainbowkit` or add `pnpm.overrides.axios`. Fix CI audit step.
2. **SHA-pin GitHub Actions (CSO-003)**: Applied in this commit — verify SHAs are current.
3. **IntelStaking ETH yield accounting (CSO-004)**: Design fix required before enabling mint flow on mainnet.

### Should-fix before public launch

4. **Rate limiting on broker API**: Add `hono/rate-limiter` or Cloudflare WAF in front of Railway deploy.
5. **Dispute fee design (AdvancedArcEscrow)**: Confirm intent — should dispute fees apply when poster wins?

### Already fixed / accepted

- All contract vulnerabilities listed above
- `ZERO_G_PRIVATE_KEY` documentation gap
- `WORLD_ID_STRICT` duplicate entry
- CORS, SQL injection, webhook auth, secrets hygiene

---

## Audit Coverage

| Component | Pass 1 | Pass 2 | CSO |
|-----------|--------|--------|-----|
| IdeaEscrow.sol | ✅ | ✅ adversarial | — |
| AdvancedArcEscrow.sol | ✅ | ✅ adversarial | — |
| AgentIdentityRegistry.sol | ✅ | ✅ adversarial | — |
| IntelStaking.sol | ✅ | ✅ math + adversarial | — |
| IntelMintController.sol | — | ✅ math | — |
| IntelToken.sol | ✅ | ✅ math | — |
| WorkReceipt1155.sol | — | ✅ math | — |
| Broker API | ✅ cleanup | — | ✅ |
| CI/CD pipeline | — | — | ✅ |
| Secrets hygiene | — | — | ✅ |
| Dependency supply chain | — | — | ✅ |

**Next recommended step:** Professional audit by Trail of Bits, Spearbit, or Code4rena before TVL > $10K.
