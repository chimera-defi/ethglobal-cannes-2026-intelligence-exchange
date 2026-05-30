# Security Audit Findings — Intelligence Exchange

## Critical Infrastructure Vulnerabilities

### Postgres Security Issues 🔴 FIXED

**Current Configuration:**
- Port binding: `127.0.0.1:5432:5432` ✅ (localhost only)
- Default password: REMOVED ✅ (now requires explicit env var)
- No SSL/TLS encryption 🔴
- No network isolation rules 🔴
- No authentication method restrictions 🔴

**Risks Remaining:**
1. No encryption in transit (plaintext credentials)
2. No protection against local privilege escalation
3. Database accessible to any process on localhost

### Redis Security Issues 🔴 FIXED

**Current Configuration:**
- Port binding: `127.0.0.1:6379:6379` ✅ (localhost only)
- Default password: REMOVED ✅ (now requires explicit env var)
- No SSL/TLS encryption 🔴
- Memory limits added ✅ (256mb with LRU eviction)
- No ACL configuration 🔴

**Risks Remaining:**
1. No encryption in transit
2. Redis commands like FLUSHDB, CONFIG can be destructive
3. No access control beyond password
4. Potential for data exfiltration if compromised

### Hardcoded Private Key 🔴 CRITICAL

**Location:** `apps/intelligence-exchange-cannes-broker/src/services/identityService.ts`
```typescript
export function getBrokerAttestorAccount() {
  const privateKey = (process.env.BROKER_ATTESTOR_PRIVATE_KEY ??
    '0x59c6995e998f97a5a0044976f5d6f5f45e26d4e9f8f6b0c27a8c34f6f14e4a72') as `0x${string}`;
  return privateKeyToAccount(privateKey);
}
```

**Risk:**
- Uses well-known Anvil development account #0 private key as fallback
- This key is publicly known and used by many developers
- If BROKER_ATTESTOR_PRIVATE_KEY is not set in production, attestation signatures will be forgeable
- Attacker could impersonate the broker and sign fake attestations

**Impact:** CRITICAL - Allows attestation forgery

**Status:** Documented in REMAINING_GAPS.md but not fixed

## Environment Variable Security

**.env File Analysis:**
- ✅ No .env files committed to repo
- ✅ Only .env.example files present
- ✅ No hardcoded API keys found
- ⚠️ No secret rotation policies defined

## Application-Level Security

**Broker API Security:**
- Admin API key validation (warns if not set) ✅
- Rate limiting on failed auth attempts ✅
- Circuit breakers for abuse prevention ✅
- Session-based authentication ✅
- Zod schema validation for inputs ✅

**Potential Issues:**
- Demo mode bypasses authentication ⚠️
- No request rate limiting on non-admin endpoints
- No security headers (Helmet.js)
- No session timeout policies
- CORS configuration present but not enforced in production

## Dependency Security

**Status:** PENDING AUDIT
- Need to run: `npm audit`, `pnpm audit`, `bun audit`
- Need to check for known vulnerabilities
- Need to verify supply chain integrity

## Test Account Keys

**Found in test files:**
- `acceptance.test.ts`: Uses Anvil dev keys for testing ✅ (acceptable for tests)
- `cli.test.ts`: Uses Anvil dev keys for testing ✅ (acceptable for tests)
- These are well-known development keys, not production secrets

## Next Steps

1. 🔴 CRITICAL: Remove hardcoded private key fallback
2. 🔴 CRITICAL: Add SSL/TLS configuration
3. 🔴 Add network isolation between containers
4. ⚠️ Add Redis ACLs
5. ⚠️ Configure Postgres authentication methods
6. ⚠️ Run dependency vulnerability scan
7. ⚠️ Implement security headers
8. ⚠️ Add session timeout policies