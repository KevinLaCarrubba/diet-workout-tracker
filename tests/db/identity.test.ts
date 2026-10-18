import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  asAnon,
  asService,
  asUser,
  confirmAuthUser,
  createAuthUser,
  createTestDb,
  inviteEmail,
} from './harness';

let db: PGlite;
let adminId: string;

/** Admin plus two invited members, Alice and Bob. */
async function seedTwoMembers() {
  await inviteEmail(db, 'alice@example.com', adminId);
  await inviteEmail(db, 'bob@example.com', adminId);
  const alice = await createAuthUser(db, 'alice@example.com');
  const bob = await createAuthUser(db, 'bob@example.com');
  return { alice, bob };
}

beforeEach(async () => {
  db = await createTestDb();
  adminId = await createAuthUser(db, 'admin@example.com');
});

describe('schema hygiene', () => {
  it('enables RLS on every table in the public schema', async () => {
    const { rows } = await db.query<{ relname: string }>(`
      select c.relname from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`);
    expect(rows.map((r) => r.relname)).toEqual([]);
  });

  it('gives anon no privileges on any public table', async () => {
    const { rows } = await db.query<{ table_name: string }>(`
      select table_name from information_schema.role_table_grants
      where table_schema = 'public' and grantee = 'anon'`);
    expect(rows).toEqual([]);
  });
});

describe('provisioning and invite-only signup', () => {
  it('makes the bootstrap account an admin with profile and settings', async () => {
    const profile = await db.query<{ role: string; timezone: string; preferred_units: string }>(
      `select role, timezone, preferred_units from public.profiles where id = $1`,
      [adminId],
    );
    expect(profile.rows[0]).toEqual({ role: 'admin', timezone: 'UTC', preferred_units: 'imperial' });
    const settings = await db.query<{ theme: string; water_goal_ml: number }>(
      `select theme, water_goal_ml from public.user_settings where user_id = $1`,
      [adminId],
    );
    expect(settings.rows[0]).toEqual({ theme: 'dark', water_goal_ml: 2000 });
  });

  it('rejects signups without an invitation once an admin exists', async () => {
    await expect(createAuthUser(db, 'stranger@example.com')).rejects.toThrow(/invite-only/);
  });

  it('accepts an invited email (case-insensitive) as a member and links the invitation', async () => {
    const invitationId = await inviteEmail(db, 'carol@example.com', adminId);
    const carol = await createAuthUser(db, 'Carol@Example.com', { confirmed: false });

    const profile = await db.query<{ role: string }>(`select role from public.profiles where id = $1`, [
      carol,
    ]);
    expect(profile.rows[0]?.role).toBe('member');

    let invitation = await db.query<{ status: string; invited_user_id: string }>(
      `select status, invited_user_id from public.invitations where id = $1`,
      [invitationId],
    );
    expect(invitation.rows[0]).toEqual({ status: 'pending', invited_user_id: carol });

    await confirmAuthUser(db, carol);
    invitation = await db.query(`select status, invited_user_id from public.invitations where id = $1`, [
      invitationId,
    ]);
    expect(invitation.rows[0]?.status).toBe('accepted');
  });

  it('rejects expired and revoked invitations', async () => {
    await inviteEmail(db, 'late@example.com', adminId, { expiresAt: '2000-01-01T00:00:00Z' });
    await expect(createAuthUser(db, 'late@example.com')).rejects.toThrow(/invite-only/);

    const id = await inviteEmail(db, 'revoked@example.com', adminId);
    await db.query(`update public.invitations set status = 'revoked' where id = $1`, [id]);
    await expect(createAuthUser(db, 'revoked@example.com')).rejects.toThrow(/invite-only/);
  });

  it('does not allow an invitation to be reused for a second account', async () => {
    await inviteEmail(db, 'dup@example.com', adminId);
    await createAuthUser(db, 'dup@example.com');
    await db.query(`delete from auth.users where email = 'dup@example.com'`);
    await expect(createAuthUser(db, 'dup@example.com')).rejects.toThrow(/invite-only/);
  });

  it('enforces the member cap even with a valid invitation', async () => {
    for (const name of ['m1', 'm2', 'm3', 'm4']) {
      await inviteEmail(db, `${name}@example.com`, adminId);
      await createAuthUser(db, `${name}@example.com`);
    }
    // Admin + 4 members = 5 = max_members().
    await inviteEmail(db, 'sixth@example.com', adminId);
    await expect(createAuthUser(db, 'sixth@example.com')).rejects.toThrow(/Member limit/);
  });

  it('allows only one pending invitation per email', async () => {
    await inviteEmail(db, 'once@example.com', adminId);
    await expect(inviteEmail(db, 'once@example.com', adminId)).rejects.toThrow(/duplicate key/);
  });

  it('counts accounts plus unused pending invitations as seats', async () => {
    await inviteEmail(db, 'pending@example.com', adminId);
    const { rows } = await asService(db, (tx) =>
      tx.query<{ seats: number }>(`select public.seats_in_use() as seats`),
    );
    expect(rows[0]?.seats).toBe(2);
  });
});

