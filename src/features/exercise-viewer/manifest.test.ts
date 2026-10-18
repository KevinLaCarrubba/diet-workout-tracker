import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  decideDemoMode,
  detectWebGL,
  loadExerciseManifest,
  modelUrl,
  parseManifest,
  prefersSaveData,
  resetExerciseManifestCache,
  resetWebGLProbe,
  resolveExerciseAsset,
  resolveHighlight,
  unavailableMessage,
  type ExerciseAssetEntry,
  type ExerciseManifest,
} from './manifest';

const squat: ExerciseAssetEntry = {
  file: 'back-squat.glb',
  primaryMuscles: ['quads', 'glutes'],
  secondaryMuscles: ['hamstrings'],
  meshesByMuscle: {
    quads: ['quads_l', 'quads_r'],
    glutes: ['glute_l', 'glute_r'],
    hamstrings: ['hamstrings_l', 'hamstrings_r'],
  },
};
const manifest: ExerciseManifest = {
  'Back Squat': squat,
  'Push-Up': { file: 'push-up.glb', primaryMuscles: ['chest'], meshesByMuscle: { chest: ['chest_l'] } },
};

describe('resolveExerciseAsset', () => {
  it('matches the exact catalog name first', () => {
    expect(resolveExerciseAsset(manifest, 'Back Squat')).toBe(squat);
  });

  it('falls back to a case/spacing/hyphen-insensitive match', () => {
    expect(resolveExerciseAsset(manifest, '  back squat ')).toBe(squat);
    expect(resolveExerciseAsset(manifest, 'push up')?.file).toBe('push-up.glb');
    expect(resolveExerciseAsset(manifest, 'PUSH_UP')?.file).toBe('push-up.glb');
  });

  it('returns null for unknown exercises or a missing manifest', () => {
    expect(resolveExerciseAsset(manifest, 'Cable Fly')).toBeNull();
    expect(resolveExerciseAsset(manifest, '')).toBeNull();
    expect(resolveExerciseAsset(null, 'Back Squat')).toBeNull();
  });
});

describe('parseManifest', () => {
  it('keeps valid entries and drops malformed ones', () => {
    const parsed = parseManifest({
      Good: { file: 'good.glb', primaryMuscles: ['chest'], meshesByMuscle: { chest: ['chest_l'] } },
      NoFile: { primaryMuscles: [] },
      PathTraversal: { file: '../secret.glb' },
      Defaults: { file: 'defaults.glb' },
      Junk: 42,
    });
    expect(Object.keys(parsed)).toEqual(['Good', 'Defaults']);
    expect(parsed.Defaults).toMatchObject({ primaryMuscles: [], meshesByMuscle: {} });
  });

  it('rejects a non-object manifest', () => {
    expect(() => parseManifest([])).toThrow();
    expect(() => parseManifest(null)).toThrow();
  });
});

describe('resolveHighlight', () => {
  it('maps the given muscles to mesh names, case-insensitively', () => {
    expect(resolveHighlight(squat, ['Quads'])).toEqual({
      muscles: ['Quads'],
      meshes: ['quads_l', 'quads_r'],
    });
  });

  it("uses the asset's primary muscles when none are given or none have meshes", () => {
    const primary = { muscles: ['quads', 'glutes'], meshes: ['quads_l', 'quads_r', 'glute_l', 'glute_r'] };
    expect(resolveHighlight(squat)).toEqual(primary);
    expect(resolveHighlight(squat, [])).toEqual(primary);
    expect(resolveHighlight(squat, ['chest'])).toEqual(primary);
  });

  it('skips muscles without meshes and de-duplicates shared meshes', () => {
    const entry: ExerciseAssetEntry = {
      file: 'row.glb',
      primaryMuscles: ['back'],
      meshesByMuscle: { shoulders: ['delt_l', 'delt_r'], 'rear delts': ['delt_l', 'delt_r'] },
    };
    expect(resolveHighlight(entry, ['shoulders', 'rear delts', 'calves'])).toEqual({
      muscles: ['shoulders', 'rear delts'],
      meshes: ['delt_l', 'delt_r'],
    });
    expect(resolveHighlight(entry)).toEqual({ muscles: [], meshes: [] });
  });
});

