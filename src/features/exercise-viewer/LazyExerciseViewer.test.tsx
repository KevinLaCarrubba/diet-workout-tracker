import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { ExerciseDemo } from './LazyExerciseViewer';
import { resetExerciseManifestCache, resetWebGLProbe } from './manifest';

// Never render WebGL in jsdom: the real viewer is replaced by a marker component.
const viewerRendered = vi.fn();
vi.mock('./ExerciseViewer', () => ({
  default: ({ exerciseName }: { exerciseName: string }) => {
    viewerRendered(exerciseName);
    return <div>viewer for {exerciseName}</div>;
  },
}));

const manifest = {
  'Back Squat': {
    file: 'back-squat.glb',
    primaryMuscles: ['quads', 'glutes'],
    meshesByMuscle: { quads: ['quads_l', 'quads_r'] },
  },
};

const squat = {
  id: '00000000-0000-0000-0000-000000000001',
  name: 'Back Squat',
  primary_muscles: ['quads', 'glutes'],
  secondary_muscles: ['hamstrings'],
  instructions: 'Brace, sit down between the hips, drive up.',
};

function mockWebGL(available: boolean) {
  return vi
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockImplementation((() => (available ? { getExtension: () => null } : null)) as never);
}

describe('ExerciseDemo / LazyExerciseViewer', () => {
  beforeEach(() => {
    resetExerciseManifestCache();
    resetWebGLProbe();
    viewerRendered.mockClear();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify(manifest), { status: 200 }))),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    Reflect.deleteProperty(navigator, 'connection');
  });

  it('loads nothing 3D until the user asks for the demo', async () => {
    const getContext = mockWebGL(true);
    renderWithProviders(<ExerciseDemo exercise={squat} />);
    expect(await screen.findByRole('button', { name: 'Show 3D demo' })).toBeEnabled();
    expect(getContext).not.toHaveBeenCalled();
    expect(viewerRendered).not.toHaveBeenCalled();
  });

  it('shows the static fallback when WebGL is unavailable', async () => {
    mockWebGL(false);
    renderWithProviders(<ExerciseDemo exercise={squat} />);
    const button = await screen.findByRole('button', { name: 'Show 3D demo' });
    await vi.waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);

    expect(await screen.findByText(/does not support WebGL/)).toBeInTheDocument();
    expect(screen.getByText(squat.instructions)).toBeInTheDocument();
    expect(screen.getByText('quads')).toBeInTheDocument();
    expect(screen.getByText('hamstrings')).toBeInTheDocument();
    expect(viewerRendered).not.toHaveBeenCalled();
  });

  it('mounts the lazy viewer when WebGL is available', async () => {
    mockWebGL(true);
    renderWithProviders(<ExerciseDemo exercise={squat} />);
    const button = await screen.findByRole('button', { name: 'Show 3D demo' });
    await vi.waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);

    expect(await screen.findByText('viewer for Back Squat')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Hide' }));
    expect(screen.queryByText('viewer for Back Squat')).not.toBeInTheDocument();
  });

  it('falls back when the exercise has no asset', async () => {
    renderWithProviders(
      <ExerciseDemo
        exercise={{ id: 'x', name: 'Cable Fly', primary_muscles: ['chest'], instructions: null }}
      />,
    );
    expect(await screen.findByText('3D demo unavailable for this exercise yet.')).toBeInTheDocument();
    expect(screen.getByText('No instructions for this exercise yet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show 3D demo' })).not.toBeInTheDocument();
  });

  it('respects Data Saver without fetching anything', async () => {
    Object.defineProperty(navigator, 'connection', { value: { saveData: true }, configurable: true });
    renderWithProviders(<ExerciseDemo exercise={squat} />);
    expect(await screen.findByText(/Data Saver/)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('offers a retry when the manifest cannot be loaded', async () => {
    vi.mocked(fetch)
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockImplementationOnce(() => Promise.resolve(new Response(JSON.stringify(manifest), { status: 200 })));
    renderWithProviders(<ExerciseDemo exercise={squat} />);
    expect(await screen.findByText(/couldn't be loaded/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: 'Show 3D demo' })).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
