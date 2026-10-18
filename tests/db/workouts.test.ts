import type { PGlite, Transaction } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { asUser, createAuthUser, createTestDb, inviteEmail } from './harness';

let db: PGlite;
let alice: string;
let bob: string;
let bench: string;
let squat: string;

beforeAll(async () => {
  db = await createTestDb();
  const admin = await createAuthUser(db, 'admin@example.com');
  await inviteEmail(db, 'alice@example.com', admin);
  await inviteEmail(db, 'bob@example.com', admin);
  alice = await createAuthUser(db, 'alice@example.com');
  bob = await createAuthUser(db, 'bob@example.com');
  const ex = await db.query<{ id: string; name: string }>(
    `select id, name from public.exercises where owner_user_id is null and name in ('Barbell Bench Press', 'Back Squat')`,
  );
  bench = ex.rows.find((r) => r.name === 'Barbell Bench Press')!.id;
  squat = ex.rows.find((r) => r.name === 'Back Squat')!.id;
});

beforeEach(async () => {
  await db.exec(`delete from public.workout_sessions; delete from public.cardio_sessions;
                 delete from public.workout_schedules; delete from public.scheduled_workouts;
                 delete from public.workout_templates where user_id is not null;`);
});

interface SetInput {
  weight_kg: number | null;
  reps: number | null;
  done?: boolean;
  id?: string;
}

function payload(opts: {
  id?: string;
  status?: 'in_progress' | 'completed';
  at: string;
  started?: string;
  exercises: { id?: string; exercise_id: string; name: string; sets: SetInput[] }[];
  scheduled_workout_id?: string;
}) {
  const started = opts.started ?? '2026-10-18T10:00:00Z';
  return {
    id: opts.id ?? randomUUID(),
    title: 'Test',
    status: opts.status ?? 'in_progress',
    started_at: started,
    ended_at: opts.status === 'completed' ? opts.at : null,
    paused_seconds: 0,
    client_updated_at: opts.at,
    scheduled_workout_id: opts.scheduled_workout_id ?? null,
    exercises: opts.exercises.map((e, i) => ({
      id: e.id ?? randomUUID(),
      exercise_id: e.exercise_id,
      sort_order: i,
      exercise_name_snapshot: e.name,
      primary_muscles_snapshot: ['chest'],
      sets: e.sets.map((s, j) => ({
        id: s.id ?? randomUUID(),
        sort_order: j,
        weight_kg: s.weight_kg,
        reps: s.reps,
        completed_at: s.done === false ? null : opts.at,
      })),
    })),
  };
}

const sync = (tx: Transaction, p: unknown) =>
  tx
    .query<{ r: { applied: boolean; records: { record_type: string; value: string }[] } }>(
      `select public.sync_workout_session($1::jsonb) as r`,
      [JSON.stringify(p)],
    )
    .then((res) => res.rows[0]!.r);

const count = async (sql: string, params: unknown[] = []) =>
  Number((await db.query<{ n: string }>(sql, params)).rows[0]!.n);

describe('seed data', () => {
  it('ships a shared exercise catalog and example plans', async () => {
    expect(
      await count(`select count(*) as n from public.exercises where owner_user_id is null`),
    ).toBeGreaterThan(30);
    const plans = await db.query<{ plan_name: string }>(
      `select distinct plan_name from public.workout_templates where user_id is null order by 1`,
    );
    expect(plans.rows.map((r) => r.plan_name)).toEqual(['Full Body', 'Push/Pull/Legs', 'Upper/Lower']);
    expect(
      await count(`select count(*) as n from public.workout_template_exercises te
                   join public.workout_templates t on t.id = te.template_id where t.title = 'Push'`),
    ).toBe(6);
  });
});

