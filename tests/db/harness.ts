import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite, type Transaction } from '@electric-sql/pglite';

const root = join(import.meta.dirname, '..', '..');
const migrationsDir = join(root, 'supabase', 'migrations');

export type Role = 'anon' | 'authenticated' | 'service_role';

/** Fresh in-memory Postgres with the Supabase stub and every migration applied. */
export async function createTestDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(readFileSync(join(import.meta.dirname, 'supabase-stub.sql'), 'utf8'));
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    try {
      await db.exec(readFileSync(join(migrationsDir, file), 'utf8'));
    } catch (error) {
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`, { cause: error });
    }
  }
  return db;
}

/**
 * Simulates GoTrue creating an account (runs as the table owner, so auth
 * triggers fire exactly as they would in Supabase).
 */
export async function createAuthUser(
  db: PGlite,
  email: string,
  options: { confirmed?: boolean } = {},
): Promise<string> {
  const result = await db.query<{ id: string }>(
    `insert into auth.users (email, email_confirmed_at) values ($1, $2) returning id`,
    [email, options.confirmed === false ? null : new Date().toISOString()],
  );
  return result.rows[0]!.id;
}

export async function confirmAuthUser(db: PGlite, userId: string): Promise<void> {
  await db.query(`update auth.users set email_confirmed_at = now() where id = $1`, [userId]);
}

/**
 * Runs `fn` as a PostgREST request would: `SET LOCAL ROLE` plus JWT claims,
 * inside a transaction that is rolled back on error.
 */
export async function runAs<T>(
  db: PGlite,
  identity: { role: Role; userId?: string },
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    const claims = JSON.stringify({ sub: identity.userId ?? '', role: identity.role });
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
    await tx.exec(`set local role ${identity.role}`);
    return fn(tx);
  });
}

export function asUser<T>(db: PGlite, userId: string, fn: (tx: Transaction) => Promise<T>) {
  return runAs(db, { role: 'authenticated', userId }, fn);
}

export function asAnon<T>(db: PGlite, fn: (tx: Transaction) => Promise<T>) {
  return runAs(db, { role: 'anon' }, fn);
}

export function asService<T>(db: PGlite, fn: (tx: Transaction) => Promise<T>) {
  return runAs(db, { role: 'service_role' }, fn);
}

/** Inserts a pending invitation the way the admin-invitations function does. */
export async function inviteEmail(
  db: PGlite,
  email: string,
  invitedBy: string,
  options: { expiresAt?: string } = {},
): Promise<string> {
  return asService(db, async (tx) => {
    const result = await tx.query<{ id: string }>(
      `insert into public.invitations (email, invited_by, expires_at)
       values ($1, $2, coalesce($3::timestamptz, now() + interval '7 days'))
       returning id`,
      [email, invitedBy, options.expiresAt ?? null],
    );
    return result.rows[0]!.id;
  });
}
