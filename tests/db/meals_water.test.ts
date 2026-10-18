import type { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { asAnon, asUser, createAuthUser, createTestDb, inviteEmail } from './harness';

let db: PGlite;
let alice: string;
let bob: string;

beforeAll(async () => {
  db = await createTestDb();
  const admin = await createAuthUser(db, 'admin@example.com');
  await inviteEmail(db, 'alice@example.com', admin);
  await inviteEmail(db, 'bob@example.com', admin);
  alice = await createAuthUser(db, 'alice@example.com');
  bob = await createAuthUser(db, 'bob@example.com');
  await db.query(`update public.profiles set timezone = 'America/Chicago' where id = $1`, [alice]);
});

beforeEach(async () => {
  await db.exec(
    `delete from public.meal_occurrences; delete from public.meal_schedules; delete from public.water_logs;`,
  );
});

async function addSchedule(user: string, label: string, time: string, days = '{1,2,3,4,5,6,7}') {
  const r = await asUser(db, user, (tx) =>
    tx.query<{ id: string }>(
      `insert into public.meal_schedules (user_id, label, description, local_time, recurrence_weekdays)
       values ($1, $2, 'Chicken and rice', $3, $4) returning id`,
      [user, label, time, days],
    ),
  );
  await db.query(`update public.meal_schedules set created_at = '2026-01-01' where id = $1`, [r.rows[0]!.id]);
  return r.rows[0]!.id;
}

describe('meal schedules', () => {
  it('materialises “Meal #2 — Chicken and rice — 1:30 PM” in the user’s timezone, idempotently', async () => {
    await addSchedule(alice, 'Meal #2', '13:30');
    const run = () =>
      asUser(db, alice, (tx) =>
        tx.query<{ n: number }>(`select public.ensure_my_meal_occurrences('2030-07-01', '2030-07-01') as n`),
      );
    expect((await run()).rows[0]!.n).toBe(1);
    expect((await run()).rows[0]!.n).toBe(0);

    const occ = await asUser(db, alice, (tx) =>
      tx.query<{ label_snapshot: string; description_snapshot: string; scheduled_at: Date; status: string }>(
        `select label_snapshot, description_snapshot, scheduled_at, status from public.meal_occurrences`,
      ),
    );
    expect(occ.rows[0]).toMatchObject({
      label_snapshot: 'Meal #2',
      description_snapshot: 'Chicken and rice',
      status: 'pending',
    });
    // 1:30 PM CDT = 18:30 UTC.
    expect(occ.rows[0]!.scheduled_at.toISOString()).toBe('2030-07-01T18:30:00.000Z');
  });

  it('only creates meals on the chosen weekdays', async () => {
    await addSchedule(alice, 'Weekday lunch', '12:00', '{1,2,3,4,5}');
    await asUser(db, alice, (tx) =>
      tx.query(`select public.ensure_my_meal_occurrences('2030-07-01', '2030-07-07')`),
    );
    const n = await db.query<{ n: string }>(`select count(*) as n from public.meal_occurrences`);
    expect(Number(n.rows[0]!.n)).toBe(5);
  });

  it('records eaten with completion time; status and timestamps must agree', async () => {
    await addSchedule(alice, 'Meal #1', '08:00');
    await asUser(db, alice, (tx) =>
      tx.query(`select public.ensure_my_meal_occurrences('2030-07-01', '2030-07-01')`),
    );
    await asUser(db, alice, (tx) =>
      tx.query(`update public.meal_occurrences set status = 'eaten', completed_at = '2030-07-01T13:10:00Z'`),
    );
    await expect(
      asUser(db, alice, (tx) => tx.query(`update public.meal_occurrences set status = 'pending'`)),
    ).rejects.toThrow(/check constraint/);
  });

  it('refreshes future pending meals when a schedule changes but keeps acted-on ones', async () => {
    const id = await addSchedule(alice, 'Meal #3', '18:00');
    await asUser(db, alice, (tx) =>
      tx.query(`select public.ensure_my_meal_occurrences('2030-07-01', '2030-07-02')`),
    );
    await asUser(db, alice, (tx) =>
      tx.query(`update public.meal_occurrences set status = 'skipped' where local_date = '2030-07-01'`),
    );
    await asUser(db, alice, (tx) =>
      tx.query(`update public.meal_schedules set local_time = '19:00' where id = $1`, [id]),
    );
    const rows = await db.query<{ local_date: Date; status: string }>(
      `select local_date, status from public.meal_occurrences order by local_date`,
    );
    expect(rows.rows.map((r) => r.status)).toEqual(['skipped']);
  });

  it('keeps meals private between users', async () => {
    await addSchedule(alice, 'Meal #1', '08:00');
    await asUser(db, alice, (tx) =>
      tx.query(`select public.ensure_my_meal_occurrences('2030-07-01', '2030-07-01')`),
    );
    const bobView = await asUser(db, bob, (tx) => tx.query(`select * from public.meal_occurrences`));
    expect(bobView.rows).toEqual([]);
    const bobSchedules = await asUser(db, bob, (tx) => tx.query(`select * from public.meal_schedules`));
    expect(bobSchedules.rows).toEqual([]);
    const theirSchedule = (await db.query<{ id: string }>(`select id from public.meal_schedules limit 1`))
      .rows[0]!.id;
    await expect(
      asUser(db, bob, (tx) =>
        tx.query(
          `insert into public.meal_occurrences (user_id, schedule_id, local_date, local_time, scheduled_at, label_snapshot)
           values ($1, $2, '2030-07-02', '08:00', now(), 'x')`,
          [bob, theirSchedule],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(asAnon(db, (tx) => tx.query(`select * from public.meal_schedules`))).rejects.toThrow(
      /permission denied/,
    );
  });

  it('has no nutrition columns anywhere', async () => {
    const { rows } = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns
        where table_schema = 'public'
          and column_name ~* '(calor|kcal|macro|protein|carb|fat_g|sugar|sodium|nutri|barcode|recipe)'`,
    );
    expect(rows).toEqual([]);
  });
});

describe('water', () => {
  it('totals by local day in the user’s timezone and stays private', async () => {
    const add = (ml: number, at: string) =>
      asUser(db, alice, (tx) =>
        tx.query(
          `insert into public.water_logs (id, user_id, amount_ml, occurred_at) values ($1, $2, $3, $4)`,
          [randomUUID(), alice, ml, at],
        ),
      );
    await add(500, '2030-07-01T14:00:00Z');
    await add(350, '2030-07-02T03:00:00Z'); // 10 PM on Jul 1 in Chicago
    await add(240, '2030-07-02T15:00:00Z');
    const totals = await asUser(db, alice, (tx) =>
      tx.query<{ local_date: Date; total_ml: number; entries: number }>(
        `select * from public.water_daily_totals('2030-07-01', '2030-07-02')`,
      ),
    );
    expect(totals.rows.map((r) => [r.total_ml, r.entries])).toEqual([
      [850, 2],
      [240, 1],
    ]);
    const bobTotals = await asUser(db, bob, (tx) =>
      tx.query(`select * from public.water_daily_totals('2030-07-01', '2030-07-02')`),
    );
    expect(bobTotals.rows).toEqual([]);
  });

  it('rejects absurd amounts and lets owners correct or delete entries', async () => {
    const id = randomUUID();
    await expect(
      asUser(db, alice, (tx) =>
        tx.query(
          `insert into public.water_logs (id, user_id, amount_ml, occurred_at) values ($1, $2, 0, now())`,
          [randomUUID(), alice],
        ),
      ),
    ).rejects.toThrow(/check constraint/);
    await asUser(db, alice, (tx) =>
      tx.query(
        `insert into public.water_logs (id, user_id, amount_ml, occurred_at) values ($1, $2, 710, now())`,
        [id, alice],
      ),
    );
    const bobDelete = await asUser(db, bob, (tx) =>
      tx.query(`delete from public.water_logs where id = $1`, [id]),
    );
    expect(bobDelete.affectedRows).toBe(0);
    await asUser(db, alice, (tx) =>
      tx.query(`update public.water_logs set amount_ml = 355 where id = $1`, [id]),
    );
    const del = await asUser(db, alice, (tx) =>
      tx.query(`delete from public.water_logs where id = $1`, [id]),
    );
    expect(del.affectedRows).toBe(1);
  });
});

describe('deleting schedules', () => {
  it('removes future pending occurrences instead of orphaning them', async () => {
    const id = await addSchedule(alice, 'Temp meal', '10:00');
    await asUser(db, alice, (tx) =>
      tx.query(`select public.ensure_my_meal_occurrences('2030-07-01', '2030-07-03')`),
    );
    await asUser(db, alice, (tx) => tx.query(`delete from public.meal_schedules where id = $1`, [id]));
    const left = await db.query<{ n: string }>(
      `select count(*) as n from public.meal_occurrences where label_snapshot = 'Temp meal'`,
    );
    expect(Number(left.rows[0]!.n)).toBe(0);
  });
});
