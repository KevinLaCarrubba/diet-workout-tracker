import { create } from 'zustand';

export type SyncPhase = 'idle' | 'syncing' | 'error';

interface SyncState {
  phase: SyncPhase;
  /** Outbound operations not yet confirmed by the server. */
  pending: number;
  lastError: string | null;
  lastSyncedAt: number | null;
  set: (patch: Partial<Omit<SyncState, 'set'>>) => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  phase: 'idle',
  pending: 0,
  lastError: null,
  lastSyncedAt: null,
  set: (patch) => set(patch),
}));
