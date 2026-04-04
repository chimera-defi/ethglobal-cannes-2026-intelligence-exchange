import { randomUUID } from 'crypto';
import { db } from '../db/client';
import { jobEvents } from '../db/schema';

export function logJobEvent(jobId: string, state: string, actorId?: string, payload?: Record<string, unknown>) {
  return db.insert(jobEvents).values({
    eventId: randomUUID(),
    jobId,
    state,
    actorId,
    payload: payload ?? null,
    createdAt: new Date(),
  });
}
