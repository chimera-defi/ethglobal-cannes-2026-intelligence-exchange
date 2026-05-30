// TODO: Persist to database instead of in-memory Map
const referralStore = new Map<string, { referrer: string; createdAt: Date }>();

interface ReferralBonus {
  referrer: string | null;
  bonusAmount: number;
}

export function registerReferral(refereeAddress: string, referrerAddress: string): void {
  if (refereeAddress.toLowerCase() === referrerAddress.toLowerCase()) {
    console.warn('[referral] Self-referral rejected:', refereeAddress);
    return;
  }

  if (referralStore.has(refereeAddress)) {
    console.warn('[referral] Referee already registered:', refereeAddress);
    return;
  }

  // TODO: Validate referrer is a known agent in agentIdentities table
  referralStore.set(refereeAddress, { referrer: referrerAddress, createdAt: new Date() });
  console.log('[referral] Registered:', refereeAddress, 'referred by', referrerAddress);
}

export function getReferralBonus(settlementAmount: number, workerAddress: string): ReferralBonus {
  const referral = referralStore.get(workerAddress);
  if (!referral) {
    return { referrer: null, bonusAmount: 0 };
  }

  const sixMonthsAgo = new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000);
  if (referral.createdAt < sixMonthsAgo) {
    return { referrer: null, bonusAmount: 0 };
  }

  const bonusAmount = settlementAmount * 0.01;
  return { referrer: referral.referrer, bonusAmount };
}

export { referralStore };