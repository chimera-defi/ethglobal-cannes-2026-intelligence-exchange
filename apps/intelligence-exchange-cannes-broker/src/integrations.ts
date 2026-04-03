import { z } from "zod";
import type { Actor } from "@iex-cannes/shared";

const worldResponseSchema = z.object({
  identifier: z.string().optional(),
  success: z.boolean(),
  nullifier: z.string().optional(),
  code: z.string().optional(),
  detail: z.string().optional()
});

const worldVerifyPayloadSchema = z.object({
  protocol_version: z.literal("3.0").default("3.0"),
  nonce: z.string(),
  action: z.string(),
  responses: z.array(
    z.object({
      identifier: z.string(),
      merkle_root: z.string(),
      nullifier: z.string(),
      proof: z.string(),
      signal_hash: z.string(),
      max_age: z.number().int().positive().optional()
    })
  ).min(1)
});

export function getIntegrationStatus() {
  const worldAppId = process.env.WORLD_RP_ID ?? process.env.WORLD_APP_ID ?? null;
  const zeroGRpcUrl = process.env.ZERO_G_RPC_URL ?? "https://evmrpc-testnet.0g.ai";
  const zeroGIndexerUrl =
    process.env.ZERO_G_INDEXER_URL ?? "https://indexer-storage-testnet-turbo.0g.ai";
  const arcRpcUrl = process.env.RPC_URL ?? "https://rpc.testnet.arc.network";

  return {
    world: {
      mode: worldAppId ? "configured" : "stub",
      verifyUrl: worldAppId ? `https://developer.world.org/api/v4/verify/${worldAppId}` : null
    },
    zeroG: {
      mode: process.env.ZERO_G_PRIVATE_KEY ? "configured" : "stub",
      rpcUrl: zeroGRpcUrl,
      indexerUrl: zeroGIndexerUrl
    },
    arc: {
      mode: process.env.POSTER_PRIVATE_KEY ? "configured" : "local-demo",
      rpcUrl: arcRpcUrl
    }
  } as const;
}

export async function verifyWorldActor(role: Actor["role"], actor: Actor, payload: unknown) {
  const worldAppId = process.env.WORLD_RP_ID ?? process.env.WORLD_APP_ID;
  if (!worldAppId) {
    return {
      mode: "stub" as const,
      success: actor.verified,
      detail: `World verification is stubbed locally for ${role}.`
    };
  }

  const parsed = worldVerifyPayloadSchema.parse(payload);
  const response = await fetch(`https://developer.world.org/api/v4/verify/${worldAppId}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "intelligence-exchange-cannes-broker"
    },
    body: JSON.stringify({
      ...parsed,
      environment: process.env.WORLD_ENVIRONMENT ?? "staging"
    })
  });
  const body = await response.json();
  const results = z.array(worldResponseSchema).parse(body.results ?? []);
  const success = response.ok && results.some((item) => item.success);

  return {
    mode: "configured" as const,
    success,
    detail: success ? "World proof verified successfully." : (body.message ?? "World proof verification failed.")
  };
}
