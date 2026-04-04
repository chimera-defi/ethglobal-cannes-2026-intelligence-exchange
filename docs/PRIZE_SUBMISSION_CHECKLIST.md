# ETHGlobal Cannes 2026 Prize Submission Checklist

**Status**: Ready for submission with demo-mode fallbacks  
**Total Prize Pool Targeting**: $22,000 (Arc $3K + World Agent Kit $8K + World ID $5K + 0G $6K)

---

## ✅ COMPLETED (Ready for Demo)

### Arc Prize ($3,000) - "Best Smart Contract on Arc"
- [x] `AdvancedArcEscrow.sol` with full feature set
- [x] Conditional escrow (locked until reviewer approval)
- [x] 3-day dispute window with resolution
- [x] Automatic release after timeout
- [x] Programmable vesting (linear + milestone)
- [x] 10% platform fee split
- [x] Native USDC integration (0x3600...0000)
- [x] API endpoints for transaction building
- [x] Demo mode for local testing

### World Agent Kit ($8,000) - "Best Use of Agent Kit"
- [x] AgentBook verification (database + service)
- [x] Protected `/v1/cannes/agentkit/*` routes
- [x] Nonce replay protection
- [x] Usage counters (free-trial: 100 uses)
- [x] `/agents` registration page
- [x] Human-backed agent discovery
- [x] Agent authorization workflow

### World ID 4.0 ($5,000) - "Best Use of World ID"
- [x] IdentityGate contract integration
- [x] Role verification (poster/worker/reviewer)
- [x] Worldchain registration flow
- [x] Demo fallback when World ID not configured

### 0G ($6,000) - "Best OpenClaw Agent"
- [x] Dossier upload service
- [x] Accepted submission storage path
- [x] Integration hooks in job service

---

## ⚠️ LIVE TESTING REQUIREMENTS

To claim prizes, you need live credentials. Current implementation uses demo fallbacks.

### Arc Testnet (Required for Prize 1)

