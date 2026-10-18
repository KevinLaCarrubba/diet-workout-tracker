import { formatWeight, unitLabels, weightToDisplay, type UnitSystem } from '@/lib/units';
import type { PersonalRecordEvent } from '@/offline/types';

export type RecordType = PersonalRecordEvent['record_type'];

export const recordLabels: Record<RecordType, string> = {
  max_weight: 'Heaviest weight',
  max_reps_at_weight: 'Most reps at a weight',
  estimated_1rm: 'Estimated 1RM',
  session_volume: 'Best session volume',
};

export const E1RM_DISCLAIMER = 'Estimated 1RM (Epley) — not a tested max';

/** Human value of a record in the user's units. */
export function describeRecord(
  r: Pick<PersonalRecordEvent, 'record_type' | 'value' | 'weight_kg' | 'reps'>,
  units: UnitSystem,
): string {
  switch (r.record_type) {
    case 'max_weight':
    case 'session_volume':
      return formatWeight(Number(r.value), units);
    case 'max_reps_at_weight':
      return `${r.reps ?? Number(r.value)} reps @ ${weightToDisplay(Number(r.weight_kg ?? 0), units)} ${unitLabels(units).weight}`;
    case 'estimated_1rm':
      return `≈ ${formatWeight(Number(r.value), units)} (estimated)`;
  }
}
