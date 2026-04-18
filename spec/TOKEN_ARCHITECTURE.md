## TOKEN_ARCHITECTURE

### Asset Layers

### 1) Stable Funding Layer

- User funds ideas with stable-denominated value (`amountUsd`)
- Funding is synced as a chain event (`idea_funded`)
- Stable amount is an acquisition/on-ramp input that can be converted into `INTEL`

### 2) Marketplace Settlement Layer (`INTEL`)

- Broker mints and reserves `INTEL` on funded ideas
- `INTEL` is reserved at idea level before work acceptance
- `INTEL` moves between poster reserve, worker balance, staker/yield pool, and treasury balance
- All movements are recorded in `token_ledger_entries`

### 3) Optional Sponsor/Prize Escrow Layer (Arc)

- Arc escrow remains available for sponsor/prize flows
- `INTEL` settlement and Arc release can coexist for non-core prize tracks
- Arc path is optional for local product-loop iteration

### Data Model

Implemented broker tables:

- `token_accounts`
  - `stable_deposited_usd`
  - `ixp_balance` (legacy column name; represents `intel_balance`)
  - `ixp_reserved` (legacy column name; represents `intel_reserved`)
- `token_ledger_entries`
  - `entry_type`
  - `delta_ixp` (legacy column name; represents `delta_intel`)
  - `delta_stable_usd`
  - `reference_type` (`idea`, `job`)
  - `reference_id`
- `idea_token_reserves`
  - `stable_funded_usd`
  - `avg_mint_price_usd_per_ixp` (legacy column name; represents `avg_mint_price_usd_per_intel`)
  - `ixp_minted` (legacy column name; represents `intel_minted`)
  - `ixp_reserved` (legacy column name; represents `intel_reserved`)
  - `ixp_spent` (legacy column name; represents `intel_spent`)
  - `ixp_protocol_fee` (legacy column name; represents `intel_protocol_fee`)

### Control Plane

- World verification strictness is controlled by `WORLD_ID_STRICT`
- Strict mode enforces role checks on protected flows
- Non-strict mode keeps checks optional to reduce user friction in demo/local loops

### Trust and Accounting Guarantees

1. Funding idempotency via chain sync dedupe
2. Append-only token ledger for every settlement event
3. Budget-to-settlement conversion uses persisted reserve average price
4. Settlement rejection on insufficient reserve

### Future Extension (Not Yet Implemented)

- Dynamic fee schedule updates via governance
- Production LP strategy automation for POL balancing
- Receipts-to-token reward conversion windows
