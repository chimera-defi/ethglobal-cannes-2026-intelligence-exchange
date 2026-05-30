# Security Audit Findings — Intelligence Exchange

## Critical Infrastructure Vulnerabilities

### Postgres Security Issues 🔴 FIXED

**Current Configuration:**
- Port binding: `127.0.0.1:5432:5432` ✅ (localhost only)
- Default password: REMOVED ✅ (now requires explicit env var)
- Default username: REMOVED ✅ (now requires explicit env var)
- SSL/TLS encryption: ✅ AVAILABLE (docker-compose.ssl.yml)
- Network isolation: ✅ ADDED (backend network with subnet)
- Container security: ✅ ADDED (no-new-privileges, tmpfs)
- Restart policy: ✅ ADDED (unless-stopped)

**Risks Remaining:**
1. SSL/TLS requires manual certificate generation for production
2. Local process access still possible (mitigated by container security)

### Redis Security Issues 🔴 FIXED

**Current Configuration:**
- Port binding: `127.0.0.1:6379:6379` ✅ (localhost only)
- Default password: REMOVED ✅ (now requires explicit env var)
- SSL/TLS encryption: ✅ AVAILABLE (docker-compose.ssl.yml)
- Memory limits: ✅ ADDED (256mb with LRU eviction)
- Protected mode: ✅ ENABLED
- Network isolation: ✅ ADDED (backend network)
- Container security: ✅ ADDED (no-new-privileges, tmpfs)
- Restart policy: ✅ ADDED (unless-stopped)

**Risks Remaining:**
1. SSL/TLS requires manual certificate generation for production
2. ACL configuration not implemented (mitigated by protected mode)

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
- Demo mode allows operation without World ID verification (acceptable - World ID is optional dependency)
- No request rate limiting on non-admin endpoints
- No security headers (Helmet.js)
- No session timeout policies
- CORS configuration present but not enforced in production

## Dependency Security

**Status:** ✅ FIXED
- Vulnerabilities found: ws@<8.20.1, uuid@<11.1.1
- Fix applied: pnpm overrides in package.json
- Overrides: ws@^8.20.1, uuid@^11.1.1
- Status: Resolved via dependency overrides

## Test Account Keys

**Found in test files:**
- `acceptance.test.ts`: Uses Anvil dev keys for testing ✅ (acceptable for tests)
- `cli.test.ts`: Uses Anvil dev keys for testing ✅ (acceptable for tests)
- These are well-known development keys, not production secrets

## Next Steps

### Completed ✅
1. ✅ Removed hardcoded private key fallback
2. ✅ Added SSL/TLS configuration (docker-compose.ssl.yml)
3. ✅ Added network isolation between containers
4. ✅ Added Redis protected mode and memory limits
5. ✅ Fixed dependency vulnerabilities (ws, uuid)
6. ✅ Updated production security requirements
7. ✅ Added container security options
8. ✅ Removed default Postgres username (now requires explicit env var)
9. ✅ Added automated security check script

### Production Deployment Requirements 🔴
1. 🔴 Generate SSL certificates from trusted CA (not self-signed)
2. 🔴 Use docker-compose.ssl.yml for production
3. 🔴 Configure proper secrets management
4. 🔴 Set up firewall rules and DDoS protection
5. 🔴 Implement security monitoring and alerting

### Optional Configuration
- World ID verification: Set WORLD_ID_STRICT=true if you want to require World ID (optional dependency)

### Optional Enhancements ⚠️
1. ⚠️ Add Redis ACLs for fine-grained command control
2. ⚠️ Implement security headers (Helmet.js)
3. ⚠️ Add session timeout policies
4. ⚠️ Implement rate limiting per API endpoint
5. ⚠️ Add MFA for admin operations