describe('sync_workout_session', () => {
  it('is idempotent: replaying the same snapshot writes nothing twice', async () => {
    const p = payload({
      at: '2026-10-18T10:30:00Z',
      exercises: [
        {
          exercise_id: bench,
          name: 'Bench',
          sets: [
            { weight_kg: 60, reps: 8 },
            { weight_kg: 60, reps: 8 },
          ],
        },
      ],
    });
    const first = await asUser(db, alice, (tx) => sync(tx, p));
    const second = await asUser(db, alice, (tx) => sync(tx, p));
    expect(first.applied).toBe(true);
    expect(second.applied).toBe(false);
    expect(await count(`select count(*) as n from public.workout_sessions`)).toBe(1);
    expect(await count(`select count(*) as n from public.workout_sets`)).toBe(2);
  });

  it('applies newer snapshots, ignores stale ones, and mirrors deletions', async () => {
    const base = payload({
      at: '2026-10-18T10:30:00Z',
      exercises: [
        {
          exercise_id: bench,
          name: 'Bench',
          sets: [
            { weight_kg: 60, reps: 8 },
            { weight_kg: 60, reps: 6 },
          ],
        },
      ],
    });
    await asUser(db, alice, (tx) => sync(tx, base));

    const newer = structuredClone(base);
    newer.client_updated_at = '2026-10-18T10:35:00Z';
    newer.exercises[0]!.sets = [newer.exercises[0]!.sets[0]!];
    await asUser(db, alice, (tx) => sync(tx, newer));
    expect(await count(`select count(*) as n from public.workout_sets`)).toBe(1);

    const stale = structuredClone(base);
    stale.client_updated_at = '2026-10-18T10:31:00Z';
    const res = await asUser(db, alice, (tx) => sync(tx, stale));
    expect(res.applied).toBe(false);
    expect(await count(`select count(*) as n from public.workout_sets`)).toBe(1);
  });

  it('computes totals and keeps completed history immutable', async () => {
    const p = payload({
      status: 'completed',
      at: '2026-10-18T11:00:00Z',
      exercises: [
        {
          exercise_id: bench,
          name: 'Bench',
          sets: [
            { weight_kg: 60, reps: 10 },
            { weight_kg: 60, reps: 8 },
            { weight_kg: 70, reps: null, done: false },
          ],
        },
      ],
    });
    await asUser(db, alice, (tx) => sync(tx, p));
    const s = await db.query<{ total_volume_kg: string; total_sets: number; duration_seconds: number }>(
      `select total_volume_kg, total_sets, duration_seconds from public.workout_sessions where id = $1`,
      [p.id],
    );
    expect(s.rows[0]).toEqual({ total_volume_kg: '1080.00', total_sets: 2, duration_seconds: 3600 });

    const edit = structuredClone(p);
    edit.client_updated_at = '2026-10-18T12:00:00Z';
    edit.exercises[0]!.sets[0]!.reps = 99;
    const res = await asUser(db, alice, (tx) => sync(tx, edit));
    expect(res.applied).toBe(false);
  });

  it("refuses to overwrite another user's session or reuse their ids", async () => {
    const p = payload({
      at: '2026-10-18T10:30:00Z',
      exercises: [{ exercise_id: bench, name: 'Bench', sets: [] }],
    });
    await asUser(db, alice, (tx) => sync(tx, p));
    const hijack = { ...p, client_updated_at: '2026-10-18T11:30:00Z' };
    await expect(asUser(db, bob, (tx) => sync(tx, hijack))).rejects.toThrow(/Not allowed|row-level security/);
    expect(
      await asUser(db, bob, (tx) => tx.query(`select * from public.workout_sessions`)).then((r) => r.rows),
    ).toEqual([]);
  });

  it("does not allow logging another user's private exercise", async () => {
    const custom = await asUser(db, alice, (tx) =>
      tx.query<{ id: string }>(
        `insert into public.exercises (owner_user_id, name) values ($1, 'Alice Secret') returning id`,
        [alice],
      ),
    );
    const p = payload({
      at: '2026-10-18T10:30:00Z',
      exercises: [{ exercise_id: custom.rows[0]!.id, name: 'x', sets: [] }],
    });
    await expect(asUser(db, bob, (tx) => sync(tx, p))).rejects.toThrow(/row-level security/);
    await db.query(`delete from public.exercises where name = 'Alice Secret'`);
  });

  it('records personal records against prior history', async () => {
    const first = payload({
      status: 'completed',
      started: '2026-10-10T10:00:00Z',
      at: '2026-10-10T11:00:00Z',
      exercises: [
        {
          exercise_id: bench,
          name: 'Bench',
          sets: [
            { weight_kg: 60, reps: 8 },
            { weight_kg: 60, reps: 8 },
          ],
        },
      ],
    });
    const r1 = await asUser(db, alice, (tx) => sync(tx, first));
    // First session: max weight and e1RM are records; reps-at-weight/volume need history.
    expect(r1.records.map((r) => r.record_type).sort()).toEqual(['estimated_1rm', 'max_weight']);

    const second = payload({
      status: 'completed',
      started: '2026-10-17T10:00:00Z',
      at: '2026-10-17T11:00:00Z',
      exercises: [
        {
          exercise_id: bench,
          name: 'Bench',
          sets: [
            { weight_kg: 60, reps: 10 },
            { weight_kg: 60, reps: 9 },
          ],
        },
      ],
    });
    const r2 = await asUser(db, alice, (tx) => sync(tx, second));
    expect(r2.records.map((r) => r.record_type).sort()).toEqual([
      'estimated_1rm',
      'max_reps_at_weight',
      'session_volume',
    ]);
    // Replaying does not duplicate records.
    await asUser(db, alice, (tx) => sync(tx, second));
    expect(await count(`select count(*) as n from public.personal_records`)).toBe(5);
    expect(
      await asUser(db, bob, (tx) => tx.query(`select * from public.personal_records`)).then((r) => r.rows),
    ).toEqual([]);
  });

  it('marks the scheduled occurrence completed', async () => {
    const t = await asUser(db, alice, (tx) =>
      tx.query<{ id: string }>(
        `select public.copy_workout_template((select id from public.workout_templates where user_id is null and title = 'Push')) as id`,
      ),
    );
    const sw = await asUser(db, alice, (tx) =>
      tx.query<{ id: string }>(
        `insert into public.scheduled_workouts (user_id, template_id, local_date) values ($1, $2, '2026-10-18') returning id`,
        [alice, t.rows[0]!.id],
      ),
    );
    const p = payload({
      status: 'completed',
      at: '2026-10-18T11:00:00Z',
      scheduled_workout_id: sw.rows[0]!.id,
      exercises: [{ exercise_id: squat, name: 'Squat', sets: [{ weight_kg: 100, reps: 5 }] }],
    });
    await asUser(db, alice, (tx) => sync(tx, p));
    const row = await db.query<{ status: string; session_id: string }>(
      `select status, session_id from public.scheduled_workouts where id = $1`,
      [sw.rows[0]!.id],
    );
    expect(row.rows[0]).toEqual({ status: 'completed', session_id: p.id });
  });
});

