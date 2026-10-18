// Light entry point for 3D exercise demos. Nothing 3D is fetched until the
// user taps "Show 3D demo"; the viewer chunk (three.js + R3F) and the GLB are
// then loaded on demand. Every failure path ends in a static text fallback.

import { Badge, Button, Card, Group, Skeleton, Stack, Text } from '@mantine/core';
import { IconCube, IconInfoCircle, IconRefresh, IconX } from '@tabler/icons-react';
import { Component, Suspense, lazy, useEffect, useState, type ReactNode } from 'react';
import { SectionCard } from '@/components/SectionCard';
import {
  decideDemoMode,
  detectWebGL,
  loadExerciseManifest,
  prefersSaveData,
  resetExerciseManifestCache,
  resolveExerciseAsset,
  unavailableMessage,
  type DemoUnavailableReason,
  type ExerciseManifest,
} from './manifest';

const importViewer = () => import('./ExerciseViewer');

export interface LazyExerciseViewerProps {
  exerciseId: string;
  exerciseName: string;
  primaryMuscles?: string[];
  secondaryMuscles?: string[];
  instructions?: string | null;
}

type ManifestState =
  { status: 'loading' } | { status: 'ready'; manifest: ExerciseManifest } | { status: 'error' };

function useExerciseManifest(enabled: boolean): [ManifestState, () => void] {
  const [state, setState] = useState<ManifestState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    loadExerciseManifest().then(
      (manifest) => !cancelled && setState({ status: 'ready', manifest }),
      () => !cancelled && setState({ status: 'error' }),
    );
    return () => {
      cancelled = true;
    };
  }, [enabled, attempt]);
  const retry = () => {
    resetExerciseManifestCache();
    setState({ status: 'loading' });
    setAttempt((n) => n + 1);
  };
  return [state, retry];
}

export function LazyExerciseViewer({
  exerciseId,
  exerciseName,
  primaryMuscles = [],
  secondaryMuscles = [],
  instructions,
}: LazyExerciseViewerProps) {
  const [saveData] = useState(prefersSaveData);
  const [manifestState, retryManifest] = useExerciseManifest(!saveData);
  const [requested, setRequested] = useState(false);
  const [webgl, setWebgl] = useState<boolean | undefined>(undefined);
  const [loadFailed, setLoadFailed] = useState(false);
  // A fresh lazy component per attempt: React.lazy caches a failed import forever.
  const [Viewer, setViewer] = useState(() => lazy(importViewer));

  const hasAsset =
    manifestState.status === 'ready'
      ? resolveExerciseAsset(manifestState.manifest, exerciseName) !== null
      : undefined;
  const decision = decideDemoMode({
    saveData,
    hasAsset,
    webgl,
    loadFailed: loadFailed || manifestState.status === 'error',
  });

  const retry = () => {
    if (manifestState.status === 'error') retryManifest();
    setViewer(() => lazy(importViewer));
    setLoadFailed(false);
  };

  const show = () => {
    const supported = detectWebGL();
    setWebgl(supported);
    if (supported) setRequested(true);
  };

  const fallback = (reason: DemoUnavailableReason) => (
    <ExerciseStaticFallback
      exerciseName={exerciseName}
      primaryMuscles={primaryMuscles}
      secondaryMuscles={secondaryMuscles}
      instructions={instructions}
      reason={reason}
      onRetry={reason === 'load-error' ? retry : undefined}
    />
  );

  if (decision.mode === 'fallback') return fallback(decision.reason);

  if (decision.mode === 'available' && requested) {
    return (
      <SectionCard
        title="3D demo"
        description="Original animation · drag to rotate"
        action={
          <Button
            variant="subtle"
            color="gray"
            size="sm"
            leftSection={<IconX size={16} />}
            onClick={() => setRequested(false)}
          >
            Hide
          </Button>
        }
      >
        <ViewerErrorBoundary onError={() => setLoadFailed(true)}>
          <Suspense fallback={<ViewerSkeleton />}>
            <Viewer exerciseId={exerciseId} exerciseName={exerciseName} primaryMuscles={primaryMuscles} />
          </Suspense>
        </ViewerErrorBoundary>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="3D demo" description="See the movement from any angle.">
      <Button
        size="md"
        variant="light"
        leftSection={<IconCube size={20} />}
        onClick={show}
        loading={decision.mode === 'pending'}
        fullWidth
      >
        Show 3D demo
      </Button>
    </SectionCard>
  );
}

/** Integration point for the exercise detail page. */
export function ExerciseDemo({
  exercise,
}: {
  exercise: {
    id: string;
    name: string;
    primary_muscles?: string[] | null;
    secondary_muscles?: string[] | null;
    instructions?: string | null;
  };
}) {
  return (
    <LazyExerciseViewer
      key={exercise.id}
      exerciseId={exercise.id}
      exerciseName={exercise.name}
      primaryMuscles={exercise.primary_muscles ?? []}
      secondaryMuscles={exercise.secondary_muscles ?? []}
      instructions={exercise.instructions}
    />
  );
}

function ExerciseStaticFallback({
  exerciseName,
  primaryMuscles,
  secondaryMuscles,
  instructions,
  reason,
  onRetry,
}: {
  exerciseName: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions?: string | null;
  reason: DemoUnavailableReason;
  onRetry?: () => void;
}) {
  return (
    <SectionCard title="How to do it" description={exerciseName}>
      {(primaryMuscles.length > 0 || secondaryMuscles.length > 0) && (
        <Group gap={6}>
          {primaryMuscles.map((m) => (
            <Badge key={`p-${m}`} variant="filled" tt="capitalize">
              {m}
            </Badge>
          ))}
          {secondaryMuscles.map((m) => (
            <Badge key={`s-${m}`} variant="light" color="gray" tt="capitalize">
              {m}
            </Badge>
          ))}
        </Group>
      )}
      <Text size="sm" style={{ whiteSpace: 'pre-line' }}>
        {instructions?.trim() || 'No instructions for this exercise yet.'}
      </Text>
      <Card withBorder={false} bg="dark.7" p="sm" radius="md">
        <Group gap="xs" wrap="nowrap" align="flex-start">
          <IconInfoCircle size={18} style={{ flexShrink: 0, marginTop: 2 }} aria-hidden />
          <Stack gap="xs" style={{ flex: 1 }}>
            <Text size="sm" c="dimmed">
              {unavailableMessage(reason)}
            </Text>
            {onRetry && (
              <Button
                size="sm"
                variant="default"
                leftSection={<IconRefresh size={16} />}
                onClick={onRetry}
                w="fit-content"
              >
                Try again
              </Button>
            )}
          </Stack>
        </Group>
      </Card>
    </SectionCard>
  );
}

function ViewerSkeleton() {
  return (
    <Stack gap="sm" aria-busy="true" aria-label="Loading 3D demo">
      <Skeleton h={340} radius="lg" />
      <Group gap="sm" wrap="nowrap">
        <Skeleton h={44} w={44} radius="md" />
        <Skeleton h={44} radius="md" style={{ flex: 1 }} />
      </Group>
      <Skeleton h={42} radius="md" />
    </Stack>
  );
}

class ViewerErrorBoundary extends Component<
  { children: ReactNode; onError: () => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.warn('3D exercise demo failed to load', error);
    this.props.onError();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
