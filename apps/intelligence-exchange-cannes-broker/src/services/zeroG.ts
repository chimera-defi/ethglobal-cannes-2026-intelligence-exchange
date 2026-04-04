import { getZeroGConfig } from './sponsorConfig';

type AcceptedDossier = {
  ideaId: string;
  briefId: string;
  jobId: string;
  milestoneType: string;
  reviewerId: string;
  workerId: string | null;
  score: number;
  summary: string | null;
  artifactUris: unknown;
  agentMetadata: unknown;
  acceptedAt: string;
};

export function isZeroGUploadConfigured() {
  return getZeroGConfig().configured;
}

export async function uploadAcceptedDossier(dossier: AcceptedDossier) {
  const config = getZeroGConfig();
  if (!config.configured || !config.privateKey) {
    return null;
  }

  const sdk = await import('@0gfoundation/0g-ts-sdk') as {
    Indexer: new (url: string) => {
      upload: (
        file: unknown,
        rpcUrl: string,
        signer: unknown,
      ) => Promise<[Record<string, string>, unknown]>;
    };
    MemData: new (data: Uint8Array) => {
      merkleTree: () => Promise<[unknown, unknown]>;
      close?: () => Promise<void>;
    };
  };
  const ethersLib = await import('ethers');

  const provider = new ethersLib.JsonRpcProvider(config.rpcUrl);
  const signer = new ethersLib.Wallet(config.privateKey, provider);
  const indexer = new sdk.Indexer(config.indexerRpcUrl);
  const data = new TextEncoder().encode(JSON.stringify(dossier, null, 2));
  const memData = new sdk.MemData(data);

  const [, treeError] = await memData.merkleTree();
  if (treeError) {
    throw new Error(`0G Merkle tree error: ${String(treeError)}`);
  }

  const [uploadResult, uploadError] = await indexer.upload(memData, config.rpcUrl, signer);
  await memData.close?.();
  if (uploadError) {
    throw new Error(`0G upload error: ${String(uploadError)}`);
  }

  const txHash = uploadResult.txHash ?? uploadResult.txHashes?.[0];
  const rootHash = uploadResult.rootHash ?? uploadResult.rootHashes?.[0];
  if (!txHash || !rootHash) {
    throw new Error('0G upload completed without a tx hash or root hash');
  }

  return {
    txHash,
    rootHash,
    dossierUri: `${config.explorerBaseUrl}${txHash}`,
  };
}
