export interface ChecklistInput {
  isRestDay: boolean;
  workout: { status: string } | null;
  workoutDoneToday: boolean;
  meals: { status: string }[];
  waterMl: number;
  waterGoalMl: number;
  weighedIn: boolean;
}

export interface ChecklistItem {
  key: 'weight' | 'workout' | 'meals' | 'water';
  label: string;
  detail: string;
  done: boolean;
  to: string;
}

/**
 * Today's checklist. Rest days count as done (recovery is part of the plan),
 * skipped meals/workouts count as handled — no punitive streaks.
 */
export function buildChecklist(i: ChecklistInput): ChecklistItem[] {
  const planned = i.meals.filter((m) => m.status !== 'rescheduled');
  const handled = planned.filter((m) => m.status === 'eaten' || m.status === 'skipped').length;
  const eaten = planned.filter((m) => m.status === 'eaten').length;
  const workoutItem: ChecklistItem = i.isRestDay
    ? {
        key: 'workout',
        label: 'Rest day',
        detail: 'Recovery is on the plan today',
        done: true,
        to: '/workouts',
      }
    : i.workout
      ? {
          key: 'workout',
          label: 'Workout',
          detail:
            i.workout.status === 'completed' || i.workoutDoneToday
              ? 'Done'
              : i.workout.status === 'skipped'
                ? 'Skipped'
                : i.workout.status === 'rescheduled'
                  ? 'Moved'
                  : 'Planned',
          done: i.workoutDoneToday || ['completed', 'skipped', 'rescheduled'].includes(i.workout.status),
          to: '/workouts',
        }
      : {
          key: 'workout',
          label: 'Workout',
          detail: i.workoutDoneToday ? 'Done' : 'Nothing scheduled',
          done: i.workoutDoneToday,
          to: '/workouts',
        };
  return [
    {
      key: 'weight',
      label: 'Weigh-in',
      detail: i.weighedIn ? 'Logged' : 'Not yet',
      done: i.weighedIn,
      to: '/progress/weight',
    },
    workoutItem,
    {
      key: 'meals',
      label: 'Meals',
      detail: planned.length === 0 ? 'None planned' : `${eaten} of ${planned.length} eaten`,
      done: planned.length > 0 && handled === planned.length,
      to: '/meals',
    },
    {
      key: 'water',
      label: 'Water target',
      detail: `${Math.min(100, Math.round((i.waterMl / Math.max(1, i.waterGoalMl)) * 100))}%`,
      done: i.waterMl >= i.waterGoalMl,
      to: '/meals/water',
    },
  ];
}
