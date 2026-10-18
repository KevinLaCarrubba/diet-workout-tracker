import type { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { asUser, createAuthUser, createTestDb, inviteEmail } from './harness';

const plan = readFileSync(
  join(import.meta.dirname, '..', '..', 'supabase', 'seed', 'coach-plan-garrett-2026-10-18.json'),
  'utf8',
);

let db: PGlite;
let me: string;
let other: string;

const runImport = async (user: string) =>
  (
    await db.query<{ r: Record<string, number> }>(`select public.import_coach_plan($1, $2::jsonb) as r`, [
      user,
      plan,
    ])
  ).rows[0]!.r;

beforeAll(async () => {
  db = await createTestDb();
  const admin = await createAuthUser(db, 'admin@example.com');
  await inviteEmail(db, 'me@example.com', admin);
  await inviteEmail(db, 'other@example.com', admin);
  me = await createAuthUser(db, 'me@example.com');
  other = await createAuthUser(db, 'other@example.com');
  await db.query(`update public.profiles set timezone = 'America/New_York' where id = $1`, [me]);
});

describe('coach plan import', () => {
  it('imports once and is idempotent', async () => {
    const first = await runImport(me);
    expect(first).toMatchObject({ templates: 6, schedules: 7, meals: 9 });
    expect(first.exercises).toBeGreaterThan(50);
    const second = await runImport(me);
    expect(second).toEqual({ templates: 0, exercises: 0, schedules: 0, meals: 0 });
  });

  it('builds the week: six training days at 5:00 AM and Thursday rest', async () => {
    const rows = await asUser(db, me, (tx) =>
      tx.query<{ weekday: number; title: string | null; local_time: string | null }>(
        `select s.weekday, t.title, s.local_time from public.workout_schedules s
           left join public.workout_templates t on t.id = s.template_id order by s.weekday`,
      ),
    );
    expect(rows.rows.map((r) => [r.weekday, r.title?.split(' — ')[0] ?? 'Rest', r.local_time])).toEqual([
      [1, 'Monday', '05:00:00'],
      [2, 'Tuesday', '05:00:00'],
      [3, 'Wednesday', '05:00:00'],
      [4, 'Rest', null],
      [5, 'Friday', '05:00:00'],
      [6, 'Saturday', '05:00:00'],
      [7, 'Sunday', '05:00:00'],
    ]);
  });

  it('keeps order, default 3x10, and the special prescriptions', async () => {
    const rows = await asUser(db, me, (tx) =>
      tx.query<{
        title: string;
        name: string;
        target_sets: number;
        rep_min: number | null;
        rep_mode: string;
        duration_seconds_min: number | null;
        tempo: string | null;
        group_name: string;
        alts: number;
      }>(
        `select t.title, e.name, te.target_sets, te.rep_min, te.rep_mode, te.duration_seconds_min, te.tempo, te.group_name,
                cardinality(te.alternative_exercise_ids) as alts
           from public.workout_template_exercises te
           join public.workout_templates t on t.id = te.template_id
           join public.exercises e on e.id = te.exercise_id
          where t.user_id is not null
          order by t.title, te.sort_order`,
      ),
    );
    const byName = (title: string, name: string) =>
      rows.rows.find((r) => r.title.startsWith(title) && r.name === name)!;
    expect(rows.rows).toHaveLength(67);
    expect(byName('Sunday', 'Cable Lat Pushdowns')).toMatchObject({
      target_sets: 3,
      rep_min: 10,
      rep_mode: 'reps',
      tempo: '2-1-2-0',
    });
    expect(byName('Monday', 'Standing Viking Press')).toMatchObject({ target_sets: 1, rep_mode: 'amrap' });
    expect(byName('Monday', 'Seated Dumbbell Lateral Raise')).toMatchObject({
      target_sets: 2,
      rep_mode: 'amrap',
    });
    expect(byName('Tuesday', 'Wall Sits')).toMatchObject({
      target_sets: 5,
      rep_mode: 'timed',
      duration_seconds_min: 30,
    });
    expect(byName('Wednesday', 'Dead Weight Hangs')).toMatchObject({
      target_sets: 4,
      rep_mode: 'timed',
      duration_seconds_min: 20,
    });
    expect(byName('Tuesday', 'Seated Calf Raise')).toMatchObject({ target_sets: 3, rep_min: 20 });
    expect(byName('Tuesday', 'Dumbbell Split Squats')).toMatchObject({ alts: 1 });
    expect(byName('Tuesday', 'Quad Extensions').tempo).toBeNull(); // legs: tempo not specified
    const sunday = rows.rows.filter((r) => r.title.startsWith('Sunday')).map((r) => r.name);
    expect(sunday.slice(0, 2)).toEqual(['Cable Lat Pushdowns', 'Seated Neutral Grip Lat Pulldown']);
  });

  it('loads six meals with coach numbering, Meal 3 before the gym and a spaced-out Thursday', async () => {
    const meals = await asUser(db, me, (tx) =>
      tx.query<{
        meal_number: number;
        display_order: number;
        local_time: string;
        recurrence_weekdays: number[];
        needs_confirmation: boolean;
        items: unknown[];
      }>(
        `select meal_number, display_order, local_time, recurrence_weekdays, needs_confirmation, items
           from public.meal_schedules where import_key not like '%-thu' order by display_order`,
      ),
    );
    expect(meals.rows.map((m) => [m.meal_number, m.local_time])).toEqual([
      [1, '03:35:00'],
      [3, '04:00:00'],
      [4, '06:30:00'],
      [2, '09:00:00'],
      [5, '16:30:00'],
      [6, '20:00:00'],
    ]);
    const m3 = meals.rows.find((m) => m.meal_number === 3)!;
    expect(m3.needs_confirmation).toBe(false);
    expect(m3.recurrence_weekdays).not.toContain(4);
    expect(meals.rows.find((m) => m.meal_number === 4)!.recurrence_weekdays).not.toContain(4);
    expect(meals.rows.find((m) => m.meal_number === 2)!.recurrence_weekdays).not.toContain(4);
    expect(meals.rows.find((m) => m.meal_number === 5)!.recurrence_weekdays).toContain(4);

    // Thursday 2030-07-04 (rest day): all six meals, spaced through the day.
    await asUser(db, me, (tx) =>
      tx.query(`select public.ensure_my_meal_occurrences('2030-07-04', '2030-07-04')`),
    );
    const thu = await asUser(db, me, (tx) =>
      tx.query<{ meal_number: number; local_time: string; items_snapshot: unknown[] }>(
        `select meal_number, local_time, items_snapshot from public.meal_occurrences order by display_order`,
      ),
    );
    expect(thu.rows.map((r) => [r.meal_number, r.local_time])).toEqual([
      [1, '03:35:00'],
      [2, '07:00:00'],
      [3, '10:15:00'],
      [4, '13:15:00'],
      [5, '16:30:00'],
      [6, '20:00:00'],
    ]);
    expect(thu.rows[0]!.items_snapshot).toEqual([{ text: '2 scoops whey protein' }]);
  });

  it("never touches another user's data and is service-only", async () => {
    const theirs = await asUser(db, other, (tx) => tx.query(`select * from public.meal_schedules`));
    expect(theirs.rows).toEqual([]);
    await expect(
      asUser(db, other, (tx) => tx.query(`select public.import_coach_plan($1, $2::jsonb)`, [me, plan])),
    ).rejects.toThrow(/permission denied/);
  });
});
