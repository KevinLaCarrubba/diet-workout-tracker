// The WebGL exercise demo. Only ever loaded through LazyExerciseViewer: this
// module (with three.js, R3F and Drei) is split into the `exercise-viewer`
// chunk, which the service worker does not precache.

import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  Loader,
  SegmentedControl,
  Stack,
  Text,
  useMantineTheme,
} from '@mantine/core';
import { useDocumentVisibility, useInViewport } from '@mantine/hooks';
import { ContactShadows, OrbitControls, useAnimations, useGLTF } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { IconHighlight, IconPlayerPauseFilled, IconPlayerPlayFilled } from '@tabler/icons-react';
import { Component, Suspense, use, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import {
  loadExerciseManifest,
  modelUrl,
  prefersReducedMotion,
  resolveExerciseAsset,
  resolveHighlight,
  type CameraView,
  type Vec3,
} from './manifest';

export interface ExerciseViewerProps {
  exerciseId: string;
  exerciseName: string;
  primaryMuscles?: string[];
}

const SPEEDS = ['0.5', '1', '1.5'] as const;
type Speed = (typeof SPEEDS)[number];

const DEFAULT_TARGET: Vec3 = [0, 0.9, 0];
const DEFAULT_DISTANCE = 3.4;

class MissingExerciseAssetError extends Error {
  constructor(exerciseName: string) {
    super(`No 3D demo asset for "${exerciseName}"`);
    this.name = 'MissingExerciseAssetError';
  }
}

const VIEW_ANGLE: Record<CameraView, number> = { front: 0, side: 90 };

/**
 * Camera position orbiting the target: 0° looks at the mannequin's front,
 * 90° at its left side. Named views sit level; the opening shot is a raised
 * three-quarter angle leaning toward the asset's preferred view.
 */
function viewPosition(angleDeg: number, target: Vec3, distance: number, lift = 0.35): THREE.Vector3 {
  const [x, y, z] = target;
  const a = THREE.MathUtils.degToRad(angleDeg);
  return new THREE.Vector3(x + Math.sin(a) * distance, y + lift, z + Math.cos(a) * distance);
}

export function ExerciseViewer({ exerciseId, exerciseName, primaryMuscles }: ExerciseViewerProps) {
  const theme = useMantineTheme();
  const manifest = use(loadExerciseManifest());
  const entry = resolveExerciseAsset(manifest, exerciseName);
  if (!entry) throw new MissingExerciseAssetError(exerciseName);

  const [playing, setPlaying] = useState(() => !prefersReducedMotion());
  const [speed, setSpeed] = useState<Speed>('1');
  const [highlight, setHighlight] = useState(false);
  const [viewRequest, setViewRequest] = useState<{ view: CameraView; n: number } | null>(null);
  const [ready, setReady] = useState(false);

  const { ref: viewportRef, inViewport } = useInViewport();
  const documentVisibility = useDocumentVisibility();
  const running = playing && inViewport && documentVisibility === 'visible';

  const target = entry.camera?.target ?? DEFAULT_TARGET;
  const distance = entry.camera?.distance ?? DEFAULT_DISTANCE;
  const preferredView = entry.camera?.view ?? 'front';
  const initialCamera = useMemo(
    () => viewPosition(preferredView === 'side' ? 60 : 30, target, distance, 0.55),
    [preferredView, target, distance],
  );
  const { muscles, meshes: highlightNames } = useMemo(
    () => resolveHighlight(entry, primaryMuscles),
    [entry, primaryMuscles],
  );

  const requestView = (view: CameraView) => setViewRequest((prev) => ({ view, n: (prev?.n ?? 0) + 1 }));

  return (
    <Stack gap="sm" data-exercise-id={exerciseId}>
      <Box
        ref={viewportRef}
        pos="relative"
        h={340}
        bg="dark.8"
        style={{ borderRadius: 'var(--mantine-radius-lg)', overflow: 'hidden', touchAction: 'none' }}
        role="img"
        aria-label={`Animated 3D demonstration of ${exerciseName}. Drag to rotate, pinch or scroll to zoom.`}
      >
        <Canvas
          frameloop={running ? 'always' : 'demand'}
          dpr={[1, 1.5]}
          camera={{ fov: 35, near: 0.1, far: 50, position: initialCamera.toArray() }}
          gl={{ antialias: true, powerPreference: 'low-power' }}
        >
          <color attach="background" args={[theme.colors.dark[8]]} />
          <hemisphereLight args={['#ffffff', '#1b1f25', 1.7]} />
          <directionalLight position={[2.5, 4, 3]} intensity={2.2} />
          <directionalLight position={[-3, 2, -2.5]} intensity={0.7} color={theme.colors.blue[4]} />
          <mesh rotation-x={-Math.PI / 2} position-y={-0.002}>
            <circleGeometry args={[2.4, 48]} />
            <meshStandardMaterial color={theme.colors.dark[6]} roughness={0.95} />
          </mesh>
          <ContactShadows
            position={[0, 0.001, 0]}
            scale={4}
            blur={2.4}
            far={1.6}
            opacity={0.65}
            resolution={256}
          />
          <ModelErrorBoundary url={modelUrl(entry)}>
            <Suspense fallback={null}>
              <Model
                url={modelUrl(entry)}
                playing={running}
                speed={Number(speed)}
                highlightNames={highlight ? highlightNames : []}
                highlightColor={theme.colors.lime[5]}
                onReady={() => setReady(true)}
              />
            </Suspense>
          </ModelErrorBoundary>
          <CameraRig target={target} distance={distance} request={viewRequest} />
          <OrbitControls
            makeDefault
            target={target}
            enablePan={false}
            enableDamping
            dampingFactor={0.12}
            minDistance={1.4}
            maxDistance={7}
            maxPolarAngle={Math.PI * 0.56}
          />
        </Canvas>
        {!ready && (
          <Group pos="absolute" inset={0} justify="center" style={{ pointerEvents: 'none' }}>
            <Loader size="sm" aria-label="Loading 3D demo" />
          </Group>
        )}
      </Box>

      <Group gap="sm" wrap="nowrap">
        <ActionIcon
          size="xl"
          variant="filled"
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? 'Pause demo' : 'Play demo'}
        >
          {playing ? <IconPlayerPauseFilled size={22} /> : <IconPlayerPlayFilled size={22} />}
        </ActionIcon>
        <SegmentedControl
          flex={1}
          size="md"
          value={speed}
          onChange={(value) => setSpeed(value as Speed)}
          aria-label="Playback speed"
          data={SPEEDS.map((s) => ({ value: s, label: `${s}×` }))}
        />
      </Group>

      <Group gap="sm" grow>
        <Button variant="default" size="md" onClick={() => requestView('front')}>
          Front
        </Button>
        <Button variant="default" size="md" onClick={() => requestView('side')}>
          Side
        </Button>
      </Group>
      <Button
        size="md"
        fullWidth
        variant={highlight ? 'filled' : 'default'}
        leftSection={<IconHighlight size={18} />}
        onClick={() => setHighlight((h) => !h)}
        aria-pressed={highlight}
        disabled={highlightNames.length === 0}
      >
        Highlight muscles
      </Button>

      {highlight && muscles.length > 0 && (
        <Group gap={6}>
          <Text size="sm" c="dimmed">
            Highlighted:
          </Text>
          {muscles.map((m) => (
            <Badge key={m} variant="light" tt="capitalize">
              {m}
            </Badge>
          ))}
        </Group>
      )}
    </Stack>
  );
}

