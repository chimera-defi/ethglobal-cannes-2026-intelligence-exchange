// NOTE: Referral records currently stored in-memory - database persistence requires schema migration
const referralStore = new Map<string, { referrer: string; createdAt: Date }>();

// Rate limiting: track active referral count per referrer
const referrerActiveCount = new Map<string, number>();
const MAX_ACTIVE_REFERRALS_PER_REFERRER = 50;

// Rate limiting: track registration timing per referrer (max 5 per minute)
const referrerLastRegistrationTime = new Map<string, number[]>();
const MAX_REGISTRATIONS_PER_MINUTE = 5;
const REGISTRATION_WINDOW_MS = 60 * 1000; // 1 minute

// Address normalization helper
function normalizeAddress(addr: string): string {
  return addr.toLowerCase();
}

interface ReferralBonus {
  referrer: string | null;
  bonusAmount: number;
}

export function registerReferral(refereeAddress: string, referrerAddress: string): void {
  const normalizedReferee = normalizeAddress(refereeAddress);
  const normalizedReferrer = normalizeAddress(referrerAddress);

  // Self-referral check (case-insensitive)
  if (normalizedReferee === normalizedReferrer) {
    console.warn('[referral] Self-referral rejected:', refereeAddress);
    return;
  }

  // Check if referee already registered (case-insensitive)
  if (referralStore.has(normalizedReferee)) {
    console.warn('[referral] Referee already registered:', refereeAddress);
    return;
  }

  // Rate limit: check active referral count per referrer
  const activeCount = referrerActiveCount.get(normalizedReferrer) || 0;
  if (activeCount >= MAX_ACTIVE_REFERRALS_PER_REFERRER) {
    console.warn('[referral] Referrer has reached max active referrals:', referrerAddress);
    return;
  }

  // Rate limit: check registration timing (max 5 per minute)
  const now = Date.now();
  const recentRegistrations = referrerLastRegistrationTime.get(normalizedReferrer) || [];
  const validRegistrations = recentRegistrations.filter(timestamp => now - timestamp < REGISTRATION_WINDOW_MS);
  if (validRegistrations.length >= MAX_REGISTRATIONS_PER_MINUTE) {
    console.warn('[referral] Referrer exceeded registration rate limit:', referrerAddress);
    return;
  }

  // Update registration timing
  validRegistrations.push(now);
  referrerLastRegistrationTime.set(normalizedReferrer, validRegistrations);

  // Update active count
  referrerActiveCount.set(normalizedReferrer, activeCount + 1);

  // NOTE: Referrer validation against agentIdentities not yet implemented
  referralStore.set(normalizedReferee, { referrer: referrerAddress, createdAt: new Date() });
  console.log('[referral] Registered:', refereeAddress, 'referred by', referrerAddress);
}

export function getReferralBonus(settlementAmount: number, workerAddress: string): ReferralBonus {
  const normalizedWorker = normalizeAddress(workerAddress);
  const referral = referralStore.get(normalizedWorker);
  if (!referral) {
    return { referrer: null, bonusAmount: 0 };
  }

  // Fixed timezone bug: use explicit UTC timestamp comparison
  const sixMonthsAgoUtc = Date.now() - (6 * 30 * 24 * 60 * 60 * 1000);
  const createdAtUtc = referral.createdAt.getTime();
  if (createdAtUtc < sixMonthsAgoUtc) {
    return { referrer: null, bonusAmount: 0 };
  }

  const bonusAmount = settlementAmount * 0.01;
  return { referrer: referral.referrer, bonusAmount };
}

export { referralStore };