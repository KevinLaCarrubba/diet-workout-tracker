import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDraft, setCompleted, finishSession } from '@/features/workouts/session/draft';
import { mutateDraft, startSession } from '@/features/workouts/session/sessionStore';
import { useSyncStore } from '@/stores/syncStore';
import { db } from './db';
import { startSyncEngine } from './syncEngine';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));

const bench = {
  id: 'bench',
  name: 'Bench',
  primary_muscles: ['chest'],
  equipment: null,
  is_bodyweight: false,
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('offline workout sync', () => {
  let online = false;
  const uploads: { id: string; status: string; client_updated_at: string }[] = [];
  const handler = vi.fn(async (payload: unknown) => {
    if (!online) throw new Error('Failed to fetch');
    const p = payload as { id: string; status: string; client_updated_at: string };
    uploads.push({ id: p.id, status: p.status, client_updated_at: p.client_updated_at });
  });

  beforeEach(async () => {
    await db.delete();
    await db.open();
    uploads.length = 0;
    handler.mockClear();
    online = false;
  });

  it('logs a whole workout offline, survives a "reload", and uploads the final state exactly once', async () => {
    // Offline: start and log a workout.
    let engine = startSyncEngine({
      userId: 'u1',
      handlers: { workout_session: handler },
      isOnline: () => online,
    });
    const draft = await startSession(
      createDraft({
        userId: 'u1',
        title: 'Push',
        plan: [{ exercise: bench, target_sets: 2, rep_min: 8, rep_max: 10, rest_seconds: 90 }],
        previous: {},
      }),
    );
    for (const set of draft.exercises[0]!.sets) {
      await mutateDraft(draft.id, (d) => setCompleted(d, d.exercises[0]!.id, set.id, true));
    }
    await mutateDraft(draft.id, (d) => finishSession(d));
    await engine.syncNow();
    expect(uploads).toHaveLength(0);
    expect(await db.outbox.count()).toBe(1); // coalesced to the latest snapshot

    // "Reload": a new engine instance with the same IndexedDB.
    engine.stop();
    const stored = await db.sessions.get(draft.id);
    expect(stored?.status).toBe('completed');
    expect(stored?.exercises[0]!.sets.every((s) => s.completed_at)).toBe(true);

    online = true;
    engine = startSyncEngine({
      userId: 'u1',
      handlers: { workout_session: handler },
      isOnline: () => online,
    });
    await vi.waitFor(() => expect(useSyncStore.getState().phase).toBe('idle'));
    await vi.waitFor(() => expect(uploads).toHaveLength(1));
    expect(uploads[0]).toMatchObject({ id: draft.id, status: 'completed' });
    expect(await db.outbox.count()).toBe(0);
    expect(useSyncStore.getState().phase).toBe('idle');

    // Further triggers do not upload again.
    window.dispatchEvent(new Event('online'));
    await engine.syncNow();
    await sleep(50);
    expect(uploads).toHaveLength(1);
    engine.stop();
  });

  it('keeps a newer change queued if it arrives while the previous one is uploading', async () => {
    online = true;
    let release!: () => void;
    const slow = vi.fn(
      (payload: unknown) =>
        new Promise<void>((resolve) => {
          uploads.push(payload as never);
          release = resolve;
        }),
    );
    const engine = startSyncEngine({
      userId: 'u1',
      handlers: { workout_session: slow },
      isOnline: () => online,
    });
    const draft = await startSession(
      createDraft({
        userId: 'u1',
        title: 'A',
        plan: [{ exercise: bench, target_sets: 1, rep_min: 5, rep_max: 5, rest_seconds: 60 }],
        previous: {},
      }),
    );
    await vi.waitFor(() => expect(slow).toHaveBeenCalledTimes(1));
    await mutateDraft(draft.id, (d) => ({ ...d, title: 'B' }));
    release();
    await vi.waitFor(() => expect(slow).toHaveBeenCalledTimes(2), { timeout: 3000 });
    release();
    await vi.waitFor(async () => expect(await db.outbox.count()).toBe(0));
    expect((uploads[1] as unknown as { title: string }).title).toBe('B');
    engine.stop();
  });

  it('backs off and surfaces an error state for server rejections', async () => {
    online = true;
    const failing = vi.fn(async () => {
      throw Object.assign(new Error('violates check constraint'), { code: '23514' });
    });
    const engine = startSyncEngine({
      userId: 'u1',
      handlers: { workout_session: failing },
      isOnline: () => online,
    });
    await startSession(createDraft({ userId: 'u1', title: 'A', plan: [], previous: {} }));
    await vi.waitFor(() => expect(useSyncStore.getState().phase).toBe('error'));
    await engine.syncNow();
    expect(failing).toHaveBeenCalledTimes(1); // permanent errors are not retried automatically
    engine.stop();
  });
});
