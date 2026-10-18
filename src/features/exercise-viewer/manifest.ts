// Pure helpers for the 3D exercise demos: manifest lookup and the decision of
// whether to mount the WebGL viewer or show the static fallback. Kept free of
// three.js so the main bundle can import it without pulling in the 3D chunk.

export type Vec3 = [number, number, number];
export type CameraView = 'front' | 'side';

export interface ExerciseAssetEntry {
  file: string;
  primaryMuscles: string[];
  secondaryMuscles?: string[];
  /** Mesh names in the GLB that represent each muscle group. */
  meshesByMuscle: Record<string, string[]>;
  durationSeconds?: number;
  camera?: { target: Vec3; distance: number; view?: CameraView };
  /** Other names for the same movement (e.g. a coach's wording) that should show this demo. */
  aliases?: string[];
}

/** Keyed by the exact shared-catalog exercise name. */
export type ExerciseManifest = Record<string, ExerciseAssetEntry>;

const MODELS_BASE = `${import.meta.env.BASE_URL}models/exercises/`;
export const MANIFEST_URL = `${MODELS_BASE}manifest.json`;

export function modelUrl(entry: Pick<ExerciseAssetEntry, 'file'>): string {
  return `${MODELS_BASE}${entry.file}`;
}

let manifestPromise: Promise<ExerciseManifest> | null = null;

/**
 * Fetches the manifest once per page load. The same promise is returned to
 * every caller (safe for React's `use()`); a failed fetch is forgotten so a
 * retry can try again.
 */
export function loadExerciseManifest(fetcher: typeof fetch = fetch): Promise<ExerciseManifest> {
  if (!manifestPromise) {
    manifestPromise = fetcher(MANIFEST_URL)
      .then(async (response) => {
        if (!response.ok) throw new Error(`Exercise demo manifest: HTTP ${response.status}`);
        return parseManifest(await response.json());
      })
      .catch((error: unknown) => {
        manifestPromise = null;
        throw error;
      });
  }
  return manifestPromise;
}

export function resetExerciseManifestCache(): void {
  manifestPromise = null;
}

/** Drops malformed entries instead of failing the whole manifest. */
export function parseManifest(raw: unknown): ExerciseManifest {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new Error('Invalid exercise demo manifest');
  const out: ExerciseManifest = {};
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    const entry = value as Partial<ExerciseAssetEntry>;
    if (typeof entry.file !== 'string' || !/^[\w-]+\.glb$/.test(entry.file)) continue;
    out[name] = {
      ...entry,
      file: entry.file,
      primaryMuscles: Array.isArray(entry.primaryMuscles) ? entry.primaryMuscles : [],
      ...(Array.isArray(entry.aliases)
        ? { aliases: entry.aliases.filter((a) => typeof a === 'string') }
        : {}),
      meshesByMuscle:
        entry.meshesByMuscle && typeof entry.meshesByMuscle === 'object' ? entry.meshesByMuscle : {},
    };
  }
  return out;
}

/** "Push-Up", "push up" and " PUSH_UP " all compare equal. */
export function normalizeExerciseName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ');
}

export function resolveExerciseAsset(
  manifest: ExerciseManifest | null | undefined,
  exerciseName: string,
): ExerciseAssetEntry | null {
  if (!manifest) return null;
  const exact = manifest[exerciseName];
  if (exact) return exact;
  const wanted = normalizeExerciseName(exerciseName);
  if (!wanted) return null;
  for (const [name, entry] of Object.entries(manifest)) {
    if (normalizeExerciseName(name) === wanted) return entry;
  }
  for (const entry of Object.values(manifest)) {
    if (entry.aliases?.some((alias) => normalizeExerciseName(alias) === wanted)) return entry;
  }
  return null;
}

/**
 * Which muscles (and their mesh names) to tint. Uses the given muscles when the
 * asset has meshes for any of them, otherwise the asset's own primary muscles.
 */
export function resolveHighlight(
  entry: ExerciseAssetEntry,
  muscles?: readonly string[] | null,
): { muscles: string[]; meshes: string[] } {
  const byMuscle = new Map(Object.entries(entry.meshesByMuscle).map(([k, v]) => [k.trim().toLowerCase(), v]));
  const pick = (list: readonly string[]) => {
    const matched: string[] = [];
    const meshes = new Set<string>();
    for (const muscle of list) {
      const names = byMuscle.get(muscle.trim().toLowerCase()) ?? [];
      if (names.length === 0) continue;
      matched.push(muscle);
      for (const name of names) meshes.add(name);
    }
    return { muscles: matched, meshes: [...meshes] };
  };
  const requested = pick(muscles ?? []);
  return requested.meshes.length > 0 ? requested : pick(entry.primaryMuscles);
}

export type DemoUnavailableReason = 'save-data' | 'no-webgl' | 'load-error' | 'no-asset';

export type DemoDecision =
  { mode: 'pending' } | { mode: 'available' } | { mode: 'fallback'; reason: DemoUnavailableReason };

/**
 * Decides what the demo slot shows. `hasAsset` is undefined while the manifest
 * is loading; `webgl` is undefined until probed (we only probe after the user
 * asks for the demo, so nothing WebGL-related runs by default).
 */
export function decideDemoMode(input: {
  saveData: boolean;
  hasAsset: boolean | undefined;
  webgl?: boolean;
  loadFailed?: boolean;
}): DemoDecision {
  if (input.saveData) return { mode: 'fallback', reason: 'save-data' };
  if (input.webgl === false) return { mode: 'fallback', reason: 'no-webgl' };
  if (input.loadFailed) return { mode: 'fallback', reason: 'load-error' };
  if (input.hasAsset === undefined) return { mode: 'pending' };
  if (!input.hasAsset) return { mode: 'fallback', reason: 'no-asset' };
  return { mode: 'available' };
}

export function unavailableMessage(reason: DemoUnavailableReason): string {
  switch (reason) {
    case 'save-data':
      return '3D demo is off while Data Saver is on.';
    case 'no-webgl':
      return '3D demo unavailable: this device or browser does not support WebGL.';
    case 'load-error':
      return "3D demo unavailable: it couldn't be loaded. Check your connection and try again.";
    case 'no-asset':
      return '3D demo unavailable for this exercise yet.';
  }
}

let webglSupport: boolean | undefined;

/** Probes for WebGL once (creates and immediately releases a context). */
export function detectWebGL(doc: Document = document): boolean {
  if (webglSupport !== undefined) return webglSupport;
  try {
    const canvas = doc.createElement('canvas');
    const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGLRenderingContext | null;
    webglSupport = Boolean(gl);
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    webglSupport = false;
  }
  return webglSupport;
}

export function resetWebGLProbe(): void {
  webglSupport = undefined;
}

export function prefersSaveData(nav: Navigator | undefined = globalThis.navigator): boolean {
  const connection = (nav as (Navigator & { connection?: { saveData?: boolean } }) | undefined)?.connection;
  return connection?.saveData === true;
}

export function prefersReducedMotion(win: Window | undefined = globalThis.window): boolean {
  return win?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}
