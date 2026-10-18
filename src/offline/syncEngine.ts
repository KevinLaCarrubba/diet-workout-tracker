import { liveQuery } from 'dexie';
import { useSyncStore } from '@/stores/syncStore';
import { db } from './db';
import { acknowledge, markFailed, onEnqueued } from './outbox';
import type { OutboxItem, OutboxKind } from './types';

export type HandlerMap = Partial<
  Record<OutboxKind, (payload: unknown, item: OutboxItem) => Promise<unknown>>
>;

/** Errors that will never succeed on retry (validation, permissions). */
export function isPermanentError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return typeof code === 'string' && /^(22|23|42)/.test(code);
}

export function isNetworkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /Failed to fetch|NetworkError|Load failed|network|fetch failed/i.test(message);
}

export interface SyncEngineOptions {
  userId: string;
  handlers: HandlerMap;
  onSynced?: (kinds: Set<OutboxKind>) => void;
  isOnline?: () => boolean;
}

/**
 * Drains the outbox in creation order whenever we are online: on start, when
 * something is queued, when the browser comes back online or the app is
 * foregrounded, and every 30 seconds as a safety net.
 */
export function startSyncEngine({
  userId,
  handlers,
  onSynced,
  isOnline = () => navigator.onLine,
}: SyncEngineOptions) {
  let running = false;
  let rerun = false;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let timerDue = Infinity;
  const store = useSyncStore.getState();

  const run = async () => {
    if (stopped) return;
    if (running) {
      rerun = true;
      return;
    }
    if (!isOnline()) return;
    running = true;
    const synced = new Set<OutboxKind>();
    try {
      do {
        rerun = false;
        const due = (await db.outbox.where('user_id').equals(userId).sortBy('created_at')).filter(
          (i) => i.next_attempt_at <= Date.now(),
        );
        if (due.length === 0) break;
        store.set({ phase: 'syncing' });
        for (const item of due) {
          if (stopped || !isOnline()) break;
          const handler = handlers[item.kind];
          if (!handler) continue;
          try {
            await handler(item.payload, item);
            await acknowledge(item);
            synced.add(item.kind);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const permanent = isPermanentError(error);
            await markFailed(item, message, permanent);
            if (isNetworkError(error)) break;
            store.set({ lastError: message });
          }
        }
      } while (rerun && !stopped);
    } finally {
      running = false;
      const failed = await db.outbox
        .where('user_id')
        .equals(userId)
        .filter((i) => i.attempts > 0)
        .count();
      store.set({
        phase: failed > 0 ? 'error' : 'idle',
        ...(failed === 0 ? { lastError: null, lastSyncedAt: Date.now() } : {}),
      });
      if (synced.size > 0) onSynced?.(synced);
      schedule(rerun ? 0 : 30_000);
    }
  };

  /** Runs `ms` from now unless a run is already scheduled sooner. */
  const schedule = (ms: number) => {
    if (stopped) return;
    const due = Date.now() + ms;
    if (timer && timerDue <= due) return;
    if (timer) clearTimeout(timer);
    timerDue = due;
    timer = setTimeout(() => {
      timer = null;
      timerDue = Infinity;
      void run();
    }, ms);
  };

  const pendingSub = liveQuery(() => db.outbox.where('user_id').equals(userId).count()).subscribe({
    next: (pending) => store.set({ pending }),
  });
  const unlisten = onEnqueued(() => schedule(750));
  const onOnline = () => schedule(0);
  const onVisible = () => document.visibilityState === 'visible' && schedule(0);
  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onVisible);
  schedule(0);

  return {
    syncNow: run,
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      pendingSub.unsubscribe();
      unlisten();
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
    },
  };
}
