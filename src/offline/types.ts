/** Shapes stored on the device. Field names mirror the database/RPC payloads. */

export interface DraftSet {
  id: string;
  sort_order: number;
  weight_kg: number | null;
  reps: number | null;
  rpe: number | null;
  /** Timed holds (wall sits, hangs): seconds actually held. */
  duration_seconds: number | null;
  is_warmup: boolean;
  completed_at: string | null;
  notes: string | null;
  /** True while the values are suggestions from history that the user hasn't touched. */
  prefilled: boolean;
}

export interface DraftExercise {
  id: string;
  exercise_id: string | null;
  substituted_for_exercise_id: string | null;
  sort_order: number;
  exercise_name_snapshot: string;
  primary_muscles_snapshot: string[];
  equipment: string | null;
  is_bodyweight: boolean;
  rest_seconds: number | null;
  rep_min: number | null;
  rep_max: number | null;
  /** 'reps' = target range, 'amrap' = as many as possible, 'timed' = hold for duration_seconds_min+. */
  rep_mode: RepMode;
  duration_seconds_min: number | null;
  group_name: string | null;
  tempo: string | null;
  /** Coach-approved alternatives for this slot (selectable, not extra exercises). */
  alternatives: {
    id: string;
    name: string;
    primary_muscles: string[];
    equipment: string | null;
    is_bodyweight: boolean;
  }[];
  notes: string | null;
  sets: DraftSet[];
}

export type RepMode = 'reps' | 'amrap' | 'timed';

export interface RestTimer {
  set_id: string | null;
  duration_seconds: number;
  /** Absolute end time (ms epoch) while running; null when paused. */
  ends_at: number | null;
  /** Remaining ms while paused. */
  paused_remaining_ms: number | null;
}

export type DraftStatus = 'in_progress' | 'completed' | 'discarded';

export interface DraftSession {
  id: string;
  user_id: string;
  template_id: string | null;
  scheduled_workout_id: string | null;
  title: string;
  status: DraftStatus;
  started_at: string;
  ended_at: string | null;
  /** Set while the whole workout is paused. */
  paused_at: string | null;
  paused_seconds: number;
  notes: string | null;
  client_updated_at: string;
  exercises: DraftExercise[];
  current_exercise_index: number;
  rest: RestTimer | null;
  /** Server result after the final sync (personal records). */
  records?: PersonalRecordEvent[];
}

export interface PersonalRecordEvent {
  exercise_id: string;
  record_type: 'max_weight' | 'max_reps_at_weight' | 'estimated_1rm' | 'session_volume';
  value: number;
  weight_kg: number | null;
  reps: number | null;
}

/** Previous performance of one exercise: completed working sets in order. */
export interface PreviousSet {
  weight_kg: number | null;
  reps: number | null;
  duration_seconds?: number | null;
}

export type OutboxKind =
  'workout_session' | 'cardio_session' | 'delete_cardio_session' | 'water_log' | 'delete_water_log';

export interface OutboxItem {
  /** `${kind}:${entityId}` — a newer change to the same entity replaces the older one. */
  key: string;
  kind: OutboxKind;
  user_id: string;
  payload: unknown;
  created_at: number;
  updated_at: number;
  attempts: number;
  next_attempt_at: number;
  last_error: string | null;
}

export interface CacheEntry {
  key: string;
  value: unknown;
  updated_at: number;
}
