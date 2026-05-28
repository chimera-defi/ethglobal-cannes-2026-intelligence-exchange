# UI Gotchas Report — Demo Day Prep

**Date:** 2026-05-28  
**Branch:** alliance-dao-positioning  
**Scope:** Frontend demo-day readiness audit

## Summary

Audited frontend pages for demo-day gotchas: contract deployment guards, fake stats, empty states, and navigation consistency. Most pages were already well-prepared. Minor improvements made to empty state messaging.

## Files Audited

- `apps/intelligence-exchange-cannes-web/src/pages/StakingPage.tsx`
- `apps/intelligence-exchange-cannes-web/src/pages/IntelMintPage.tsx`
- `apps/intelligence-exchange-cannes-web/src/pages/IdeasList.tsx`
- `apps/intelligence-exchange-cannes-web/src/pages/JobsBoard.tsx`
- `apps/intelligence-exchange-cannes-web/src/pages/LandingPage.tsx`
- `apps/intelligence-exchange-cannes-web/src/pages/IdeaDetail.tsx`
- `apps/intelligence-exchange-cannes-web/src/components/Nav.tsx`
- `apps/intelligence-exchange-cannes-web/src/main.tsx`

## Findings

### ✅ Contract-Not-Deployed Guards

**StakingPage.tsx** (lines 154-167)
- Already implements proper guard: checks `contractsDeployed` boolean
- Shows styled amber alert: "Staking contracts are not yet deployed"
- Lists required env vars: `VITE_INTEL_TOKEN_ADDRESS`, `VITE_INTEL_STAKING_ADDRESS`
- **Status:** No fix needed

**IntelMintPage.tsx** (lines 120-137)
- Already implements proper guard: checks `contractsDeployed` boolean
- Shows styled amber alert with env var instructions
- Lists all three required env vars
- **Status:** No fix needed

### ✅ Fake Stats Removal

**LandingPage.tsx**
- No hardcoded fake user counts, GMV, or transaction counts found
- Page uses badges for network status (Arc Testnet, Worldchain)
- Roadmap phases describe future plans without fake metrics
- **Status:** No fix needed

### ✅ Empty State Handling

**IdeasList.tsx** (lines 89-102)
- Already has friendly empty state: "No ideas yet"
- Includes call-to-action: "Post your first funded idea"
- **Status:** No fix needed

**JobsBoard.tsx** (lines 1667-1680) — **FIXED**
- Had empty state but message was generic: "No {activeTab} request briefs right now"
- Updated to friendlier message: "No tasks posted yet — be the first!"
- **Change:** Made empty state more welcoming and action-oriented

### ✅ Navigation Links

**Nav.tsx** vs **main.tsx** route comparison
- All nav links match defined routes:
  - `/workspace` → `<Route path="/workspace" />`
  - `/submit` → `<Route path="/submit" />`
  - `/jobs` → `<Route path="/jobs" />`
  - `/staking` → `<Route path="/staking" />`
  - `/mint` → `<Route path="/mint" />`
  - `/agents` → `<Route path="/agents" />`
  - `/ideas` → `<Route path="/ideas" />`
  - `/docs` → `<Route path="/docs" />`
- **Status:** No broken links found

## Changes Made

### JobsBoard.tsx (line 1672)
```diff
- No <span className="text-white">{activeTab}</span> request briefs right now.
+ No tasks posted yet — be the first!
```

## Conclusion

Frontend is demo-ready with minimal changes. Contract deployment guards, empty states, and navigation were already well-implemented. Only minor copy improvement was needed for the JobsBoard empty state to make it more welcoming.

## Verification

- TypeScript check: Pending
- Manual smoke test: Recommended before demo