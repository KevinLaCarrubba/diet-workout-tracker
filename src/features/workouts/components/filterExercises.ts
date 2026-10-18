import type { Exercise } from '../api';

/** Name / muscle / equipment search; optionally lists exercises for `preferMuscles` first. */
export function filterExercises(exercises: Exercise[], query: string, preferMuscles: string[] = []) {
  const q = query.trim().toLowerCase();
  const matches = q
    ? exercises.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.primary_muscles.some((m) => m.toLowerCase().includes(q)) ||
          (e.equipment ?? '').toLowerCase().includes(q),
      )
    : exercises;
  if (preferMuscles.length === 0) return matches;
  const score = (e: Exercise) => (e.primary_muscles.some((m) => preferMuscles.includes(m)) ? 0 : 1);
  return [...matches].sort((a, b) => score(a) - score(b) || a.name.localeCompare(b.name));
}
