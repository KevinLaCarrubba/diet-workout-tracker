import type { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { asUser, createAuthUser, createTestDb, inviteEmail } from './harness';

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
  await db.query(`update public.profiles set timezone = 'America/New_York' where id = $1`, [alice]);
});

beforeEach(async () => {
  await db.exec(
    `delete from public.weight_logs; delete from public.progress_photos; delete from storage.objects;`,
  );
});

const weigh = (user: string, kg: number, at: string) =>
  asUser(db, user, (tx) =>
    tx.query(`insert into public.weight_logs (id, user_id, weight_kg, measured_at) values ($1, $2, $3, $4)`, [
      randomUUID(),
      user,
      kg,
      at,
    ]),
  );

describe('weight trend', () => {
  it('uses the last weigh-in per local day and a trailing 7-day average', async () => {
    // Local (New York) days Jul 1..Jul 9 2030, with a gap on Jul 4–5.
    await weigh(alice, 100, '2030-07-01T12:00:00Z');
    await weigh(alice, 99, '2030-07-02T12:00:00Z');
    await weigh(alice, 98.6, '2030-07-03T11:00:00Z');
    await weigh(alice, 98, '2030-07-03T23:30:00Z'); // still Jul 3 in New York; last of the day wins
    await weigh(alice, 97, '2030-07-06T12:00:00Z');
    await weigh(alice, 96, '2030-07-07T12:00:00Z');
    await weigh(alice, 95, '2030-07-08T12:00:00Z');
    await weigh(alice, 94, '2030-07-09T12:00:00Z');
    await weigh(bob, 150, '2030-07-09T12:00:00Z');

    const { rows } = await asUser(db, alice, (tx) =>
      tx.query<{ local_date: Date; weight_kg: string; avg_7d: string; entries_7d: number }>(
        `select * from public.weight_trend('2030-07-03', '2030-07-09')`,
      ),
    );
    // Each average covers the 7 local days ending that day, using whichever days have a weigh-in.
    expect(rows.map((r) => [r.weight_kg, r.avg_7d, r.entries_7d])).toEqual([
      ['98.00', '99.00', 3], // Jul 3: Jun 27–Jul 3 → 100, 99, 98 (reaches back before the window start)
      ['97.00', '98.50', 4], // Jul 6: 100, 99, 98, 97
      ['96.00', '98.00', 5], // Jul 7: Jul 1–7 → 100, 99, 98, 97, 96
      ['95.00', '97.00', 5], // Jul 8: Jul 2–8 → 99, 98, 97, 96, 95
      ['94.00', '96.00', 5], // Jul 9: Jul 3–9 → 98, 97, 96, 95, 94
    ]);
  });
});

describe('progress photos', () => {
  it('requires files to live in the owner folder of the private bucket', async () => {
    await asUser(db, alice, (tx) =>
      tx.query(`insert into storage.objects (bucket_id, name, owner) values ('progress-photos', $1, $2)`, [
        `${alice}/front.jpg`,
        alice,
      ]),
    );
    await expect(
      asUser(db, bob, (tx) =>
        tx.query(`insert into storage.objects (bucket_id, name, owner) values ('progress-photos', $1, $2)`, [
          `${alice}/sneaky.jpg`,
          bob,
        ]),
      ),
    ).rejects.toThrow(/row-level security/);
    const bobSees = await asUser(db, bob, (tx) => tx.query(`select * from storage.objects`));
    expect(bobSees.rows).toEqual([]);
    const bucket = await db.query<{ public: boolean }>(
      `select public from storage.buckets where id = 'progress-photos'`,
    );
    expect(bucket.rows[0]?.public).toBe(false);
  });

  it('rejects photo rows pointing outside the owner folder', async () => {
    await expect(
      asUser(db, bob, (tx) =>
        tx.query(`insert into public.progress_photos (user_id, private_storage_path) values ($1, $2)`, [
          bob,
          `${alice}/front.jpg`,
        ]),
      ),
    ).rejects.toThrow(/check constraint/);
  });
});

describe('weekly summary', () => {
  it("summarises only the caller's own week", async () => {
    await weigh(alice, 90, '2030-07-01T12:00:00Z');
    await weigh(alice, 89, '2030-07-05T12:00:00Z');
    const { rows } = await asUser(db, alice, (tx) =>
      tx.query<{ s: Record<string, unknown> }>(`select public.weekly_summary('2030-07-01') as s`),
    );
    expect(rows[0]!.s).toMatchObject({
      weigh_ins: 2,
      weight_start_kg: 90,
      weight_end_kg: 89,
      workouts_completed: 0,
    });
    const bobRows = await asUser(db, bob, (tx) =>
      tx.query<{ s: Record<string, unknown> }>(`select public.weekly_summary('2030-07-01') as s`),
    );
    expect(bobRows.rows[0]!.s).toMatchObject({ weigh_ins: 0 });
  });
});