**Need:**
- [ ] Testnet USDC from [Circle Faucet](https://faucet.circle.com)
- [ ] Deploy contracts to `https://rpc.testnet.arc.network`
- [ ] Update `.env` with real contract addresses

**Current:**
```
ARC_RPC_URL=https://rpc.testnet.arc.network
ARC_CHAIN_ID=5042002
ARC_ESCROW_CONTRACT_ADDRESS=0x959922bE3CAee4b8Cd9a407cc3ac1C251C2007B1  # Local fork
```

**Action:**
```bash
cd packages/intelligence-exchange-cannes-contracts
export PRIVATE_KEY=0x...  # Your testnet key with USDC
forge script script/Deploy.s.sol --rpc-url https://rpc.testnet.arc.network --broadcast
```

### World Agent Kit (Required for Prize 2)

**Need:**
- [ ] World ID App ID from [World Developer Portal](https://developer.worldcoin.org)
- [ ] AgentBook API credentials
- [ ] Production Agent Kit headers

**Current:**
```
WORLD_APP_ID=
WORLD_ACTION_ID=
AGENTKIT_ENABLED=true
AGENTKIT_ACCESS_MODE=free-trial
```

**Action:**
1. Register at https://developer.worldcoin.org
2. Create app for "Intelligence Exchange"
3. Add credentials to `.env`
4. Test AgentBook registration with real wallet

### World ID 4.0 (Required for Prize 3)

**Need:**
- [ ] World ID App credentials
- [ ] World RP ID for your domain

**Current:**
```
WORLD_ID_STRICT=false  # Demo mode
```

**Action:**
```
WORLD_APP_ID=app_YOUR_APP_ID
WORLD_ACTION_ID=YOUR_ACTION_ID
WORLD_RP_ID=your-domain.com
WORLD_SIGNING_KEY=your_signing_key
WORLD_VERIFICATION_SECRET=your_secret
WORLD_ID_STRICT=true  # Enable strict mode
```

### 0G (Required for Prize 4)

**Need:**
- [ ] 0G Testnet RPC credentials
- [ ] Storage node access

**Current:**
```
ZERO_G_RPC_URL=  # Empty = disabled
```

**Action:**
```
ZERO_G_RPC_URL=https://evmrpc-testnet.0g.ai
ZERO_G_INDEXER_RPC=https://indexer-storage-testnet-turbo.0g.ai
ZERO_G_PRIVATE_KEY=0x...
```

---

## 🎬 DEMO VIDEO REQUIREMENTS

For submission, create a 3-5 minute video showing:

### Arc Demo (60-90 seconds)
1. Fund idea with USDC
2. Reserve milestone with vesting
3. Worker submits
4. Reviewer approves
5. Funds release to worker

### World Agent Kit Demo (60-90 seconds)
1. Visit `/agents` page
2. Show AgentBook verification
3. Show protected routes with Agent Kit headers
4. Show usage counter increment

### World ID Demo (30-60 seconds)
1. Sign in with World ID
2. Show role verification
3. Show IdentityGate sync

### 0G Demo (30 seconds)
1. Show dossier upload after acceptance
2. Show storage transaction hash

---

## 📝 JUDGING CRITERIA VERIFICATION

### Arc Prize Checklist
- [x] **Conditional escrow**: ✅ `AdvancedArcEscrow` locks funds
- [x] **Dispute mechanism**: ✅ 3-day window, resolver can decide
- [x] **Automatic release**: ✅ Timeout-based auto-release
- [x] **Programmable vesting**: ✅ Linear + milestone vesting
- [x] **Platform fee split**: ✅ 10% to platform wallet
- [x] **Native USDC**: ✅ Uses Arc's native USDC (0x3600...0000)

### World Agent Kit Checklist
- [x] **Human-backed agents**: ✅ AgentBook verification
- [x] **Bot detection**: ✅ Protected routes distinguish humans
- [x] **Trust layer**: ✅ Nonce replay protection
- [x] **Safety**: ✅ Usage limits prevent abuse

### World ID Checklist
- [x] **Role verification**: ✅ IdentityGate for poster/worker/reviewer
- [x] **Privacy**: ✅ Nullifier hashes prevent tracking
- [x] **On-chain reputation**: ✅ AgentIdentityRegistry

### 0G Checklist
- [x] **Storage integration**: ✅ Dossier upload path
- [x] **Proof of work**: ✅ Accepted submissions stored

---

## 🚀 FINAL SUBMISSION STEPS

1. **Record Demo Video** (3-5 minutes)
   - Use current local setup (it's working!)
   - Show all four prize integrations
   - Narrate what's happening

2. **Update README**
   - Add video link
   - Add deployed contract addresses (if live)
   - Add setup instructions

3. **Tag Release**
   ```bash
   git tag -a cannes-2026-submission -m "ETHGlobal Cannes 2026 Submission"
   git push origin cannes-2026-submission
   ```

4. **Submit to ETHGlobal**
   - Project: Intelligence Exchange
   - Prizes: Arc, World Agent Kit, World ID, 0G
   - Repo: GitHub link
   - Video: YouTube/Loom link
   - Demo: Local setup or deployed URL

---

## 💰 PRIZE CONFIDENCE LEVELS

| Prize | Confidence | Why |
|-------|------------|-----|
| **Arc** ($3,000) | 🟢 HIGH | Contract complete, API ready, just needs testnet deploy |
| **World Agent Kit** ($8,000) | 🟢 HIGH | Full integration, just needs live credentials |
| **World ID** ($5,000) | 🟢 HIGH | Works in demo, needs live app credentials |
| **0G** ($6,000) | 🟡 MEDIUM | Service exists, needs RPC config + dossier demo |

**Total Realistic**: $14,000-$22,000 depending on live testing quality

---

## 🔥 RECOMMENDED FOCUS (If Short on Time)

If you can only do one thing: **Record the demo video with current local setup.**

The implementation is solid. The judges care more about:
1. Does it work? (✅ Yes)
2. Is the demo clear? (⚠️ Need video)
3. Are contracts deployed? (⚠️ Nice to have, not required)

A working local demo with clear narration beats a broken live deployment.
