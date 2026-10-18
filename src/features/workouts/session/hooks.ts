import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useUserId } from '@/features/auth/useAuth';
import { db } from '@/offline/db';
import { useLiveQuery } from '@/offline/useLiveQuery';
import type { DraftSession, PreviousSet } from '@/offline/types';
import { useWorkoutActivity } from '@/stores/workoutActivityStore';
import { fetchExercises, fetchPreviousPerformance, templateToPlan, type TemplateWithExercises } from '../api';
import { createDraft } from './draft';
import { getActiveSession, startSession } from './sessionStore';

export function useDraft(sessionId: string | undefined) {
  return useLiveQuery(
    () => (sessionId ? db.sessions.get(sessionId) : Promise.resolve(undefined)),
    [sessionId],
  );
}

/** The in-progress workout on this device, if any (live). */
export function useActiveDraft() {
  const userId = useUserId();
  const result = useLiveQuery(() => getActiveSession(userId), [userId]);
  const setActive = useWorkoutActivity((s) => s.setActive);
  useEffect(() => setActive(!!result.data), [result.data, setActive]);
  return result;
}

/** Re-renders every `ms` while enabled (timers derive from timestamps, so drift is impossible). */
export function useNow(ms = 1000, enabled = true) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setNow(Date.now()), ms);
    const onVisible = () => setNow(Date.now());
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [ms, enabled]);
  return now;
}

export interface StartOptions {
  template?: TemplateWithExercises | null;
  scheduledWorkoutId?: string | null;
  title?: string;
}

/** Builds a draft (with previous-performance prefill), stores it locally and opens it. */
export function useStartWorkout() {
  const userId = useUserId();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: async ({ template, scheduledWorkoutId, title }: StartOptions): Promise<DraftSession> => {
      const catalog = template ? await fetchExercises(userId).catch(() => []) : [];
      const plan = template ? templateToPlan(template, catalog) : [];
      const previous = await fetchPreviousPerformance(plan.map((p) => p.exercise.id)).catch(
        (): Record<string, PreviousSet[]> => ({}),
      );
      return startSession(
        createDraft({
          userId,
          title: title ?? template?.title ?? 'Workout',
          templateId: template?.id ?? null,
          scheduledWorkoutId: scheduledWorkoutId ?? null,
          plan,
          previous,
        }),
      );
    },
    onSuccess: (draft) => navigate(`/workouts/session/${draft.id}`),
  });
}

/** Keeps the screen awake during a workout where supported. */
export function useWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        lock = await navigator.wakeLock.request('screen');
      } catch {
        lock = null;
      }
      if (cancelled) void lock?.release();
    };
    void acquire();
    const onVisible = () => document.visibilityState === 'visible' && void acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release();
    };
  }, [enabled]);
}
