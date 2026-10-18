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

describe('exercise demo library', () => {
  it.each(BATCH_1)('"%s" has its own demo keyed by the exact coach name', (name) => {
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

  it('resolves every Sunday, Monday and Wednesday coach exercise (directly or by alias)', () => {
    const days = coachPlan.workouts.filter((w) => ['sun', 'mon', 'wed'].includes(w.key));
    const missing = days
      .flatMap((w) => w.items.map((i) => i.name))
      .filter((n) => !resolveExerciseAsset(manifest, n));
    expect(missing).toEqual([]);
  });

  it('maps the coach plan muscle groups to highlight meshes', () => {
    for (const day of coachPlan.workouts.filter((w) => ['sun', 'mon', 'wed'].includes(w.key))) {
      for (const item of day.items) {
        const entry = resolveExerciseAsset(manifest, item.name)!;
        const { muscles } = resolveHighlight(entry, item.muscles);
        expect(muscles, item.name).toEqual(item.muscles);
      }
    }
  });
});
