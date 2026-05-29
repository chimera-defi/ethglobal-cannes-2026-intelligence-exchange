import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { createWalletClient, createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { keccak256, toBytes } from 'viem';
import { httpError } from '../services/errors';

export const adminRouter = new Hono();

// Simple Bearer token auth middleware
function requireAdminAuth(c: { req: { header: (name: string) => string | undefined } }) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw httpError('Missing or invalid Authorization header', 401, 'UNAUTHORIZED');
  }

  const token = authHeader.slice(7); // Remove 'Bearer ' prefix
  const expectedToken = process.env.ADMIN_API_KEY;

  if (!expectedToken) {
    throw httpError('ADMIN_API_KEY not configured', 500, 'ADMIN_NOT_CONFIGURED');
  }

  if (token !== expectedToken) {
    throw httpError('Invalid admin token', 403, 'FORBIDDEN');
  }
}

// Helper function to create wallet client
function createBrokerWalletClient() {
  const privateKey = process.env.BROKER_ATTESTOR_PRIVATE_KEY;
  if (!privateKey) {
    throw httpError('BROKER_ATTESTOR_PRIVATE_KEY not set', 500, 'BROKER_NOT_CONFIGURED');
  }

  const rpcUrl = process.env.WORLDCHAIN_RPC_URL;
  const chainId = process.env.WORLDCHAIN_CHAIN_ID;
  if (!rpcUrl || !chainId) {
    throw httpError('WORLDCHAIN_RPC_URL or WORLDCHAIN_CHAIN_ID not set', 500, 'CHAIN_NOT_CONFIGURED');
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`);

  const chain = {
    id: Number(chainId),
    name: 'Worldchain Sepolia',
    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
    rpcUrls: {
      default: { http: [rpcUrl] },
      public: { http: [rpcUrl] },
    },
  } as const;

  return createWalletClient({
    account,
    chain,
    transport: http(),
  });
}

// Helper function to create public client for read calls
function createPublicClientForChain() {
  const rpcUrl = process.env.WORLDCHAIN_RPC_URL;
  if (!rpcUrl) {
    throw httpError('WORLDCHAIN_RPC_URL not set', 500, 'CHAIN_NOT_CONFIGURED');
  }

  return createPublicClient({
    transport: http(rpcUrl, {
      timeout: 10000,
      retryCount: 2,
    }),
  });
}

// POST /admin/epoch/submit-scores
adminRouter.post(
  '/epoch/submit-scores',
  zValidator('json', z.object({
    epoch: z.number().int().nonnegative(),
    workers: z.array(z.string().regex(/^0x[a-fA-F0-9]{40}$/)),
    aiuScores: z.array(z.number().nonnegative()),
  })),
  async (c) => {
    requireAdminAuth(c);
    const req = c.req.valid('json') as { epoch: number; workers: string[]; aiuScores: number[] };

    const contractAddress = process.env.EPOCH_REWARD_DISTRIBUTOR_ADDRESS;
    if (!contractAddress || contractAddress.trim() === '') {
      return c.json({ error: 'EPOCH_REWARD_DISTRIBUTOR_ADDRESS not configured', configured: false }, 500);
    }

    try {
      const walletClient = createBrokerWalletClient();
      const scoresWei = req.aiuScores.map((score) => BigInt(Math.floor(score * 1e18)));

      const hash = await walletClient.writeContract({
        address: contractAddress as `0x${string}`,
        abi: [
          {
            type: 'function',
            name: 'submitEpochScores',
            stateMutability: 'nonpayable',
            inputs: [
              { name: 'epoch', type: 'uint256' },
              { name: 'workers', type: 'address[]' },
              { name: 'aiuScores', type: 'uint256[]' },
            ],
            outputs: [],
          },
        ],
        functionName: 'submitEpochScores',
        args: [BigInt(req.epoch), req.workers as any, scoresWei],
      });

      console.log(`[admin:epoch/submit-scores] Submitted scores for epoch=${req.epoch} txHash=${hash}`);
      return c.json({ txHash: hash });
    } catch (err: unknown) {
      console.error('[admin:epoch/submit-scores] Failed to submit scores:', err);
      return c.json({ error: String(err) }, 500);
    }
  }
);

// POST /admin/epoch/distribute
adminRouter.post(
  '/epoch/distribute',
  zValidator('json', z.object({
    epoch: z.number().int().nonnegative(),
  })),
  async (c) => {
    requireAdminAuth(c);
    const req = c.req.valid('json') as { epoch: number };

    const contractAddress = process.env.EPOCH_REWARD_DISTRIBUTOR_ADDRESS;
    if (!contractAddress || contractAddress.trim() === '') {
      return c.json({ error: 'EPOCH_REWARD_DISTRIBUTOR_ADDRESS not configured' }, 500);
    }

    try {
      const walletClient = createBrokerWalletClient();

      const hash = await walletClient.writeContract({
        address: contractAddress as `0x${string}`,
        abi: [
          {
            type: 'function',
            name: 'distributeEpochRewards',
            stateMutability: 'nonpayable',
            inputs: [
              { name: 'epoch', type: 'uint256' },
            ],
            outputs: [],
          },
        ],
        functionName: 'distributeEpochRewards',
        args: [BigInt(req.epoch)],
      });

      console.log(`[admin:epoch/distribute] Distributed rewards for epoch=${req.epoch} txHash=${hash}`);
      return c.json({ txHash: hash });
    } catch (err: unknown) {
      console.error('[admin:epoch/distribute] Failed to distribute rewards:', err);
      return c.json({ error: String(err) }, 500);
    }
  }
);

// POST /admin/buyback
adminRouter.post('/buyback', async (c) => {
  requireAdminAuth(c);

  const contractAddress = process.env.BUYBACK_BURN_ADDRESS;
  if (!contractAddress || contractAddress.trim() === '') {
    return c.json({ error: 'BUYBACK_BURN_ADDRESS not configured' }, 500);
  }

  try {
    const walletClient = createBrokerWalletClient();

    const hash = await walletClient.writeContract({
      address: contractAddress as `0x${string}`,
      abi: [
        {
          type: 'function',
          name: 'executeBuyback',
          stateMutability: 'nonpayable',
          inputs: [],
          outputs: [],
        },
      ],
      functionName: 'executeBuyback',
      args: [],
    });

    console.log(`[admin:buyback] Executed buyback txHash=${hash}`);
    return c.json({ txHash: hash });
  } catch (err: unknown) {
    console.error('[admin:buyback] Failed to execute buyback:', err);
    return c.json({ error: String(err) }, 500);
  }
});

// POST /admin/mint-cap/update
adminRouter.post(
  '/mint-cap/update',
  zValidator('json', z.object({
    settledVolumeEth: z.number().nonnegative(),
  })),
  async (c) => {
    requireAdminAuth(c);
    const req = c.req.valid('json') as { settledVolumeEth: number };

    const contractAddress = process.env.INTEL_MINT_CONTROLLER_ADDRESS;
    if (!contractAddress || contractAddress.trim() === '') {
      return c.json({ error: 'INTEL_MINT_CONTROLLER_ADDRESS not configured' }, 500);
    }

    try {
      const walletClient = createBrokerWalletClient();
      const settledVolumeWei = BigInt(Math.floor(req.settledVolumeEth * 1e18));

      const hash = await walletClient.writeContract({
        address: contractAddress as `0x${string}`,
        abi: [
          {
            type: 'function',
            name: 'updateEpochCapFromActivity',
            stateMutability: 'nonpayable',
            inputs: [
              { name: 'settledVolumeThisEpoch', type: 'uint256' },
            ],
            outputs: [],
          },
        ],
        functionName: 'updateEpochCapFromActivity',
        args: [settledVolumeWei],
      });

      console.log(`[admin:mint-cap/update] Updated mint cap to ${req.settledVolumeEth} ETH txHash=${hash}`);
      return c.json({ txHash: hash });
    } catch (err: unknown) {
      console.error('[admin:mint-cap/update] Failed to update mint cap:', err);
      return c.json({ error: String(err) }, 500);
    }
  }
);

// POST /admin/reviewer/:address/evaluate-tier
adminRouter.post(
  '/reviewer/:address/evaluate-tier',
  zValidator('json', z.object({
    slashCount: z.number().int().nonnegative(),
  })),
  async (c) => {
    requireAdminAuth(c);
    const { address } = c.req.param();
    const req = c.req.valid('json') as { slashCount: number };

    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return c.json({ error: 'Invalid reviewer address' }, 400);
    }

    const contractAddress = process.env.REVIEWER_CREDENTIAL_ADDRESS;
    if (!contractAddress || contractAddress.trim() === '') {
      return c.json({ error: 'REVIEWER_CREDENTIAL_ADDRESS not configured' }, 500);
    }

    try {
      const walletClient = createBrokerWalletClient();

      const hash = await walletClient.writeContract({
        address: contractAddress as `0x${string}`,
        abi: [
          {
            type: 'function',
            name: 'evaluateAndUpdateTier',
            stateMutability: 'nonpayable',
            inputs: [
              { name: 'reviewer', type: 'address' },
              { name: 'slashCount', type: 'uint256' },
            ],
            outputs: [],
          },
        ],
        functionName: 'evaluateAndUpdateTier',
        args: [address as `0x${string}`, BigInt(req.slashCount)],
      });

      console.log(`[admin:reviewer/evaluate-tier] Evaluated tier for reviewer=${address} slashCount=${req.slashCount} txHash=${hash}`);
      return c.json({ txHash: hash });
    } catch (err: unknown) {
      console.error('[admin:reviewer/evaluate-tier] Failed to evaluate tier:', err);
      return c.json({ error: String(err) }, 500);
    }
  }
);

// POST /admin/reviewer/:address/mint-credential
adminRouter.post('/reviewer/:address/mint-credential', async (c) => {
  requireAdminAuth(c);
  const { address } = c.req.param();

  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return c.json({ error: 'Invalid reviewer address' }, 400);
  }

  const contractAddress = process.env.REVIEWER_CREDENTIAL_ADDRESS;
  if (!contractAddress || contractAddress.trim() === '') {
    return c.json({ error: 'REVIEWER_CREDENTIAL_ADDRESS not configured' }, 500);
  }

  try {
    const walletClient = createBrokerWalletClient();

    const hash = await walletClient.writeContract({
      address: contractAddress as `0x${string}`,
      abi: [
        {
          type: 'function',
          name: 'mintInitialCredential',
          stateMutability: 'nonpayable',
          inputs: [
            { name: 'reviewer', type: 'address' },
          ],
          outputs: [],
        },
      ],
      functionName: 'mintInitialCredential',
      args: [address as `0x${string}`],
    });

    console.log(`[admin:reviewer/mint-credential] Minted credential for reviewer=${address} txHash=${hash}`);
    return c.json({ txHash: hash });
  } catch (err: unknown) {
    console.error('[admin:reviewer/mint-credential] Failed to mint credential:', err);
    return c.json({ error: String(err) }, 500);
  }
});