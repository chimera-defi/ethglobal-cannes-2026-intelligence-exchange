# Pass 10 Security Audit: E2E Flow, Agent Impersonation, Browser Integration

**Date:** 2026-05-30  
**Auditor:** Devin (devin-delegate) + claude-sonnet-4-6  
**Scope:** jobService.ts, authorizationService.ts, accessService.ts, githubService.ts, identityService.ts

---

## Executive Summary

The broker correctly blocks self-acceptance and self-review. However, agent fingerprint verification is not cryptographically enforced at submission time (identity is registry-checked but not re-derived), GitHub OAuth tokens are stored in plaintext in-process memory, and SSRF protections are absent on the GitHub repo context endpoint.

---

## E2E Flow Map

```
Poster → POST /jobs (createJob)
           │
           ▼
        jobService.createJob()
           │  verifies identity via identityService
           │  writes to DB, emits jobCreated event
           ▼
Worker → POST /jobs/:id/submit
           │
           ▼
        jobService.submitJob()
           │  checks job.status == OPEN
           │  reads agentFingerprint from body ← NOT re-derived/verified
           │  writes submission to DB
           ▼
Reviewer → POST /jobs/:id/accept  OR  POST /jobs/:id/reject
           │
           ▼
        jobService.acceptJob() / rejectJob()
           │  checks reviewer != worker && reviewer != poster  ← address-only
           │  on accept: calls chainService.mintWorkReceipt()
           │             calls tokenomicsService.settle()
           │  on reject: full refund to poster
```

---

## Findings

|| ID | Severity | Location | Description | Recommendation |
||----|----------|----------|-------------|----------------|
|| E1 | HIGH | jobService.ts:206-275 | `submitJob()` accepts `agentFingerprint` from request body without re-deriving it from the agent's signing key. An attacker can submit work claiming another agent's fingerprint. | Verify fingerprint server-side: `computeAgentFingerprint(signingKey)` must match the claimed fingerprint before writing. |
|| E2 | HIGH | githubService.ts:158-186 | GitHub OAuth tokens stored in plaintext in-memory `Map`. On process restart tokens are lost; no encryption, no Redis TTL, no revocation. | Store in Redis with AES-GCM encryption. Implement TTL + revocation on logout. |
|| E3 | MEDIUM | githubService.ts:86-123 | `getRepoContext()` passes user-supplied `fullName` (e.g. `owner/repo`) directly to GitHub API URL with no validation. Could be abused to call internal GitHub Enterprise endpoints if host is configurable. | Validate `fullName` matches `^[a-zA-Z0-9._-]+/[a-zA-Z0-9._-]+$` before constructing URL. |
|| E4 | MEDIUM | githubService.ts:21-53 | OAuth token scopes not validated after exchange. Token may have `admin:org` or other unexpected scopes. | After OAuth callback, fetch token scopes via GET /user and assert only `repo` + `read:user` are present. |
|| E5 | LOW | jobService.ts:287-295 | Self-acceptance check is address-equality only. No signature verification that the reviewer actually controls the address. Sybil addresses could bypass if onboarding is permissionless. | Acceptable for now if `IdentityGate` + World ID onboarding gate is enforced. Verify gate is active. |
|| E6 | LOW | accessService.ts:58-87 | `requireAgentAuthorization()` checks registry membership but does not verify the fingerprint was derived from the caller's key. | Cross-check: fingerprint in JWT must match registry entry for caller address. |
|| E7 | INFO | jobService.ts:298-302 | ReviewerQueue assignment bypass logs a warning but does not block. Any reviewer can self-assign outside the queue during backpressure. | Promote to hard enforcement or add monitoring alert. |

---

## Pass/Fail Summary

|| Check | Status |
||-------|--------|
|| Self-acceptance prevention | ✅ PASS (address check present) |
|| Agent fingerprint re-verification at submit | ❌ FAIL (body value trusted) |
|| GitHub token encryption at rest | ❌ FAIL (plaintext in-memory) |
|| SSRF protection on GitHub API calls | ❌ FAIL (no URL validation) |
|| Auth middleware on accept/reject routes | ✅ PASS |
|| Tokenomics routing on acceptance | ✅ PASS (see pass10-tokenomics-audit.md) |

---

## Audit Status: ⚠️ REQUIRES FIXES (2 HIGH before production)