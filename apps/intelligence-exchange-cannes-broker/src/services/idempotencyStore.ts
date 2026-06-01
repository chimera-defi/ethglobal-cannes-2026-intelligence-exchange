/**
 * Idempotency Store - prevents double-posting of claim and submit requests
 *
 * Simple in-memory store with 24-hour TTL. In production, this should be
 * replaced with a Redis or database-backed store for durability across restarts.
 */

type IdempotencyResult = {
  resultId: string;
  createdAt: number;
  data: unknown;
};

const store = new Map<string, IdempotencyResult>();
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Clean up expired entries from the store
 */
function cleanupExpiredEntries(): void {
  const now = Date.now();
  for (const [key, value] of store.entries()) {
    if (now - value.createdAt > TTL_MS) {
      store.delete(key);
    }
  }
}

/**
 * Check if an idempotency key has been used before
 * @param key - The idempotency key to check
 * @returns The cached result if found, null otherwise
 */
export function getIdempotencyResult(key: string): unknown | null {
  cleanupExpiredEntries();
  const entry = store.get(key);
  if (!entry) {
    return null;
  }
  const age = Date.now() - entry.createdAt;
  if (age > TTL_MS) {
    store.delete(key);
    return null;
  }
  console.log(`[idempotency] Cache hit for key=${key} age=${age}ms`);
  return entry.data;
}

/**
 * Store a result for an idempotency key
 * @param key - The idempotency key
 * @param resultId - The ID of the result (e.g., claimId or submissionId)
 * @param data - The full response data to cache
 */
export function setIdempotencyResult(key: string, resultId: string, data: unknown): void {
  cleanupExpiredEntries();
  store.set(key, {
    resultId,
    createdAt: Date.now(),
    data,
  });
  console.log(`[idempotency] Stored result for key=${key} resultId=${resultId}`);
}

/**
 * Check if an idempotency key exists (without returning the data)
 * @param key - The idempotency key to check
 * @returns true if the key exists and is not expired
 */
export function hasIdempotencyKey(key: string): boolean {
  cleanupExpiredEntries();
  return getIdempotencyResult(key) !== null;
}