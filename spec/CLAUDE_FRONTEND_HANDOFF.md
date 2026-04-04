# Claude Frontend Handoff

## Status Note

This handoff captured an earlier frontend gap list.
Parts of it have since been implemented in the repo.

Use [spec/SPEC_PARITY.md](/Users/kaustavhaldar/Documents/dev/crypto/2026/ethglobal-cannes-2026-intelligence-exchange/spec/SPEC_PARITY.md) as the current parity snapshot, and treat the rest of this document as historical frontend delta / follow-up guidance rather than the current source of truth.

## Objective

Bring the web app in `/apps/intelligence-exchange-cannes-web` into line with the authenticated product flow that is now enforced by the broker:

1. user connects wallet
2. user signs in to broker with a wallet challenge
3. user verifies the required World role
4. user creates or selects an authorized agent
5. user submits or reviews through signed/authenticated flows
6. user syncs funding, reservation, release, and attestation tx receipts back to the broker

Do not change broker, worker CLI, contracts, or shared schemas in this handoff. Frontend scope only.

## Backend Contract You Must Target

The broker no longer accepts the old demo request shapes for the core paths.

### Auth

- `POST /v1/cannes/auth/challenge`
  - Web login request body:
    - `accountAddress`
    - `purpose: "web_login"`
- `POST /v1/cannes/auth/verify`
  - Request body:
    - `challengeId`
    - `accountAddress`
    - `signature`
  - Response sets the HTTP-only session cookie `iex_session`
- `POST /v1/cannes/auth/logout`
- `GET /v1/cannes/auth/me`

Important:

- Every frontend `fetch` to broker routes that depend on session state must use `credentials: "include"`.
- The session cookie is the source of truth for web auth. Do not mirror it into local storage.

### World verification

- `POST /v1/cannes/world/verify`
  - Requires authenticated session cookie
  - Request body:
    - `role: "poster" | "worker" | "reviewer"`
    - `proof: { nullifierHash, proof, merkleRoot, verificationLevel }`
- `GET /v1/cannes/world/status`

### Agent authorization

- `GET /v1/cannes/agents/authorizations`
- `POST /v1/cannes/agents/authorizations`
  - Request body:
    - `agentType`
    - `agentVersion`
    - `role: "poster" | "worker"`
    - `permissionScope: string[]`
- `POST /v1/cannes/agents/authorizations/:authorizationId/sync-registration`
  - Request body:
    - `txHash`
    - `contractAddress`
    - `blockNumber`
    - `payload`
    - `status`
    - `onChainTokenId`

### Chain sync

- `POST /v1/cannes/chain/sync`
  - Requires authenticated session cookie
  - Supported frontend events:
    - `milestone_reserved`
    - `milestone_released`
    - `accepted_submission_attested`
  - `idea_funded` is already wrapped by `POST /ideas/:id/fund`

### Ideas and jobs

- `POST /v1/cannes/ideas`
  - Requires authenticated poster session + poster World verification
- `POST /v1/cannes/ideas/:ideaId/fund`
  - Requires authenticated poster session + poster World verification
- `POST /v1/cannes/ideas/:ideaId/plan`
  - Requires authenticated session of the poster
- `POST /v1/cannes/jobs/:jobId/claim`
  - Requires a signed wallet challenge envelope:
    - `signedAction: { accountAddress, agentFingerprint, challengeId, signature }`
- `POST /v1/cannes/jobs/:jobId/submit`
  - Same `signedAction` requirement
- `POST /v1/cannes/ideas/:ideaId/accept`
  - Requires authenticated poster or reviewer session
- `POST /v1/cannes/ideas/:ideaId/reject`
  - Requires authenticated poster or reviewer session

## Current Frontend Gaps

These files are still wired to the demo flow and need to be replaced:

- `/apps/intelligence-exchange-cannes-web/src/main.tsx`
  - No wallet provider setup.
- `/apps/intelligence-exchange-cannes-web/src/components/Nav.tsx`
  - No connect wallet button or session/auth status.
- `/apps/intelligence-exchange-cannes-web/src/api.ts`
  - Still uses old demo payloads like `buyerId`, `workerId`, `reviewerId`, `/integrations/world/verify`.
- `/apps/intelligence-exchange-cannes-web/src/pages/IdeaSubmission.tsx`
  - Uses poster text input, demo World mode, demo tx hash, and auto-plans immediately after funding without milestone reservation sync.
- `/apps/intelligence-exchange-cannes-web/src/pages/JobsBoard.tsx`
  - Uses freeform `workerId` and unsigned claim requests.
- `/apps/intelligence-exchange-cannes-web/src/pages/ReviewPanel.tsx`
  - Uses `demo-reviewer` and demo spend/review copy.
- `/apps/intelligence-exchange-cannes-web/src/pages/IdeaDetail.tsx`
  - Assumes milestones are created and ready without showing auth / chain-sync state.

## Required Implementation

### 1. Add wallet + broker session infrastructure

Files:

- `/apps/intelligence-exchange-cannes-web/src/main.tsx`
- `/apps/intelligence-exchange-cannes-web/src/components/Nav.tsx`
- new frontend auth/state modules as needed

Requirements:

- Wrap the app with `wagmi` and `RainbowKit`.
- Add a persistent connect wallet button in the nav.
- After wallet connect, expose a "Sign in" action that:
  1. calls `POST /auth/challenge`
  2. signs the returned message with the connected wallet
  3. calls `POST /auth/verify`
  4. refreshes `GET /auth/me`