describe('row level security: two members cannot see each other', () => {
  it('limits profiles and settings to the owner', async () => {
    const { alice, bob } = await seedTwoMembers();

    const profiles = await asUser(db, alice, (tx) =>
      tx.query<{ id: string }>(`select id from public.profiles`),
    );
    expect(profiles.rows.map((r) => r.id)).toEqual([alice]);

    const settings = await asUser(db, bob, (tx) =>
      tx.query<{ user_id: string }>(`select user_id from public.user_settings`),
    );
    expect(settings.rows.map((r) => r.user_id)).toEqual([bob]);
  });

  it("silently ignores updates to another member's rows", async () => {
    const { alice, bob } = await seedTwoMembers();

    const result = await asUser(db, alice, (tx) =>
      tx.query(`update public.profiles set display_name = 'hacked' where id = $1`, [bob]),
    );
    expect(result.affectedRows).toBe(0);

    const settingsResult = await asUser(db, alice, (tx) =>
      tx.query(`update public.user_settings set water_goal_ml = 9999 where user_id = $1`, [bob]),
    );
    expect(settingsResult.affectedRows).toBe(0);

    const bobProfile = await db.query<{ display_name: string }>(
      `select display_name from public.profiles where id = $1`,
      [bob],
    );
    expect(bobProfile.rows[0]?.display_name).toBe('');
  });

  it('lets members manage only their own fitness goals', async () => {
    const { alice, bob } = await seedTwoMembers();

    await asUser(db, alice, (tx) =>
      tx.query(
        `insert into public.fitness_goals (user_id, start_weight_kg, target_weight_kg, effective_from)
         values ($1, 95, 85, '2026-10-18')`,
        [alice],
      ),
    );

    await expect(
      asUser(db, bob, (tx) =>
        tx.query(
          `insert into public.fitness_goals (user_id, start_weight_kg, target_weight_kg) values ($1, 80, 70)`,
          [alice],
        ),
      ),
    ).rejects.toThrow(/row-level security/);

    const bobView = await asUser(db, bob, (tx) => tx.query(`select * from public.fitness_goals`));
    expect(bobView.rows).toEqual([]);

    const bobDelete = await asUser(db, bob, (tx) => tx.query(`delete from public.fitness_goals`));
    expect(bobDelete.affectedRows).toBe(0);

    const aliceView = await asUser(db, alice, (tx) =>
      tx.query<{ target_weight_kg: string }>(`select target_weight_kg from public.fitness_goals`),
    );
    expect(aliceView.rows).toHaveLength(1);
  });

  it('prevents moving a goal row to another user', async () => {
    const { alice, bob } = await seedTwoMembers();
    await asUser(db, alice, (tx) =>
      tx.query(
        `insert into public.fitness_goals (user_id, start_weight_kg, target_weight_kg) values ($1, 90, 80)`,
        [alice],
      ),
    );
    await expect(
      asUser(db, alice, (tx) => tx.query(`update public.fitness_goals set user_id = $1`, [bob])),
    ).rejects.toThrow(/permission denied/);
  });

  it('denies anon access to user data', async () => {
    await seedTwoMembers();
    await expect(asAnon(db, (tx) => tx.query(`select * from public.profiles`))).rejects.toThrow(
      /permission denied/,
    );
    await expect(asAnon(db, (tx) => tx.query(`select * from public.invitations`))).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe('privilege boundaries', () => {
  it('blocks members from promoting themselves to admin', async () => {
    const { alice } = await seedTwoMembers();
    await expect(
      asUser(db, alice, (tx) => tx.query(`update public.profiles set role = 'admin' where id = $1`, [alice])),
    ).rejects.toThrow(/permission denied/);
  });

  it('blocks clients from creating profiles directly', async () => {
    const { alice } = await seedTwoMembers();
    await expect(
      asUser(db, alice, (tx) => tx.query(`insert into public.profiles (id) values (gen_random_uuid())`)),
    ).rejects.toThrow(/permission denied/);
  });

  it('lets members update their editable profile fields', async () => {
    const { alice } = await seedTwoMembers();
    const result = await asUser(db, alice, (tx) =>
      tx.query(
        `update public.profiles
            set display_name = 'Alice', timezone = 'America/Chicago', preferred_units = 'metric',
                height_cm = 170, onboarded_at = now()
          where id = $1`,
        [alice],
      ),
    );
    expect(result.affectedRows).toBe(1);
  });

  it('rejects invalid timezones and out-of-range values', async () => {
    const { alice } = await seedTwoMembers();
    await expect(
      asUser(db, alice, (tx) =>
        tx.query(`update public.profiles set timezone = 'Mars/Olympus' where id = $1`, [alice]),
      ),
    ).rejects.toThrow(/check constraint/);
    await expect(
      asUser(db, alice, (tx) =>
        tx.query(`update public.user_settings set water_goal_ml = 50 where user_id = $1`, [alice]),
      ),
    ).rejects.toThrow(/check constraint/);
  });

  it('hides invitations from members and shows them to admins', async () => {
    const { alice } = await seedTwoMembers();
    const memberView = await asUser(db, alice, (tx) => tx.query(`select * from public.invitations`));
    expect(memberView.rows).toEqual([]);
    const adminView = await asUser(db, adminId, (tx) => tx.query(`select * from public.invitations`));
    expect(adminView.rows).toHaveLength(2);
  });

  it('does not let admins write invitations directly (Edge Function only)', async () => {
    await expect(
      asUser(db, adminId, (tx) =>
        tx.query(`insert into public.invitations (email) values ('x@example.com')`),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('restricts admin_list_members to admins and exposes no personal metrics', async () => {
    const { alice } = await seedTwoMembers();
    await expect(
      asUser(db, alice, (tx) => tx.query(`select * from public.admin_list_members()`)),
    ).rejects.toThrow(/Admin only/);
    const { rows, fields } = await asUser(db, adminId, (tx) =>
      tx.query(`select * from public.admin_list_members()`),
    );
    expect(rows).toHaveLength(3);
    expect(fields.map((f) => f.name)).toEqual([
      'id',
      'email',
      'display_name',
      'role',
      'created_at',
      'last_sign_in_at',
      'email_confirmed',
    ]);
  });

  it('keeps service-only helpers away from clients', async () => {
    const { alice } = await seedTwoMembers();
    await expect(
      asUser(db, alice, (tx) => tx.query(`select public.auth_email_exists('bob@example.com')`)),
    ).rejects.toThrow(/permission denied/);
    await expect(asUser(db, alice, (tx) => tx.query(`select public.seats_in_use()`))).rejects.toThrow(
      /permission denied/,
    );
  });
});
