## TOKEN_HANDOFF_PACKAGE

### Purpose

Implementation handoff for the current stable-to-IXP tokenomics loop in this repository.

### Delivered Components

1. `packages/intelligence-exchange-cannes-tokenomics`
   - pricing and settlement engine
2. Broker DB schema + migration
   - `token_accounts`
   - `token_ledger_entries`
   - `idea_token_reserves`
3. Broker services
   - mint/reserve on funding
   - settle on acceptance
   - account/reserve snapshots
4. Broker API routes
   - `/v1/cannes/tokenomics/*`
5. Web API client typings
   - tokenomics status/quote/snapshot helpers

### Key Behaviors

1. Funding dedupe:
   - duplicate `idea_funded` sync does not remint
2. Acceptance settlement:
   - settlement returns worker payout + protocol fee
   - attestation `payoutReleased` follows settlement result
3. Reserve safety:
   - insufficient reserve returns `IXP_RESERVE_INSUFFICIENT`

### Environment Configuration

See `TOKENOMICS.md` for full variable list and defaults.

### Validation Checklist

1. `pnpm validate:all` passes
2. `make infra-down` after tests leaves no running infra services
3. Acceptance tests cover:
   - funding idempotency
   - strict verification mode behavior
   - claim/submit/accept flow with settlement flag behavior

### Open Follow-Ups

1. UI surface for tokenomics account/reserve views
2. Explicit policy decision on Arc vs internal settlement precedence in production mode
3. External LP/AMM design only after legal/compliance review