describe('templates and schedules', () => {
  it('copies shared plans into a private, editable template', async () => {
    const id = await asUser(db, alice, async (tx) => {
      const r = await tx.query<{ id: string }>(
        `select public.copy_workout_template((select id from public.workout_templates where user_id is null and title = 'Legs')) as id`,
      );
      return r.rows[0]!.id;
    });
    const mine = await asUser(db, alice, (tx) =>
      tx.query(`select * from public.workout_template_exercises where template_id = $1`, [id]),
    );
    expect(mine.rows).toHaveLength(5);
    const bobView = await asUser(db, bob, (tx) =>
      tx.query(`select * from public.workout_templates where id = $1`, [id]),
    );
    expect(bobView.rows).toEqual([]);
    await expect(
      asUser(db, bob, (tx) =>
        tx.query(`update public.workout_templates set title = 'x' where user_id is null`),
      ),
    ).resolves.toMatchObject({ affectedRows: 0 });
  });

  it('materialises weekly rules idempotently and resets future days when a rule changes', async () => {
    await db.query(`update public.profiles set timezone = 'America/New_York' where id = $1`, [alice]);
    const tpl = await asUser(db, alice, (tx) =>
      tx.query<{ id: string }>(
        `select public.copy_workout_template((select id from public.workout_templates where user_id is null and title = 'Upper')) as id`,
      ),
    );
    await asUser(db, alice, async (tx) => {
      await tx.query(
        `insert into public.workout_schedules (user_id, weekday, template_id, local_time) values ($1, 1, $2, '18:00')`,
        [alice, tpl.rows[0]!.id],
      );
      await tx.query(
        `insert into public.workout_schedules (user_id, weekday, template_id) values ($1, 3, null)`,
        [alice],
      );
    });
    await db.query(`update public.workout_schedules set created_at = '2026-01-01'`);

    const from = '2030-01-07'; // a Monday, safely in the future
    const to = '2030-01-13';
    const n1 = await asUser(db, alice, (tx) =>
      tx.query<{ n: number }>(`select public.ensure_my_scheduled_workouts($1, $2) as n`, [from, to]),
    );
    const n2 = await asUser(db, alice, (tx) =>
      tx.query<{ n: number }>(`select public.ensure_my_scheduled_workouts($1, $2) as n`, [from, to]),
    );
    expect([n1.rows[0]!.n, n2.rows[0]!.n]).toEqual([2, 0]);

    const rows = await asUser(db, alice, (tx) =>
      tx.query<{ local_date: Date; status: string; scheduled_at: Date | null }>(
        `select local_date, status, scheduled_at from public.scheduled_workouts order by local_date`,
      ),
    );
    expect(rows.rows.map((r) => r.status)).toEqual(['scheduled', 'rest']);
    // 18:00 in New York (EST) is 23:00 UTC.
    expect(rows.rows[0]!.scheduled_at!.toISOString()).toBe('2030-01-07T23:00:00.000Z');

    await asUser(db, alice, (tx) =>
      tx.query(`update public.workout_schedules set local_time = '07:00' where weekday = 1`),
    );
    expect(
      await count(`select count(*) as n from public.scheduled_workouts where local_date = '2030-01-07'`),
    ).toBe(0);

    const bobRun = await asUser(db, bob, (tx) =>
      tx.query<{ n: number }>(`select public.materialize_scheduled_workouts($1, $2, $3) as n`, [
        alice,
        from,
        to,
      ]),
    );
    expect(bobRun.rows[0]!.n).toBe(0);
  });

  it("rejects scheduling another user's template", async () => {
    const tpl = await asUser(db, alice, (tx) =>
      tx.query<{ id: string }>(
        `select public.copy_workout_template((select id from public.workout_templates where user_id is null and title = 'Pull')) as id`,
      ),
    );
    await expect(
      asUser(db, bob, (tx) =>
        tx.query(`insert into public.workout_schedules (user_id, weekday, template_id) values ($1, 2, $2)`, [
          bob,
          tpl.rows[0]!.id,
        ]),
      ),
    ).rejects.toThrow(/row-level security/);
  });
});

describe('cardio', () => {
  it('keeps cardio private and validated', async () => {
    await asUser(db, alice, (tx) =>
      tx.query(
        `insert into public.cardio_sessions (id, user_id, activity_type, occurred_at, duration_seconds, distance_meters)
         values ($1, $2, 'running', now(), 1800, 5000)`,
        [randomUUID(), alice],
      ),
    );
    expect(
      await asUser(db, bob, (tx) => tx.query(`select * from public.cardio_sessions`)).then((r) => r.rows),
    ).toEqual([]);
    await expect(
      asUser(db, alice, (tx) =>
        tx.query(
          `insert into public.cardio_sessions (id, user_id, activity_type, occurred_at, duration_seconds)
           values ($1, $2, 'custom', now(), 600)`,
          [randomUUID(), alice],
        ),
      ),
    ).rejects.toThrow(/check constraint/);
  });
});
