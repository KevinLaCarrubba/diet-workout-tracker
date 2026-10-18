import Dexie, { type EntityTable } from 'dexie';
import type { CacheEntry, DraftSession, OutboxItem } from './types';

/** Device-local storage: active workout drafts, the outbound sync queue, read caches. */
export class FitTrackDb extends Dexie {
  sessions!: EntityTable<DraftSession, 'id'>;
  outbox!: EntityTable<OutboxItem, 'key'>;
  cache!: EntityTable<CacheEntry, 'key'>;

  constructor(name = 'fittrack') {
    super(name);
    this.version(1).stores({
      sessions: 'id, user_id, status',
      outbox: 'key, kind, user_id, created_at',
      cache: 'key',
    });
  }
}

export const db = new FitTrackDb();

export async function readCache<T>(key: string): Promise<T | undefined> {
  return (await db.cache.get(key))?.value as T | undefined;
}

export async function writeCache(key: string, value: unknown) {
  await db.cache.put({ key, value, updated_at: Date.now() });
}

/** Wipes device data for a signed-out user (keeps nothing personal on shared devices). */
export async function clearUserData(userId: string) {
  await db.transaction('rw', db.sessions, db.outbox, db.cache, async () => {
    // Unsynced changes are kept so they upload on the next sign-in.
    await db.sessions
      .where('user_id')
      .equals(userId)
      .and((s) => s.status !== 'in_progress')
      .delete();
    await db.cache.clear();
  });
}
