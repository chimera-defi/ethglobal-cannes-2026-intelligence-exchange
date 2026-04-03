import { isAddress, parseUnits, type Address, type PublicClient } from 'viem';
import { escrowAbi, localFundingAddresses, toEscrowIdeaId, toEscrowMilestoneId } from './contracts';
import type { JobResponse, SettlementRecordInput } from './api';

type SettlementMode = 'release' | 'refund';

type SettleReviewActionParams = {
  mode: SettlementMode;
  job: JobResponse['job'];
  submission: JobResponse['submission'];
  settlement: JobResponse['settlement'];
  connectedAddress: string | null;
  fundingAddresses: ReturnType<typeof localFundingAddresses>;
  publicClient: PublicClient | undefined;
  switchChainAsync: (args: { chainId: number }) => Promise<unknown>;
  reserveMilestone: (args: {
    ideaId: `0x${string}`;
    milestoneId: `0x${string}`;
    amount: bigint;
  }) => Promise<`0x${string}`>;
  releaseMilestone: (args: {
    ideaId: `0x${string}`;
    milestoneId: `0x${string}`;
    worker: Address;
  }) => Promise<`0x${string}`>;
  refundMilestone: (args: {
    ideaId: `0x${string}`;
    milestoneId: `0x${string}`;
    poster: Address;
  }) => Promise<`0x${string}`>;
};

async function waitForReceipt(publicClient: PublicClient | undefined, hash: `0x${string}`) {
  if (!publicClient) {
    throw new Error('Wallet client unavailable. Refresh the page after connecting your wallet.');
  }
  await publicClient.waitForTransactionReceipt({ hash });
}

export async function settleReviewAction({
  mode,
  job,
  submission,
  settlement,
  connectedAddress,
  fundingAddresses,
  publicClient,
  switchChainAsync,
  reserveMilestone,
  releaseMilestone,
  refundMilestone,
}: SettleReviewActionParams): Promise<SettlementRecordInput | undefined> {
  if (!connectedAddress || !isAddress(connectedAddress)) {
    throw new Error('Connect the buyer wallet before settling this milestone.');
  }
  if (!publicClient) {
    throw new Error('Wallet client unavailable. Refresh the page after connecting your wallet.');
  }

  await switchChainAsync({ chainId: fundingAddresses.chainId });

  const ideaEscrowId = toEscrowIdeaId(job.ideaId);
  const milestoneEscrowId = toEscrowMilestoneId(job.milestoneId);
  const amount = parseUnits(job.budgetUsd, 6);
  const milestoneStatus = Number(await publicClient.readContract({
    address: fundingAddresses.escrowAddress,
    abi: escrowAbi,
    functionName: 'getMilestoneStatus',
    args: [milestoneEscrowId],
  }));

  if (mode === 'release') {
    const payee = submission?.agentMetadata?.operatorAddress;
    if (!payee || !isAddress(payee)) {
      throw new Error('Submitted worker is missing an operator wallet address, so payout cannot be released onchain.');
    }

    if (milestoneStatus === 3) {
      throw new Error('This milestone was already refunded onchain and cannot be released without a new reservation.');
    }

    if (milestoneStatus === 0) {
      const reserveHash = await reserveMilestone({
        ideaId: ideaEscrowId,
        milestoneId: milestoneEscrowId,
        amount,
      });
      await waitForReceipt(publicClient, reserveHash);
    }

    if (milestoneStatus === 2) {
      if (!settlement?.txHash) {
        throw new Error('Milestone already released onchain but the broker has no recorded settlement transaction.');
      }
      return {
        txHash: settlement.txHash,
        payer: connectedAddress,
        payee,
        amountUsd: Number(job.budgetUsd),
      };
    }

    const releaseHash = await releaseMilestone({
      ideaId: ideaEscrowId,
      milestoneId: milestoneEscrowId,
      worker: payee as Address,
    });
    await waitForReceipt(publicClient, releaseHash);
    return {
      txHash: releaseHash,
      payer: connectedAddress,
      payee,
      amountUsd: Number(job.budgetUsd),
    };
  }

  if (milestoneStatus === 0) {
    return undefined;
  }

  if (milestoneStatus === 2) {
    throw new Error('This milestone was already released onchain and cannot be refunded.');
  }

  if (milestoneStatus === 3) {
    return settlement?.txHash
      ? {
          txHash: settlement.txHash,
          payer: connectedAddress,
          payee: settlement.payee,
          amountUsd: Number(job.budgetUsd),
        }
      : undefined;
  }

  const refundHash = await refundMilestone({
    ideaId: ideaEscrowId,
    milestoneId: milestoneEscrowId,
    poster: connectedAddress as Address,
  });
  await waitForReceipt(publicClient, refundHash);
  return {
    txHash: refundHash,
    payer: connectedAddress,
    payee: connectedAddress,
    amountUsd: Number(job.budgetUsd),
  };
}
