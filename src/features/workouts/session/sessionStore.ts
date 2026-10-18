import { db } from '@/offline/db';
import { toSessionPayload } from '@/offline/handlers';
import { enqueue } from '@/offline/outbox';
import type { DraftSession } from '@/offline/types';
import { touch } from './draft';

/**
 * Device-side persistence for workouts. Every change is written to IndexedDB
 * first and queued for upload, so nothing is lost if the phone locks, the tab
 * reloads or there is no reception.
 */

export async function saveDraft(draft: DraftSession): Promise<DraftSession> {
  const next = touch(draft);
  await db.sessions.put(next);
  await enqueue('workout_session', next.id, next.user_id, toSessionPayload(next));
  return next;
}

/** Read-modify-write of a draft inside one IndexedDB transaction. */
export async function mutateDraft(
  id: string,
  fn: (draft: DraftSession) => DraftSession,
): Promise<DraftSession | null> {
  let saved: DraftSession | null = null;
  await db.transaction('rw', db.sessions, db.outbox, async () => {
    const current = await db.sessions.get(id);
    if (!current) return;
    const next = fn(current);
    if (next === current) return;
    saved = await saveDraft(next);
  });
  return saved;
}

/** Device-local state only (e.g. the rest timer): not uploaded. */
export async function patchLocal(id: string, fn: (draft: DraftSession) => DraftSession) {
  await db.transaction('rw', db.sessions, async () => {
    const current = await db.sessions.get(id);
    if (current) await db.sessions.put(fn(current));
  });
}

export async function getActiveSession(userId: string): Promise<DraftSession | undefined> {
  const active = await db.sessions
    .where('user_id')
    .equals(userId)
    .filter((s) => s.status === 'in_progress')
    .toArray();
  return active.sort((a, b) => b.started_at.localeCompare(a.started_at))[0];
}

/** Starts a workout unless one is already in progress (then that one is returned). */
export async function startSession(draft: DraftSession): Promise<DraftSession> {
  let result = draft;
  await db.transaction('rw', db.sessions, db.outbox, async () => {
    const existing = await getActiveSession(draft.user_id);
    if (existing) {
      result = existing;
      return;
    }
    result = await saveDraft(draft);
  });
  return result;
}

/** Drops finished drafts older than a week once they are safely uploaded. */
export async function pruneFinishedDrafts(userId: string) {
  const cutoff = new Date(Date.now() - 7 * 864e5).toISOString();
  const pending = new Set(
    (await db.outbox.where('kind').equals('workout_session').toArray()).map((i) => i.key),
  );
  await db.sessions
    .where('user_id')
    .equals(userId)
    .filter(
      (s) =>
        s.status !== 'in_progress' &&
        (s.ended_at ?? s.started_at) < cutoff &&
        !pending.has(`workout_session:${s.id}`),
    )
    .delete();
}