- Show status chips in the nav:
  - wallet connected
  - broker session active
  - poster verified
  - worker verified
  - reviewer verified
  - active agent authorized

### 2. Replace the old API client

File:

- `/apps/intelligence-exchange-cannes-web/src/api.ts`

Requirements:

- Add `credentials: "include"` to session-dependent calls.
- Remove `/integrations/world/verify` usage from the primary flow.
- Add typed helpers for:
  - `createAuthChallenge`
  - `verifyAuthChallenge`
  - `logout`
  - `getMe`
  - `verifyWorldRole`
  - `getWorldStatus`
  - `listAgentAuthorizations`
  - `createAgentAuthorization`
  - `syncAgentRegistration`
  - `syncChainReceipt`
- Update existing helpers:
  - `createIdea` must stop sending `buyerId` / `posterAccountAddress` as the source of truth
  - `claimJob` must send `signedAction`
  - `acceptMilestone` and `rejectMilestone` must stop sending `reviewerId`

### 3. Rebuild poster onboarding and submission

File:

- `/apps/intelligence-exchange-cannes-web/src/pages/IdeaSubmission.tsx`

Requirements:

- Remove the freeform poster ID / wallet input.
- Replace the current stepper with the real gated flow:
  1. connect wallet
  2. sign in to broker
  3. verify poster role with World ID
  4. create or select a poster agent authorization if the flow needs delegation
  5. submit idea
  6. send wallet funding tx
  7. call `POST /ideas/:ideaId/fund`
  8. call `POST /ideas/:ideaId/plan`
  9. send batch milestone reservation tx
  10. call `POST /chain/sync` with `eventType: "milestone_reserved"` and `payload.jobIds`
- Do not auto-generate fake tx hashes.
- Block advancement when a prerequisite is missing and explain exactly which prerequisite is missing.

### 4. Rebuild worker claim flow around wallet auth

File:

- `/apps/intelligence-exchange-cannes-web/src/pages/JobsBoard.tsx`

Requirements:

- Remove the `workerId` text input modal as the primary identity model.
- Replace it with worker onboarding state:
  - wallet connected
  - broker session active
  - worker World verified
  - worker agent authorization created
  - on-chain registration synced
- Claim flow must:
  1. create `worker_claim` challenge
  2. sign it with wallet
  3. send `signedAction`
- The UI should display the connected operator wallet and chosen authorized fingerprint, not a fake zero address.
- Keep access to `skill.md`, but the route should be framed as the task artifact after a successful signed claim.

### 5. Rebuild review / release flow around authenticated reviewers

File:

- `/apps/intelligence-exchange-cannes-web/src/pages/ReviewPanel.tsx`

Requirements:

- Remove `demo-reviewer`.
- Require the connected reviewer or poster session before enabling accept/reject.
- Add reviewer World verification status to the page if the current user is not the poster.
- Accept flow must:
  1. call `POST /ideas/:ideaId/accept`
  2. surface the returned attestation payload
  3. let the poster submit the release tx
  4. call `POST /chain/sync` with `eventType: "milestone_released"`
  5. let the reviewer or poster sync the attestation tx with `eventType: "accepted_submission_attested"`
- Reject flow must call the authenticated reject endpoint without a fake reviewer ID.
- Remove demo-state copy like "accepted in demo state".

### 6. Update idea detail views for real state transitions

File:

- `/apps/intelligence-exchange-cannes-web/src/pages/IdeaDetail.tsx`

Requirements:

- Reflect the new job lifecycle:
  - `created` before reservation sync
  - `queued` after reservation sync
  - `claimed`
  - `submitted`
  - `accepted`
  - `settled` after release sync
- Surface escrow and attestation state clearly:
  - funded tx synced
  - reservation tx synced
  - release tx synced
  - reputation attestation synced

## UX Acceptance Criteria

Claude should consider the frontend slice done only when all of these are true:

- Nav always shows wallet connection and broker session state.
- Poster cannot create a funded idea without:
  - wallet connected
  - signed broker session
  - poster World verification
- Worker cannot claim a job without:
  - wallet connected
  - worker World verification
  - active worker authorization
  - synced on-chain registration
- Reviewer cannot accept without:
  - wallet connected
  - signed broker session
  - reviewer World verification, unless the connected account is the poster
- No UI still asks for `buyerId`, `workerId`, or `reviewerId` as the primary identity source.
- No UI still invents demo tx hashes.
- Mobile layout still supports connect, verify, authorize, fund, reserve, claim, review, release, and attestation sync.

## Recommended Implementation Order

1. Replace `/src/api.ts` and add session-aware fetch helpers.
2. Add wallet + session provider state in `/src/main.tsx`.
3. Add connect / sign-in / status UI in `/src/components/Nav.tsx`.
4. Rebuild `/src/pages/IdeaSubmission.tsx`.
5. Rebuild `/src/pages/JobsBoard.tsx`.
6. Rebuild `/src/pages/ReviewPanel.tsx`.
7. Update `/src/pages/IdeaDetail.tsx` and `/src/pages/IdeasList.tsx` for the new states.

## Notes for Claude

- The broker acceptance suite now passes against the strict authenticated flow. Use it as the backend truth source, not the old web copy.
- The broker expects wallet-signed claim and submit envelopes. Mirror the worker CLI behavior where useful.
- ERC-8004-style identity registration is now represented in the backend through authorization plus registration sync. The UI should surface the token ID and fingerprint once registration is synced.
- Keep the UI honest. Do not reintroduce demo-only copy that implies a flow succeeds without the required wallet, World, authorization, or chain-sync steps.
