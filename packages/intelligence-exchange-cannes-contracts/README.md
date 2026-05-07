## Foundry

**Foundry is a blazing fast, portable and modular toolkit for Ethereum application development written in Rust.**

Foundry consists of:

-   **Forge**: Ethereum testing framework (like Truffle, Hardhat and DappTools).
-   **Cast**: Swiss army knife for interacting with EVM smart contracts, sending transactions and getting chain data.
-   **Anvil**: Local Ethereum node, akin to Ganache, Hardhat Network.
-   **Chisel**: Fast, utilitarian, and verbose solidity REPL.

## Documentation

https://book.getfoundry.sh/

## Usage

### Build

```shell
$ forge build
```

### Test

```shell
$ forge test
```

### Format

```shell
$ forge fmt
```

### Gas Snapshots

```shell
$ forge snapshot
```

### Anvil

```shell
$ anvil
```

### Deploy

```shell
$ forge script script/Counter.s.sol:CounterScript --rpc-url <your_rpc_url> --private-key <your_private_key>
```

### Cast

```shell
$ cast <subcommand>
```

### Help

```shell
$ forge --help
$ anvil --help
$ cast --help
```

## Mainnet Fork Liquidity Harness

Start an Ethereum mainnet fork (default RPC: `https://ethereum.publicnode.com`):

```shell
corepack pnpm --filter intelligence-exchange-cannes-contracts mainnet:fork
```

Deploy `INTEL` and seed a WETH/INTEL Uniswap V2 pool on the running fork:

```shell
MAINNET_FORK_RPC_URL=http://127.0.0.1:8545 \
PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
corepack pnpm --filter intelligence-exchange-cannes-contracts deploy:intel-liquidity:mainnet-fork
```

Run an end-to-end smoke test (starts fork, deploys liquidity, verifies reserves, shuts down):

```shell
corepack pnpm --filter intelligence-exchange-cannes-contracts smoke:intel-liquidity:mainnet-fork
```

If a public RPC is rate-limited, pass multiple fallback endpoints:

```shell
MAINNET_RPC_URLS="https://ethereum.publicnode.com,https://eth.merkle.io,https://eth.llamarpc.com" \
corepack pnpm --filter intelligence-exchange-cannes-contracts smoke:intel-liquidity:mainnet-fork
```

Deployment outputs (`INTEL_TOKEN_ADDRESS`, `INTEL_WETH_PAIR_ADDRESS`) are printed in script logs.
