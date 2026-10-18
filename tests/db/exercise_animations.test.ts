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

  it('covers the initial exercise set by exact catalog name', () => {
    expect(Object.keys(manifest).sort()).toEqual(
      [
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
      ].sort(),
    );
  });

  it('keeps every GLB small and maps every primary muscle to meshes', () => {
    for (const [name, entry] of Object.entries(manifest)) {
      const size = statSync(join(modelsDir, entry.file)).size;
      expect(size, name).toBeGreaterThan(1000);
      expect(size, name).toBeLessThan(150 * 1024);
      for (const muscle of entry.primaryMuscles) {
        expect(entry.meshesByMuscle[muscle]?.length, `${name}: ${muscle}`).toBeGreaterThan(0);
      }
    }
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
    expect(rows.rows).toHaveLength(Object.keys(manifest).length);
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
