import { describe, expect, it } from 'vitest';
import coachPlan from '../../../supabase/seed/coach-plan-garrett-2026-10-18.json';
import rawManifest from '../../../public/models/exercises/manifest.json';
import { parseManifest, resolveExerciseAsset, resolveHighlight } from './manifest';

const manifest = parseManifest(rawManifest);

/** Coach exercises that have their own original demo (batch 1: Sunday, Monday, Wednesday). */
const BATCH_1 = [
  'Cable Lat Pushdowns',
  'Seated Neutral Grip Lat Pulldown',
  'Seated Close Grip Row',
  'Bent-over Cable High Elbow Row',
  'Seated Machine High Row w/ Twist (Single Hand)',
  'Standing Single Arm Bicep Cable Curl',
  'Standing Dumbbell Hammer Curls',
  'Seated Bicep Preacher Curl Machine',
  'Cable Rope Face Pulls',
  'Bent Over Cable Rear Delt Flyes',
  'Cable Side Lateral Raise',
  'Cable Front Raise',
  'Seated Machine Overhead Press',
  'Standing Viking Press',
  'Incline Dumbbell Chest Flyes',
  'Cable Crossovers',
  'Incline Bench Press',
  'Smith Machine Incline Bench',
  'Machine Seated Pullover',
  'Incline Bench Chest Supported Cable Rows',
  'Cable Seated High Row',
  'Single Arm Alternating Dumbbell Row (Bench Supported)',
  'Dead Weight Hangs',
];

/** Batch 2: Tuesday, Friday and Saturday (plus the Kettlebell alternatives). */
const BATCH_2 = [
  'Quad Extensions',
  'Hamstring Curls',
  'Pendulum Squat',
  'Hack Squat',
  'Hips Adductors (Close Legs)',
  'Hip Abductors (Open Legs)',
  'Heavy Hip Thrusts',
  'Wall Sits',
  'Dumbbell Split Squats',
  'Kettlebell Split Squats',
  'Seated Calf Raise',
  'Standing Calf Raise',
  'Incline Y-Raise',
  'Lying Dumbbell Rear Delt Flyes',
  'Hammer Dumbbell Front Raise',
  'Cable Pushdown w/ Rope',
  'Single Hand Cable Pushdown',
  'Overhead Cable Tricep Extension',
  'Seated Triceps Pushdown Machine',
  'Cable Tricep Kickback',
  'Pec Deck Machine Chest Flyes',
  'Seated Machine Press',
  'Incline Machine Press',
  'Smith Machine Flat Bench',
  'Chest Dips',
  'Weighted Step-ups (on bench or box)',
  'Bodyweight Squats',
  'Kettlebell Squats',
];

/** Coach names that are the same movement as another demo (resolved via aliases). */
const ALIASED = {
  'Light Hip Thrusts': 'Heavy Hip Thrusts',
  'Hack Squat (Light Weight)': 'Hack Squat',
  'Heavy Lunges': 'Walking Lunge',
  'Bodyweight Lunges': 'Walking Lunge',
  'Push-ups': 'Push-Up',
  'Pull-ups': 'Pull-Up',
  'Bent Over Barbell Row': 'Barbell Row',
  'Standing Alternating Dumbbell Curl': 'Dumbbell Curl',
  'Seated Dumbbell Lateral Raise': 'Lateral Raise',
};

/** Every exercise name in the coach plan, including listed alternatives. */
const planNames = coachPlan.workouts.flatMap((w) =>
  w.items.flatMap((i) => [
    i.name,
    ...('alternatives' in i && Array.isArray(i.alternatives) ? i.alternatives : []),
  ]),
);

describe('exercise demo library', () => {
  it.each([...BATCH_1, ...BATCH_2])('"%s" has its own demo keyed by the exact coach name', (name) => {
    const entry = manifest[name];
    expect(entry).toBeDefined();
    expect(resolveExerciseAsset(manifest, name)).toBe(entry);
    expect(resolveHighlight(entry!).meshes.length).toBeGreaterThan(0);
  });

  it('records the coach tempo on timed demos', () => {
    expect(manifest['Seated Close Grip Row']?.tempo).toBe('2-1-2-0');
    expect(manifest['Cable Rope Face Pulls']?.tempo).toBe('1-2-1-0');
    expect(manifest['Cable Crossovers']?.tempo).toBe('2-3-1-0');
  });

  it('resolves every coach plan exercise and alternative (none intentionally left out)', () => {
    expect(planNames.length).toBeGreaterThan(60);
    const missing = planNames.filter((n) => !resolveExerciseAsset(manifest, n));
    expect(missing).toEqual([]);
  });

  it.each(Object.entries(ALIASED))('"%s" shows the "%s" demo', (alias, target) => {
    expect(manifest[alias]).toBeUndefined();
    expect(resolveExerciseAsset(manifest, alias)).toBe(manifest[target]);
  });

  it('maps the coach plan muscle groups to highlight meshes', () => {
    for (const day of coachPlan.workouts) {
      for (const item of day.items) {
        const entry = resolveExerciseAsset(manifest, item.name)!;
        const { muscles } = resolveHighlight(entry, item.muscles);
        expect(muscles, item.name).toEqual(item.muscles);
      }
    }
  });
});
