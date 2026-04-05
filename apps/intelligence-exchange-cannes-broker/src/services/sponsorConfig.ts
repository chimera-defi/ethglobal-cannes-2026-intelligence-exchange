const DEFAULT_ARC_TESTNET_RPC_URL = 'https://rpc.testnet.arc.network';
const DEFAULT_ZERO_G_RPC_URL = 'https://evmrpc-testnet.0g.ai';
const DEFAULT_ZERO_G_INDEXER_RPC = 'https://indexer-storage-testnet-turbo.0g.ai';
const DEFAULT_WORLDCHAIN_RPC_URL = 'https://worldchain-sepolia.g.alchemy.com/public';
const DEFAULT_WORLDCHAIN_CHAIN_ID = 4801;
const DEFAULT_WORLDCHAIN_AGENTBOOK_ADDRESS = '0xA23aB2712eA7BBa896930544C7d6636a96b944dA';
const DEFAULT_WORLDCHAIN_EXPLORER_BASE_URL = 'https://worldchain-sepolia.explorer.alchemy.com';

function parseBoolean(value: string | undefined, fallback = false) {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

export function getWorldConfig() {
  const appId = process.env.WORLD_APP_ID;
  const rpId = process.env.WORLD_RP_ID;
  const action = process.env.WORLD_ACTION_ID;
  const signingKey = process.env.WORLD_SIGNING_KEY ?? process.env.RP_SIGNING_KEY;
  const environment = (process.env.WORLD_ENVIRONMENT ?? 'staging') as 'production' | 'staging';
  // configured = app can show the IDKitWidget and verify proofs (signingKey is only
  // needed for the optional RP-signature/SIWE flow, not for basic verification)
  const configured = Boolean(appId && rpId && action);
  const strictFallback = process.env.NODE_ENV === 'test';

  return {
    configured,
    appId,
    rpId,
    action,
    signingKey,
    environment,
    strict: parseBoolean(process.env.WORLD_ID_STRICT, strictFallback),
  };
}

export function getArcConfig() {
  return {
    rpcUrl: process.env.ARC_RPC_URL ?? DEFAULT_ARC_TESTNET_RPC_URL,
    chainId: Number(process.env.ARC_CHAIN_ID ?? '5042002'),
    escrowContractAddress: process.env.ARC_ESCROW_CONTRACT_ADDRESS ?? null,
    usdcAddress: process.env.ARC_USDC_ADDRESS ?? '0x3600000000000000000000000000000000000000',
  };
}

export function getWorldChainConfig() {
  return {
    rpcUrl: process.env.WORLDCHAIN_RPC_URL ?? DEFAULT_WORLDCHAIN_RPC_URL,
    chainId: Number(process.env.WORLDCHAIN_CHAIN_ID ?? String(DEFAULT_WORLDCHAIN_CHAIN_ID)),
    agentBookContractAddress: process.env.WORLDCHAIN_AGENTBOOK_CONTRACT_ADDRESS ?? DEFAULT_WORLDCHAIN_AGENTBOOK_ADDRESS,
    identityGateAddress: process.env.IEX_IDENTITY_GATE_ADDRESS ?? null,
    agentRegistryAddress: process.env.IEX_AGENT_REGISTRY_ADDRESS ?? null,
    escrowAddress: process.env.IEX_ESCROW_ADDRESS ?? null,
    explorerBaseUrl: process.env.WORLDCHAIN_EXPLORER_BASE_URL ?? DEFAULT_WORLDCHAIN_EXPLORER_BASE_URL,
  };
}

export function getAgentKitConfig() {
  const worldchain = getWorldChainConfig();
  const enabled = parseBoolean(process.env.AGENTKIT_ENABLED, true);
  const accessMode = (process.env.AGENTKIT_ACCESS_MODE ?? 'free-trial') as 'free' | 'free-trial';
  const freeTrialUses = Number(process.env.AGENTKIT_FREE_TRIAL_USES ?? '3');

  // AgentBook is deployed on World Mainnet (480), not Worldchain Sepolia.
  // Use the mainnet RPC for verifier / lookupHuman calls.
  const agentBookChainId = Number(process.env.WORLDCHAIN_MAINNET_CHAIN_ID ?? '480');
  const agentBookRpcUrl = process.env.WORLDCHAIN_MAINNET_RPC_URL ?? 'https://worldchain-mainnet.g.alchemy.com/public';

  return {
    enabled,
    headerName: 'agentkit',
    accessMode,
    freeTrialUses: Number.isFinite(freeTrialUses) && freeTrialUses > 0 ? freeTrialUses : 3,
    statement: process.env.AGENTKIT_STATEMENT ?? 'Verify your agent is backed by a real human',
    chainId: `eip155:${agentBookChainId}`,
    rpcUrl: agentBookRpcUrl,
    agentBookContractAddress: worldchain.agentBookContractAddress,
  };
}

export function getZeroGConfig() {
  return {
    configured: Boolean(process.env.ZERO_G_PRIVATE_KEY),
    rpcUrl: process.env.ZERO_G_RPC_URL ?? DEFAULT_ZERO_G_RPC_URL,
    indexerRpcUrl: process.env.ZERO_G_INDEXER_RPC ?? DEFAULT_ZERO_G_INDEXER_RPC,
    privateKey: process.env.ZERO_G_PRIVATE_KEY,
    chainId: Number(process.env.ZERO_G_CHAIN_ID ?? '16602'),
    explorerBaseUrl: process.env.ZERO_G_EXPLORER_BASE_URL ?? 'https://chainscan-galileo.0g.ai/tx/',
    identityGateAddress: process.env.ZERO_G_IDENTITY_GATE_ADDRESS ?? null,
    agentRegistryAddress: process.env.ZERO_G_AGENT_REGISTRY_ADDRESS ?? null,
    escrowAddress: process.env.ZERO_G_ESCROW_ADDRESS ?? null,
    advancedEscrowAddress: process.env.ZERO_G_ADVANCED_ESCROW_ADDRESS ?? null,
  };
}

export function getIntegrationStatus() {
  const world = getWorldConfig();
  const arc = getArcConfig();
  const zeroG = getZeroGConfig();
  const worldchain = getWorldChainConfig();
  const agentKit = getAgentKitConfig();

  return {
    world: {
      mode: world.configured ? 'live' : 'demo',
      appId: world.appId ?? null,
      rpId: world.rpId ?? null,
      action: world.action ?? null,
      environment: world.environment,
      strict: world.strict,
    },
    arc: {
      rpcUrl: arc.rpcUrl,
      chainId: arc.chainId,
      escrowContractAddress: arc.escrowContractAddress,
      usdcAddress: arc.usdcAddress,
    },
    worldchain: {
      rpcUrl: worldchain.rpcUrl,
      chainId: worldchain.chainId,
      agentBookContractAddress: worldchain.agentBookContractAddress,
      identityGateAddress: worldchain.identityGateAddress,
      agentRegistryAddress: worldchain.agentRegistryAddress,
      escrowAddress: worldchain.escrowAddress,
      explorerBaseUrl: worldchain.explorerBaseUrl,
    },
    agentKit: {
      enabled: agentKit.enabled,
      headerName: agentKit.headerName,
      accessMode: agentKit.accessMode,
      freeTrialUses: agentKit.freeTrialUses,
      statement: agentKit.statement,
      chainId: agentKit.chainId,
      agentBookContractAddress: agentKit.agentBookContractAddress,
    },
    zeroG: {
      mode: zeroG.configured ? 'live' : 'demo',
      rpcUrl: zeroG.rpcUrl,
      indexerRpcUrl: zeroG.indexerRpcUrl,
      chainId: zeroG.chainId,
      explorerBaseUrl: zeroG.explorerBaseUrl,
      identityGateAddress: zeroG.identityGateAddress,
      agentRegistryAddress: zeroG.agentRegistryAddress,
      escrowAddress: zeroG.escrowAddress,
      advancedEscrowAddress: zeroG.advancedEscrowAddress,
    },
  };
}
