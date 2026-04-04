const DEFAULT_ARC_TESTNET_RPC_URL = 'https://rpc.testnet.arc.network';
const DEFAULT_ZERO_G_RPC_URL = 'https://evmrpc-testnet.0g.ai';
const DEFAULT_ZERO_G_INDEXER_RPC = 'https://indexer-storage-testnet-turbo.0g.ai';

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
  const configured = Boolean(appId && rpId && action && signingKey);
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

export function getZeroGConfig() {
  return {
    configured: Boolean(process.env.ZERO_G_PRIVATE_KEY),
    rpcUrl: process.env.ZERO_G_RPC_URL ?? DEFAULT_ZERO_G_RPC_URL,
    indexerRpcUrl: process.env.ZERO_G_INDEXER_RPC ?? DEFAULT_ZERO_G_INDEXER_RPC,
    privateKey: process.env.ZERO_G_PRIVATE_KEY,
    chainId: Number(process.env.ZERO_G_CHAIN_ID ?? '16602'),
    explorerBaseUrl: process.env.ZERO_G_EXPLORER_BASE_URL ?? 'https://chainscan-galileo.0g.ai/tx/',
  };
}

export function getIntegrationStatus() {
  const world = getWorldConfig();
  const arc = getArcConfig();
  const zeroG = getZeroGConfig();

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
    zeroG: {
      mode: zeroG.configured ? 'live' : 'demo',
      rpcUrl: zeroG.rpcUrl,
      indexerRpcUrl: zeroG.indexerRpcUrl,
      chainId: zeroG.chainId,
    },
  };
}