export default ExerciseViewer;

function Model({
  url,
  playing,
  speed,
  highlightNames,
  highlightColor,
  onReady,
}: {
  url: string;
  playing: boolean;
  speed: number;
  highlightNames: string[];
  highlightColor: string;
  onReady: () => void;
}) {
  const { scene, animations } = useGLTF(url, false, false);
  // Clone so two viewers of the same asset never share (or fight over) one scene graph.
  const model = useMemo(() => scene.clone(true), [scene]);
  const { actions } = useAnimations(animations, model);
  const invalidate = useThree((s) => s.invalidate);

  const action = actions.demo ?? Object.values(actions)[0] ?? null;

  useEffect(() => {
    if (!action) return;
    action.reset().play();
    onReady();
    return () => {
      action.stop();
    };
    // onReady is a fresh closure each render; only (re)start when the action changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action]);

  useEffect(() => {
    if (!action) return;
    setActionPlayback(action, playing, speed);
    invalidate();
  }, [action, playing, speed, invalidate]);

  const highlightMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        name: 'highlight',
        color: highlightColor,
        emissive: highlightColor,
        emissiveIntensity: 0.35,
        roughness: 0.45,
      }),
    [highlightColor],
  );
  useEffect(() => () => highlightMaterial.dispose(), [highlightMaterial]);

  const highlightKey = highlightNames.join('|');
  useEffect(() => {
    const restore = tintMeshes(
      model,
      new Set(highlightKey ? highlightKey.split('|') : []),
      highlightMaterial,
    );
    invalidate();
    return restore;
  }, [model, highlightKey, highlightMaterial, invalidate]);

  return <primitive object={model} />;
}

