import type { DraftExercise, RepMode } from '@/offline/types';
import { targetLabel } from '../session/draft';
import type { TemplateExercise, TemplateWithExercises } from '../api';

export interface ItemValues {
  target_sets: number;
  rep_mode: RepMode;
  rep_min: number | null;
  rep_max: number | null;
  duration_seconds_min: number | null;
  rest_seconds: number | null;
  group_name: string;
  tempo: string;
  notes: string;
  alternative_exercise_ids: string[];
}

export interface ItemPayload {
  target_sets: number;
  rep_mode: RepMode;
  rep_min: number;
  rep_max: number;
  duration_seconds_min: number | null;
  rest_seconds: number | null;
  group_name: string | null;
  tempo: string | null;
  notes: string | null;
  alternative_exercise_ids: string[];
}

export const itemValues = (item: TemplateExercise): ItemValues => {
  const mode = (item.rep_mode as RepMode) ?? 'reps';
  return {
    target_sets: item.target_sets,
    rep_mode: mode,
    rep_min: mode === 'reps' ? item.rep_min : null,
    rep_max: mode === 'reps' ? item.rep_max : null,
    duration_seconds_min: item.duration_seconds_min,
    rest_seconds: item.rest_seconds,
    group_name: item.group_name ?? '',
    tempo: item.tempo ?? '',
    notes: item.notes ?? '',
    alternative_exercise_ids: item.alternative_exercise_ids ?? [],
  };
};

const intIn = (v: number | null | undefined, min: number, max: number) =>
  v != null && Number.isInteger(v) && v >= min && v <= max;

/** Field errors matching the DB checks; empty object when valid. */
export function validateItem(v: ItemValues): Partial<Record<keyof ItemValues, string>> {
  const errors: Partial<Record<keyof ItemValues, string>> = {};
  if (!intIn(v.target_sets, 1, 20)) errors.target_sets = '1–20 sets';
  if (v.rep_mode === 'reps') {
    if (!intIn(v.rep_min, 1, 100)) errors.rep_min = '1–100';
    if (!intIn(v.rep_max, 1, 100)) errors.rep_max = '1–100';
    else if (v.rep_min != null && v.rep_max! < v.rep_min) errors.rep_max = 'At least the minimum';
  }
  if (v.rep_mode === 'timed' && !intIn(v.duration_seconds_min, 1, 3600))
    errors.duration_seconds_min = '1–3600 seconds';
  if (v.rest_seconds != null && !intIn(v.rest_seconds, 0, 900)) errors.rest_seconds = '0–900 seconds';
  if (v.group_name.trim().length > 40) errors.group_name = 'Up to 40 characters';
  if (v.tempo.trim().length > 20) errors.tempo = 'Up to 20 characters';
  if (v.notes.trim().length > 500) errors.notes = 'Up to 500 characters';
  return errors;
}

/**
 * Row values for workout_template_exercises. AMRAP and timed items store
 * rep_min = rep_max = 1 placeholders (the columns are NOT NULL).
 */
export function buildItemPayload(v: ItemValues): ItemPayload {
  const reps = v.rep_mode === 'reps';
  return {
    target_sets: v.target_sets,
    rep_mode: v.rep_mode,
    rep_min: reps ? (v.rep_min ?? 1) : 1,
    rep_max: reps ? Math.max(v.rep_max ?? 1, v.rep_min ?? 1) : 1,
    duration_seconds_min: v.rep_mode === 'timed' ? v.duration_seconds_min : null,
    rest_seconds: v.rest_seconds,
    group_name: v.group_name.trim() || null,
    tempo: v.tempo.trim() || null,
    notes: v.notes.trim() || null,
    alternative_exercise_ids: [...new Set(v.alternative_exercise_ids)],
  };
}

/** sort_order writes needed to move the item at `from` to `to`. */
export function reorderChanges(
  items: Pick<TemplateExercise, 'id' | 'sort_order'>[],
  from: number,
  to: number,
): { id: string; sort_order: number }[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return [];
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next.flatMap((item, index) =>
    item.sort_order === index ? [] : [{ id: item.id, sort_order: index }],
  );
}

export const nextSortOrder = (items: Pick<TemplateExercise, 'sort_order'>[]) =>
  items.reduce((max, i) => Math.max(max, i.sort_order), -1) + 1;

/** Consecutive runs of items that share a group name (null = ungrouped). */
export function groupRuns<T extends { group_name: string | null }>(
  items: T[],
): { group: string | null; items: { item: T; index: number }[] }[] {
  const runs: { group: string | null; items: { item: T; index: number }[] }[] = [];
  items.forEach((item, index) => {
    const group = item.group_name?.trim() || null;
    const last = runs[runs.length - 1];
    if (last && last.group === group) last.items.push({ item, index });
    else runs.push({ group, items: [{ item, index }] });
  });
  return runs;
}

/** "Back · Biceps" — distinct groups in order. */
export const groupSummary = (template: Pick<TemplateWithExercises, 'items'>) =>
  [...new Set(template.items.map((i) => i.group_name?.trim()).filter((g): g is string => !!g))].join(' · ');

/** "3 × 10", "2 sets AMRAP", "5 rounds × 30s+" for a template item. */
export function itemTargetLabel(
  item: Pick<TemplateExercise, 'target_sets' | 'rep_mode' | 'rep_min' | 'rep_max' | 'duration_seconds_min'>,
) {
  const mode = (item.rep_mode as RepMode) ?? 'reps';
  return targetLabel({
    sets: Array.from({ length: item.target_sets }, () => ({ is_warmup: false })) as DraftExercise['sets'],
    rep_mode: mode,
    rep_min: mode === 'reps' ? item.rep_min : null,
    rep_max: mode === 'reps' ? item.rep_max : null,
    duration_seconds_min: item.duration_seconds_min,
  });
}

/** Shared plans grouped by plan name, in first-seen order. */
export function groupPlans<T extends Pick<TemplateWithExercises, 'plan_name'>>(templates: T[]) {
  const map = new Map<string, T[]>();
  for (const t of templates) {
    const name = t.plan_name?.trim() || 'Other';
    map.set(name, [...(map.get(name) ?? []), t]);
  }
  return [...map.entries()].map(([name, list]) => ({ name, templates: list }));
}