describe('decideDemoMode', () => {
  it('waits for the manifest', () => {
    expect(decideDemoMode({ saveData: false, hasAsset: undefined })).toEqual({ mode: 'pending' });
  });

  it('offers the demo when an asset exists', () => {
    expect(decideDemoMode({ saveData: false, hasAsset: true })).toEqual({ mode: 'available' });
    expect(decideDemoMode({ saveData: false, hasAsset: true, webgl: true })).toEqual({ mode: 'available' });
  });

  it('falls back in priority order: save-data, no WebGL, load error, no asset', () => {
    expect(decideDemoMode({ saveData: true, hasAsset: true, webgl: false, loadFailed: true })).toEqual({
      mode: 'fallback',
      reason: 'save-data',
    });
    expect(decideDemoMode({ saveData: false, hasAsset: true, webgl: false, loadFailed: true })).toEqual({
      mode: 'fallback',
      reason: 'no-webgl',
    });
    expect(decideDemoMode({ saveData: false, hasAsset: undefined, loadFailed: true })).toEqual({
      mode: 'fallback',
      reason: 'load-error',
    });
    expect(decideDemoMode({ saveData: false, hasAsset: false })).toEqual({
      mode: 'fallback',
      reason: 'no-asset',
    });
  });

  it('has a message for every reason', () => {
    for (const reason of ['save-data', 'no-webgl', 'load-error', 'no-asset'] as const) {
      expect(unavailableMessage(reason)).toMatch(/3D demo/);
    }
  });
});

describe('loadExerciseManifest', () => {
  beforeEach(() => resetExerciseManifestCache());

  const ok = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));

  it('fetches once and shares the promise', async () => {
    const fetcher = vi.fn(() => ok(manifest));
    const a = loadExerciseManifest(fetcher);
    const b = loadExerciseManifest(fetcher);
    expect(a).toBe(b);
    expect(await a).toEqual(manifest);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith('/models/exercises/manifest.json');
  });

  it('forgets a failed fetch so a retry refetches', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('nope', { status: 503 }))
      .mockImplementationOnce(() => ok(manifest));
    await expect(loadExerciseManifest(fetcher)).rejects.toThrow('HTTP 503');
    await expect(loadExerciseManifest(fetcher)).resolves.toEqual(manifest);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('builds model URLs under /models/exercises', () => {
    expect(modelUrl(squat)).toBe('/models/exercises/back-squat.glb');
  });
});

describe('capability probes', () => {
  afterEach(() => resetWebGLProbe());

  const fakeDocument = (context: unknown) =>
    ({ createElement: () => ({ getContext: vi.fn(() => context) }) }) as unknown as Document;

  it('detects WebGL from a canvas context and caches the answer', () => {
    const loseContext = vi.fn();
    expect(detectWebGL(fakeDocument({ getExtension: () => ({ loseContext }) }))).toBe(true);
    expect(loseContext).toHaveBeenCalled();
    expect(detectWebGL(fakeDocument(null))).toBe(true); // cached
  });

  it('reports no WebGL when no context is available or the probe throws', () => {
    expect(detectWebGL(fakeDocument(null))).toBe(false);
    resetWebGLProbe();
    const throwing = {
      createElement: () => {
        throw new Error('blocked');
      },
    } as unknown as Document;
    expect(detectWebGL(throwing)).toBe(false);
  });

  it('reads the Save-Data preference', () => {
    expect(prefersSaveData({ connection: { saveData: true } } as unknown as Navigator)).toBe(true);
    expect(prefersSaveData({ connection: { saveData: false } } as unknown as Navigator)).toBe(false);
    expect(prefersSaveData({} as Navigator)).toBe(false);
  });
});
