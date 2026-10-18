import { notifyError } from '@/lib/notify';
import { useUpdateOccurrence } from './api';
import {
  eatenPatch,
  skipPatch,
  snoozePatch,
  undoPatch,
  type MealOccurrence,
  type OccurrencePatch,
} from './logic';

/** Ate / Skip / Snooze / Undo for meal cards, applied optimistically. */
export function useMealActions() {
  const update = useUpdateOccurrence();
  const run = (meal: MealOccurrence, patch: OccurrencePatch) =>
    update.mutate({ id: meal.id, date: meal.local_date, patch }, { onError: notifyError });
  return {
    ate: (meal: MealOccurrence) => run(meal, eatenPatch()),
    skip: (meal: MealOccurrence) => run(meal, skipPatch()),
    snooze: (meal: MealOccurrence, minutes: number) => run(meal, snoozePatch(minutes)),
    undo: (meal: MealOccurrence) => run(meal, undoPatch()),
    saveNote: (meal: MealOccurrence, notes: string | null, onDone?: () => void) =>
      update.mutate(
        { id: meal.id, date: meal.local_date, patch: { notes } },
        { onError: notifyError, onSuccess: onDone },
      ),
    pending: update.isPending,
  };
}