/**
 * Forgets a failed GLB load (the loader cache keeps errors) so "Try again"
 * really refetches, then rethrows to the boundary in LazyExerciseViewer.
 */
class ModelErrorBoundary extends Component<{ url: string; children: ReactNode }, { error: unknown }> {
  state: { error: unknown } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  componentDidCatch() {
    useGLTF.clear(this.props.url);
  }

  render() {
    if (this.state.error) throw this.state.error;
    return this.props.children;
  }
}

function setActionPlayback(action: THREE.AnimationAction, playing: boolean, speed: number) {
  action.paused = !playing;
  action.timeScale = speed;
}

/** Swaps in the highlight material for the named meshes; returns an undo function. */
function tintMeshes(root: THREE.Object3D, names: Set<string>, material: THREE.Material): () => void {
  const originals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  if (names.size > 0) {
    root.traverse((object) => {
      if (object instanceof THREE.Mesh && names.has(object.name)) {
        originals.set(object, object.material);
        object.material = material;
      }
    });
  }
  return () => {
    originals.forEach((original, mesh) => {
      mesh.material = original;
    });
  };
}

/** Smoothly moves the camera (and orbit target) to the requested view. */
function CameraRig({
  target,
  distance,
  request,
}: {
  target: Vec3;
  distance: number;
  request: { view: CameraView; n: number } | null;
}) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as {
    target: THREE.Vector3;
    update: () => void;
  } | null;
  const invalidate = useThree((s) => s.invalidate);
  const goal = useRef<{ position: THREE.Vector3; target: THREE.Vector3 } | null>(null);
  const [tx, ty, tz] = target;

  useEffect(() => {
    if (!request) return;
    const next = {
      position: viewPosition(VIEW_ANGLE[request.view], [tx, ty, tz], distance),
      target: new THREE.Vector3(tx, ty, tz),
    };
    if (prefersReducedMotion()) {
      moveCamera(camera, controls, next, 1);
      goal.current = null;
    } else {
      goal.current = next;
    }
    invalidate();
  }, [request, tx, ty, tz, distance, camera, controls, invalidate]);

  useFrame((_, delta) => {
    const next = goal.current;
    if (!next) return;
    const done = moveCamera(camera, controls, next, 1 - Math.exp(-Math.min(delta, 0.1) * 7));
    if (done) goal.current = null;
    else invalidate();
  });

  return null;
}

function moveCamera(
  camera: THREE.Camera,
  controls: { target: THREE.Vector3; update: () => void } | null,
  goal: { position: THREE.Vector3; target: THREE.Vector3 },
  alpha: number,
): boolean {
  camera.position.lerp(goal.position, alpha);
  if (controls) {
    controls.target.lerp(goal.target, alpha);
    controls.update();
  } else {
    camera.lookAt(goal.target);
  }
  return camera.position.distanceTo(goal.position) < 0.005;
}
