import type { PGlite } from '@electric-sql/pglite';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { asAnon, asUser, createAuthUser, createTestDb } from './harness';

let db: PGlite;
let admin: string;

beforeAll(async () => {
  db = await createTestDb();
  admin = await createAuthUser(db, 'admin@example.com');
});

const modelsDir = join(import.meta.dirname, '..', '..', 'public', 'models', 'exercises');

describe('generated exercise demo assets', () => {
  const manifest = JSON.parse(readFileSync(join(modelsDir, 'manifest.json'), 'utf8')) as Record<
    string,
    { file: string; primaryMuscles: string[]; meshesByMuscle: Record<string, string[]> }
  >;

  it('covers the initial catalog set by exact name', () => {
    expect(Object.keys(manifest)).toEqual(
      expect.arrayContaining([
        'Back Squat',
        'Goblet Squat',
        'Barbell Bench Press',
        'Push-Up',
        'Deadlift',
        'Romanian Deadlift',
        'Overhead Press',
        'Barbell Row',
        'Pull-Up',
        'Walking Lunge',
        'Lateral Raise',
        'Dumbbell Curl',
      ]),
    );
  });

  it('keeps every GLB small and maps every primary muscle to meshes', () => {
    let total = 0;
    for (const [name, entry] of Object.entries(manifest)) {
      const size = statSync(join(modelsDir, entry.file)).size;
      total += size;
      expect(size, name).toBeGreaterThan(1000);
      expect(size, name).toBeLessThan(150 * 1024);
      for (const muscle of entry.primaryMuscles) {
        expect(entry.meshesByMuscle[muscle]?.length, `${name}: ${muscle}`).toBeGreaterThan(0);
      }
    }
    expect(total).toBeLessThan(4 * 1024 * 1024);
  });

  it('gives every asset its own file', () => {
    const files = Object.values(manifest).map((entry) => entry.file);
    expect(new Set(files).size).toBe(files.length);
  });
});

describe('exercise animations seed', () => {
  it('links every generated asset to its shared catalog exercise', async () => {
    const manifest = JSON.parse(readFileSync(join(modelsDir, 'manifest.json'), 'utf8')) as Record<
      string,
      { file: string; primaryMuscles: string[] }
    >;
    const rows = await asUser(db, admin, (tx) =>
      tx.query<{ name: string; asset_path: string; metadata: { primaryMuscles: string[] } }>(
        `select e.name, a.asset_path, a.metadata
         from public.exercise_animations a join public.exercises e on e.id = a.exercise_id
         order by e.name`,
      ),
    );
    // Only shared catalog exercises get rows; coach-plan exercises are user-owned and match by name.
    expect(rows.rows).toHaveLength(12);
    for (const row of rows.rows) {
      const entry = manifest[row.name];
      expect(entry, row.name).toBeDefined();
      expect(row.asset_path).toBe(`/models/exercises/${entry!.file}`);
      expect(row.metadata.primaryMuscles).toEqual(entry!.primaryMuscles);
    }
  });

  it('is idempotent', async () => {
    const sql = readFileSync(
      join(
        import.meta.dirname,
        '..',
        '..',
        'supabase',
        'migrations',
        '20261018000700_exercise_animations.sql',
      ),
      'utf8',
    );
    await db.exec(sql);
    const count = await db.query<{ n: number }>('select count(*)::int as n from public.exercise_animations');
    expect(count.rows[0]!.n).toBe(12);
  });

  it('is invisible to anon', async () => {
    await expect(asAnon(db, (tx) => tx.query('select * from public.exercise_animations'))).rejects.toThrow(
      /permission denied/,
    );
  });
});
