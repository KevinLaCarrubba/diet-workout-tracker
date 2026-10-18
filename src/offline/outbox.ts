import { db } from './db';
import type { OutboxItem, OutboxKind } from './types';

/**
 * Queues (or replaces) the pending upload for one entity. Only the latest
 * snapshot matters: uploads are idempotent upserts keyed by client UUIDs.
 */
export async function enqueue(kind: OutboxKind, entityId: string, userId: string, payload: unknown) {
  const key = `${kind}:${entityId}`;
  const now = Date.now();
  await db.transaction('rw', db.outbox, async () => {
    const existing = await db.outbox.get(key);
    await db.outbox.put({
      key,
      kind,
      user_id: userId,
      payload,
      created_at: existing?.created_at ?? now,
      updated_at: now,
      attempts: 0,
      next_attempt_at: now,
      last_error: null,
    });
  });
  notifyEnqueued();
}

/** Removes the item only if nothing newer was queued while it was uploading. */
export async function acknowledge(item: OutboxItem) {
  await db.transaction('rw', db.outbox, async () => {
    const current = await db.outbox.get(item.key);
    if (current && current.updated_at === item.updated_at) await db.outbox.delete(item.key);
  });
}

export async function markFailed(item: OutboxItem, error: string, permanent: boolean) {
  await db.transaction('rw', db.outbox, async () => {
    const current = await db.outbox.get(item.key);
    if (!current || current.updated_at !== item.updated_at) return;
    const attempts = current.attempts + 1;
    // Exponential backoff capped at 5 minutes; permanent errors wait for a manual retry.
    const delay = permanent ? Number.MAX_SAFE_INTEGER : Math.min(5 * 60_000, 2_000 * 2 ** (attempts - 1));
    await db.outbox.put({ ...current, attempts, last_error: error, next_attempt_at: Date.now() + delay });
  });
}

export async function retryAll() {
  const items = await db.outbox.toArray();
  await db.outbox.bulkPut(items.map((i) => ({ ...i, next_attempt_at: Date.now() })));
  notifyEnqueued();
}

type Listener = () => void;
const listeners = new Set<Listener>();
export const onEnqueued = (fn: Listener) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const notifyEnqueued = () => listeners.forEach((fn) => fn());
