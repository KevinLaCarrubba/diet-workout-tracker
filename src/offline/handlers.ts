import { supabase } from '@/lib/supabase';
import type { TablesInsert } from '@/types/database';
import { db } from './db';
import type { DraftSession, PersonalRecordEvent } from './types';
import type { HandlerMap } from './syncEngine';

/** The RPC payload: the draft minus device-only fields. */
export function toSessionPayload(draft: DraftSession) {
  return {
    id: draft.id,
    template_id: draft.template_id,
    scheduled_workout_id: draft.scheduled_workout_id,
    title: draft.title,
    status: draft.status,
    started_at: draft.started_at,
    ended_at: draft.ended_at,
    paused_seconds: draft.paused_seconds,
    notes: draft.notes,
    client_updated_at: draft.client_updated_at,
    exercises: draft.exercises.map((e) => ({
      id: e.id,
      exercise_id: e.exercise_id,
      substituted_for_exercise_id: e.substituted_for_exercise_id,
      sort_order: e.sort_order,
      exercise_name_snapshot: e.exercise_name_snapshot,
      primary_muscles_snapshot: e.primary_muscles_snapshot,
      rest_seconds: e.rest_seconds,
      rep_min: e.rep_min,
      rep_max: e.rep_max,
      rep_mode: e.rep_mode,
      duration_seconds_min: e.duration_seconds_min,
      group_name: e.group_name,
      tempo: e.tempo,
      notes: e.notes,
      sets: e.sets.map((s) => ({
        id: s.id,
        sort_order: s.sort_order,
        weight_kg: s.weight_kg,
        reps: s.reps,
        rpe: s.rpe,
        duration_seconds: s.duration_seconds,
        is_warmup: s.is_warmup,
        completed_at: s.completed_at,
        notes: s.notes,
      })),
    })),
  };
}

export type SessionPayload = ReturnType<typeof toSessionPayload>;
export type CardioPayload = TablesInsert<'cardio_sessions'> & { id: string };

/** Insert, or update in place if the row already exists (ids are client-generated). */
async function insertOrUpdate<T extends { id: string; user_id: string }>(
  table: 'cardio_sessions' | 'water_logs',
  row: T,
) {
  const { error } = await supabase.from(table as 'cardio_sessions').insert(row as never);
  if (!error) return;
  if (error.code !== '23505') throw Object.assign(new Error(error.message), { code: error.code });
  const { id, user_id: _userId, ...patch } = row;
  const { error: updateError } = await supabase
    .from(table as 'cardio_sessions')
    .update(patch as never)
    .eq('id', id);
  if (updateError) throw Object.assign(new Error(updateError.message), { code: updateError.code });
}

async function deleteById(table: 'cardio_sessions' | 'water_logs', id: string) {
  const { error } = await supabase
    .from(table as 'cardio_sessions')
    .delete()
    .eq('id', id);
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
}

export const syncHandlers: HandlerMap = {
  async workout_session(payload) {
    const p = payload as SessionPayload;
    const { data, error } = await supabase.rpc('sync_workout_session', { p_payload: p });
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
    const result = data as { applied: boolean; status: string; records: PersonalRecordEvent[] } | null;
    if (result?.records) {
      await db.sessions.update(p.id, { records: result.records });
    }
  },
  async cardio_session(payload) {
    await insertOrUpdate('cardio_sessions', payload as CardioPayload);
  },
  async delete_cardio_session(payload) {
    await deleteById('cardio_sessions', (payload as { id: string }).id);
  },
  async water_log(payload) {
    await insertOrUpdate('water_logs', payload as { id: string; user_id: string });
  },
  async delete_water_log(payload) {
    await deleteById('water_logs', (payload as { id: string }).id);
  },
};
