interface BreakerState {
  isOpen: boolean;
  trippedAt: number | null;
  requestCount: number;
  errorCount: number;
  acceptCount: number;
  lastResetTime: number;
}

const breakers = new Map<string, BreakerState>();
const RESET_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const ACCEPT_RATE_LIMIT = 20; // per minute
const ERROR_RATE_THRESHOLD = 0.5; // 50%

function getOrCreateBreaker(name: string): BreakerState {
  if (!breakers.has(name)) {
    breakers.set(name, {
      isOpen: false,
      trippedAt: null,
      requestCount: 0,
      errorCount: 0,
      acceptCount: 0,
      lastResetTime: Date.now(),
    });
  }
  return breakers.get(name)!;
}

function checkAutoReset(breaker: BreakerState): void {
  if (breaker.isOpen && breaker.trippedAt && Date.now() - breaker.trippedAt > RESET_TIMEOUT_MS) {
    breaker.isOpen = false;
    breaker.trippedAt = null;
    breaker.requestCount = 0;
    breaker.errorCount = 0;
    breaker.acceptCount = 0;
    breaker.lastResetTime = Date.now();
    console.log(`[circuit-breaker] Auto-reset breaker`);
  }
}

function checkTimeWindow(breaker: BreakerState): void {
  const now = Date.now();
  if (now - breaker.lastResetTime > 60000) {
    breaker.requestCount = 0;
    breaker.errorCount = 0;
    breaker.acceptCount = 0;
    breaker.lastResetTime = now;
  }
}

export function recordAccept(breakerName: string): boolean {
  const breaker = getOrCreateBreaker(breakerName);
  checkAutoReset(breaker);
  checkTimeWindow(breaker);

  breaker.acceptCount++;
  breaker.requestCount++;

  if (breaker.acceptCount > ACCEPT_RATE_LIMIT) {
    breaker.isOpen = true;
    breaker.trippedAt = Date.now();
    console.log(`[circuit-breaker] Tripped accept breaker: rate ${breaker.acceptCount}/min exceeds limit ${ACCEPT_RATE_LIMIT}`);
    return false;
  }

  return true;
}

export function recordError(breakerName: string, is5xx: boolean): void {
  const breaker = getOrCreateBreaker(breakerName);
  checkAutoReset(breaker);
  checkTimeWindow(breaker);

  breaker.requestCount++;
  if (is5xx) {
    breaker.errorCount++;
  }

  if (breaker.requestCount > 0 && breaker.errorCount / breaker.requestCount > ERROR_RATE_THRESHOLD) {
    breaker.isOpen = true;
    breaker.trippedAt = Date.now();
    console.log(`[circuit-breaker] Tripped error breaker: error rate ${(breaker.errorCount / breaker.requestCount * 100).toFixed(1)}% exceeds threshold ${ERROR_RATE_THRESHOLD * 100}%`);
  }
}

export function resetBreaker(name: string): void {
  const breaker = breakers.get(name);
  if (breaker) {
    breaker.isOpen = false;
    breaker.trippedAt = null;
    breaker.requestCount = 0;
    breaker.errorCount = 0;
    breaker.acceptCount = 0;
    breaker.lastResetTime = Date.now();
    console.log(`[circuit-breaker] Manually reset breaker: ${name}`);
  }
}

export function getBreakerStatus(): Record<string, BreakerState> {
  const statuses: Record<string, BreakerState> = {};
  for (const [name, breaker] of breakers.entries()) {
    checkAutoReset(breaker);
    checkTimeWindow(breaker);
    statuses[name] = { ...breaker };
  }
  return statuses;
}