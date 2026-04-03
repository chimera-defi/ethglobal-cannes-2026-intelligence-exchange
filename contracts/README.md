# Contracts

Dedicated Foundry project for the Cannes MVP contracts.

## Commands

```bash
forge build
forge test
forge fmt --check
anvil
```

## Contracts

- `CannesMilestoneEscrow.sol`: milestone-aware escrow with reserve, release, refund, and close-out of unreserved balance
- `CannesAgentIdentityRegistry.sol`: ERC-8004-inspired registry used for poster and worker identities
