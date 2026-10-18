import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { asService, asUser, createAuthUser, createTestDb, inviteEmail } from './harness';

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
});

const register = (user: string, endpoint: string) =>
  asUser(db, user, (tx) =>
    tx.query<{ id: string }>(
      `select public.register_push_subscription($1, 'p256', 'authkey', 'Phone', 'UA') as id`,
      [endpoint],
    ),
  );

describe('push subscriptions', () => {
  it('registers idempotently and keeps subscriptions private', async () => {
    const a = await register(alice, 'https://push.example.com/a');
    const again = await register(alice, 'https://push.example.com/a');
    expect(again.rows[0]!.id).toBe(a.rows[0]!.id);
    const bobView = await asUser(db, bob, (tx) => tx.query(`select * from public.push_subscriptions`));
    expect(bobView.rows).toEqual([]);
  });

  it('moves a browser endpoint to whoever signed in on that device last', async () => {
    await register(alice, 'https://push.example.com/shared');
    await register(bob, 'https://push.example.com/shared');
    const owner = await db.query<{ user_id: string }>(
      `select user_id from public.push_subscriptions where endpoint = 'https://push.example.com/shared'`,
    );
    expect(owner.rows[0]!.user_id).toBe(bob);
  });

  it('rejects non-https endpoints and lets users revoke their own', async () => {
    await expect(register(alice, 'http://insecure.example.com')).rejects.toThrow(/check constraint/);
    const res = await asUser(db, alice, (tx) =>
      tx.query(
        `update public.push_subscriptions set revoked_at = now() where endpoint = 'https://push.example.com/a'`,
      ),
    );
    expect(res.affectedRows).toBe(1);
  });
});

describe('notification log', () => {
  it('allows each occurrence key once (idempotent delivery)', async () => {
    const insert = () =>
      asService(db, (tx) =>
        tx.query(
          `insert into public.notification_logs (user_id, reminder_type, occurrence_key, status)
           values ($1, 'meal_due', 'meal:123:due', 'sent') on conflict (occurrence_key) do nothing`,
          [alice],
        ),
      );
    expect((await insert()).affectedRows).toBe(1);
    expect((await insert()).affectedRows).toBe(0);
  });

  it('is read-only for clients and private', async () => {
    await expect(
      asUser(db, alice, (tx) =>
        tx.query(
          `insert into public.notification_logs (user_id, reminder_type, occurrence_key, status) values ($1, 'water', 'x', 'sent')`,
          [alice],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
    const bobView = await asUser(db, bob, (tx) => tx.query(`select * from public.notification_logs`));
    expect(bobView.rows).toEqual([]);
  });

  it('only lets the service role build summaries for a given user', async () => {
    await expect(
      asUser(db, bob, (tx) => tx.query(`select public.weekly_summary_for($1, '2030-07-01')`, [alice])),
    ).rejects.toThrow(/permission denied/);
    const ok = await asService(db, (tx) =>
      tx.query<{ s: { weigh_ins: number } }>(`select public.weekly_summary_for($1, '2030-07-01') as s`, [
        alice,
      ]),
    );
    expect(ok.rows[0]!.s.weigh_ins).toBe(0);
  });
});
