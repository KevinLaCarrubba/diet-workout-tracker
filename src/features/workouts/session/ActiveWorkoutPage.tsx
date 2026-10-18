import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Center,
  Group,
  Loader,
  Menu,
  Modal,
  NumberInput,
  Stack,
  Text,
  Textarea,
  Title,
  UnstyledButton,
} from '@mantine/core';
import {
  IconCube,
  IconArrowDown,
  IconArrowLeft,
  IconArrowRight,
  IconArrowUp,
  IconDots,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlus,
  IconReplace,
  IconTrash,
} from '@tabler/icons-react';
import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { StatusIndicator } from '@/components/StatusIndicator';
import { ExerciseDemo } from '@/features/exercise-viewer/LazyExerciseViewer';
import { useHasDemo } from '@/features/exercise-viewer/useHasDemo';
import { usePreferences, useSettings } from '@/features/profile/api';
import { unlockAudio } from '@/lib/feedback';
import { formatDuration } from '@/lib/time';
import { unitLabels } from '@/lib/units';
import type { DraftExercise, DraftSession, PreviousSet } from '@/offline/types';
import {
  fetchPreviousPerformance,
  rememberPerformance,
  toExerciseInfo,
  useExercises,
  usePreviousPerformance,
  type Exercise,
} from '../api';
import { ExercisePickerModal } from '../components/ExercisePickerModal';
import classes from './ActiveWorkout.module.css';
import {
  addExercise,
  addSet,
  discardSession,
  elapsedSeconds,
  extendRest,
  finishSession,
  goToExercise,
  moveExercise,
  pauseRest,
  pauseSession,
  previousFor,
  removeExercise,
  removeSet,
  resumeRest,
  resumeSession,
  sessionStats,
  setCompleted,
  skipRest,
  startRest,
  substituteExercise,
  targetLabel,
  updateSet,
} from './draft';
import { useDraft, useNow, useWakeLock } from './hooks';
import { RestTimerBar } from './RestTimerBar';
import { mutateDraft, patchLocal } from './sessionStore';
import { SetRow } from './SetRow';

const DEFAULT_REST = 90;

const exerciseDone = (e: DraftExercise) => e.sets.length > 0 && e.sets.every((s) => s.completed_at);

export function ActiveWorkoutPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { data: draft, loading } = useDraft(sessionId);
  const { units } = usePreferences();
  const { data: settings } = useSettings();
  const running = draft?.status === 'in_progress' && !draft.paused_at;
  const now = useNow(1000, running);
  useWakeLock(draft?.status === 'in_progress');
  const previous = usePreviousPerformance(
    (draft?.exercises ?? []).map((e) => e.exercise_id).filter((id): id is string => !!id),
  );

  const [picker, setPicker] = useState<null | { mode: 'add' } | { mode: 'substitute'; exerciseId: string }>(
    null,
  );
  const [details, setDetails] = useState<null | { exerciseId: string; setId: string }>(null);
  const [finishing, setFinishing] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const catalog = useExercises();
  const currentForDemo = draft?.exercises[draft.current_exercise_index];
  const hasDemo = useHasDemo(currentForDemo?.exercise_name_snapshot);

  if (loading) {
    return (
      <Center h="100dvh">
        <Loader />
      </Center>
    );
  }
  if (!draft) {
    return (
      <Center h="100dvh" p="md">
        <Stack align="center">
          <Title order={3}>Workout not found on this device</Title>
          <Text c="dimmed" ta="center">
            It may have been finished already or started on another device.
          </Text>
          <Button component={Link} to="/workouts/history">
            View history
          </Button>
        </Stack>
      </Center>
    );
  }
  if (draft.status === 'completed') return <Navigate to={`/workouts/session/${draft.id}/summary`} replace />;
  if (draft.status === 'discarded') return <Navigate to="/workouts" replace />;

  const mutate = (fn: (d: DraftSession) => DraftSession) => void mutateDraft(draft.id, fn);
  // Rest-timer controls are device-only state: no upload needed.
  const local = (fn: (d: DraftSession) => DraftSession) => void patchLocal(draft.id, fn);
  const current = draft.exercises[draft.current_exercise_index];
  const labels = unitLabels(units);
  const elapsed = elapsedSeconds(draft, now);
  const stats = sessionStats(draft);
  const incomplete = draft.exercises.reduce((n, e) => n + e.sets.filter((s) => !s.completed_at).length, 0);

  const pickExercise = async (exercise: Exercise) => {
    const target = picker;
    setPicker(null);
    const prev = (
      await fetchPreviousPerformance([exercise.id]).catch((): Record<string, PreviousSet[]> => ({}))
    )[exercise.id];
    if (target?.mode === 'substitute') {
      mutate((d) => substituteExercise(d, target.exerciseId, toExerciseInfo(exercise), prev));
    } else {
      mutate((d) =>
        addExercise(
          d,
          {
            exercise: toExerciseInfo(exercise),
            target_sets: 3,
            rep_min: 8,
            rep_max: 12,
            rest_seconds: current?.rest_seconds ?? DEFAULT_REST,
          },
          prev,
        ),
      );
    }
  };

  const finish = async () => {
    const finished = await mutateDraft(draft.id, (d) => finishSession(d));
    if (finished) await rememberPerformance(finished.exercises);
    navigate(`/workouts/session/${draft.id}/summary`, { replace: true });
  };

  const detailSet = details
    ? draft.exercises.find((e) => e.id === details.exerciseId)?.sets.find((s) => s.id === details.setId)
    : undefined;

  return (
    <div className={classes.page}>
      <header className={classes.header}>
        <Group justify="space-between" wrap="nowrap" gap="xs">
          <Group gap={4} wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
            <ActionIcon component={Link} to="/workouts" aria-label="Back to workouts (workout keeps running)">
              <IconArrowLeft size={22} />
            </ActionIcon>
            <Text fw={700} truncate>
              {draft.title}
            </Text>
          </Group>
          <Group gap={4} wrap="nowrap">
            <StatusIndicator compact />
            <Menu position="bottom-end">
              <Menu.Target>
                <ActionIcon size={44} aria-label="Workout options">
                  <IconDots size={20} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item leftSection={<IconPlus size={16} />} onClick={() => setPicker({ mode: 'add' })}>
                  Add exercise
                </Menu.Item>
                <Menu.Item
                  color="red"
                  leftSection={<IconTrash size={16} />}
                  onClick={() => setDiscarding(true)}
                >
                  Discard workout
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>
        <Group justify="space-between" wrap="nowrap" mt={6}>
          <Group gap={8} wrap="nowrap">
            <Text
              className={classes.timer}
              c={draft.paused_at ? 'dimmed' : undefined}
              aria-label="Elapsed time"
            >
              {formatDuration(elapsed)}
            </Text>
            {draft.paused_at && (
              <Badge color="yellow" variant="light">
                Paused
              </Badge>
            )}
          </Group>
          <Group gap={8} wrap="nowrap">
            <ActionIcon
              size={44}
              variant="default"
              aria-label={draft.paused_at ? 'Resume workout' : 'Pause workout'}
              onClick={() => mutate((d) => (d.paused_at ? resumeSession(d) : pauseSession(d)))}
            >
              {draft.paused_at ? <IconPlayerPlay size={20} /> : <IconPlayerPause size={20} />}
            </ActionIcon>
            <Button size="md" onClick={() => setFinishing(true)}>
              Finish
            </Button>
          </Group>
        </Group>
      </header>

      <nav className={classes.chips} aria-label="Exercises">
        {draft.exercises.map((e, i) => {
          const done = e.sets.filter((s) => s.completed_at).length;
          return (
            <UnstyledButton
              key={e.id}
              className={classes.chip}
              data-active={i === draft.current_exercise_index || undefined}
              data-done={exerciseDone(e) || undefined}
              aria-current={i === draft.current_exercise_index ? 'step' : undefined}
              onClick={() => mutate((d) => goToExercise(d, i))}
            >
              {e.exercise_name_snapshot} · {done}/{e.sets.length}
            </UnstyledButton>
          );
        })}
        <UnstyledButton
          className={classes.chip}
          onClick={() => setPicker({ mode: 'add' })}
          aria-label="Add exercise"
        >
          <IconPlus size={16} style={{ verticalAlign: 'middle' }} /> Add
        </UnstyledButton>
      </nav>

      <Stack px="md" gap="md">
        {draft.paused_at && (
          <Alert color="yellow" variant="light" title="Workout paused">
            <Group justify="space-between">
              <Text size="sm">The timer is stopped.</Text>
              <Button size="xs" onClick={() => mutate((d) => resumeSession(d))}>
                Resume
              </Button>
            </Group>
          </Alert>
        )}

        {!current ? (
          <Stack align="center" py="xl">
            <Text c="dimmed">No exercises yet.</Text>
            <Button leftSection={<IconPlus size={18} />} onClick={() => setPicker({ mode: 'add' })}>
              Add exercise
            </Button>
          </Stack>
        ) : (
          <section aria-label={current.exercise_name_snapshot}>
            <Group justify="space-between" wrap="nowrap" align="flex-start" mb="xs">
              <div style={{ minWidth: 0 }}>
                <Title order={2} fz={22}>
                  {current.exercise_name_snapshot}
                </Title>
                <Text size="sm" c="dimmed">
                  {targetLabel(current)} · rest {formatDuration(current.rest_seconds ?? DEFAULT_REST)}
                  {current.substituted_for_exercise_id ? ' · substituted' : ''}
                </Text>
                {(current.group_name || current.tempo) && (
                  <Group gap={6} mt={6}>
                    {current.group_name && (
                      <Badge variant="light" color="gray">
                        {current.group_name}
                      </Badge>
                    )}
                    {current.tempo && (
                      <Badge
                        variant="light"
                        color="blue"
                        title="Tempo: eccentric-pause-concentric-pause (seconds)"
                      >
                        Tempo {current.tempo}
                      </Badge>
                    )}
                  </Group>
                )}
                {current.notes && (
                  <Text size="sm" mt={6} c="yellow.4">
                    Coach: {current.notes}
                  </Text>
                )}
              </div>
              {hasDemo && (
                <ActionIcon
                  size={44}
                  variant="light"
                  aria-label="Watch 3D demo"
                  onClick={() => setDemoOpen(true)}
                >
                  <IconCube size={20} />
                </ActionIcon>
              )}
              <Menu position="bottom-end">
                <Menu.Target>
                  <ActionIcon size={44} aria-label="Exercise options">
                    <IconDots size={20} />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  {current.alternatives
                    .filter((alt) => alt.id !== current.exercise_id)
                    .map((alt) => (
                      <Menu.Item
                        key={alt.id}
                        leftSection={<IconReplace size={16} />}
                        onClick={async () => {
                          const prev = (
                            await fetchPreviousPerformance([alt.id]).catch(
                              (): Record<string, PreviousSet[]> => ({}),
                            )
                          )[alt.id];
                          mutate((d) => substituteExercise(d, current.id, alt, prev));
                        }}
                      >
                        Use {alt.name} (coach option)
                      </Menu.Item>
                    ))}
                  <Menu.Item
                    leftSection={<IconReplace size={16} />}
                    onClick={() => setPicker({ mode: 'substitute', exerciseId: current.id })}
                  >
                    Substitute exercise
                  </Menu.Item>
                  <Menu.Item
                    leftSection={<IconArrowUp size={16} />}
                    disabled={draft.current_exercise_index === 0}
                    onClick={() =>
                      mutate((d) => moveExercise(d, d.current_exercise_index, d.current_exercise_index - 1))
                    }
                  >
                    Move earlier
                  </Menu.Item>
                  <Menu.Item
                    leftSection={<IconArrowDown size={16} />}
                    disabled={draft.current_exercise_index >= draft.exercises.length - 1}
                    onClick={() =>
                      mutate((d) => moveExercise(d, d.current_exercise_index, d.current_exercise_index + 1))
                    }
                  >
                    Move later
                  </Menu.Item>
                  <Menu.Item
                    color="red"
                    leftSection={<IconTrash size={16} />}
                    onClick={() => mutate((d) => removeExercise(d, current.id))}
                  >
                    Remove exercise
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </Group>

            <div className={classes.setGrid} style={{ padding: '0 4px 4px' }} aria-hidden>
              <Text size="xs" c="dimmed" fw={700} ta="center">
                SET
              </Text>
              <Text size="xs" c="dimmed" fw={700} ta="center">
                PREV
              </Text>
              <Text size="xs" c="dimmed" fw={700} ta="center" tt="uppercase">
                {current.is_bodyweight ? `+${labels.weight}` : labels.weight}
              </Text>
              <Text size="xs" c="dimmed" fw={700} ta="center">
                {current.rep_mode === 'timed' ? 'SECS' : 'REPS'}
              </Text>
              <span />
              <span />
            </div>
            <Stack gap={4}>
              {current.sets.map((s, i) => {
                const workingIndex = s.is_warmup
                  ? null
                  : current.sets.slice(0, i + 1).filter((x) => !x.is_warmup).length;
                const prevList = current.exercise_id ? previous.data?.[current.exercise_id] : undefined;
                return (
                  <SetRow
                    key={s.id}
                    set={s}
                    index={i}
                    workingIndex={workingIndex}
                    previous={previousFor(prevList, (workingIndex ?? 1) - 1)}
                    units={units}
                    isBodyweight={current.is_bodyweight}
                    repMode={current.rep_mode}
                    onChange={(patch) => mutate((d) => updateSet(d, current.id, s.id, patch))}
                    onToggle={(completed) => {
                      unlockAudio();
                      mutate((d) => {
                        const next = setCompleted(d, current.id, s.id, completed);
                        if (!completed) return next.rest?.set_id === s.id ? skipRest(next) : next;
                        return startRest(next, s.id, current.rest_seconds ?? DEFAULT_REST);
                      });
                    }}
                    onRemove={() => mutate((d) => removeSet(d, current.id, s.id))}
                    onEditDetails={() => setDetails({ exerciseId: current.id, setId: s.id })}
                  />
                );
              })}
            </Stack>
            <Button
              variant="subtle"
              fullWidth
              mt="xs"
              leftSection={<IconPlus size={18} />}
              onClick={() => mutate((d) => addSet(d, current.id))}
            >
              Add set
            </Button>

            <Group grow mt="md">
              <Button
                variant="default"
                leftSection={<IconArrowLeft size={18} />}
                disabled={draft.current_exercise_index === 0}
                onClick={() => mutate((d) => goToExercise(d, d.current_exercise_index - 1))}
              >
                Previous
              </Button>
              {draft.current_exercise_index < draft.exercises.length - 1 ? (
                <Button
                  variant={exerciseDone(current) ? 'filled' : 'default'}
                  rightSection={<IconArrowRight size={18} />}
                  onClick={() => mutate((d) => goToExercise(d, d.current_exercise_index + 1))}
                >
                  Next
                </Button>
              ) : (
                <Button
                  variant={exerciseDone(current) ? 'filled' : 'default'}
                  onClick={() => setFinishing(true)}
                >
                  Finish workout
                </Button>
              )}
            </Group>
            {draft.current_exercise_index < draft.exercises.length - 1 && (
              <Text size="xs" c="dimmed" ta="center" mt={6}>
                Up next: {draft.exercises[draft.current_exercise_index + 1]!.exercise_name_snapshot}
              </Text>
            )}
          </section>
        )}
      </Stack>

      {draft.rest && (
        <RestTimerBar
          rest={draft.rest}
          soundEnabled={settings?.sound_enabled ?? true}
          vibrationEnabled={settings?.vibration_enabled ?? true}
          onPause={() => local((d) => pauseRest(d))}
          onResume={() => local((d) => resumeRest(d))}
          onAdd={(sec) => local((d) => extendRest(d, sec))}
          onSkip={() => local((d) => skipRest(d))}
        />
      )}

      <Modal
        opened={demoOpen && !!current}
        onClose={() => setDemoOpen(false)}
        title={current?.exercise_name_snapshot}
        fullScreen
        radius={0}
      >
        {current && demoOpen && (
          <ExerciseDemo
            exercise={{
              id: current.exercise_id ?? current.id,
              name: current.exercise_name_snapshot,
              primary_muscles: current.primary_muscles_snapshot,
              instructions: catalog.data?.find((e) => e.id === current.exercise_id)?.instructions ?? null,
            }}
          />
        )}
        <Button fullWidth mt="md" variant="default" onClick={() => setDemoOpen(false)}>
          Back to workout
        </Button>
      </Modal>

      <ExercisePickerModal
        opened={picker != null}
        onClose={() => setPicker(null)}
        onPick={pickExercise}
        title={picker?.mode === 'substitute' ? 'Substitute with…' : 'Add exercise'}
        preferMuscles={picker?.mode === 'substitute' ? current?.primary_muscles_snapshot : undefined}
      />

      <SetDetailsModal
        key={details?.setId ?? 'none'}
        opened={!!detailSet}
        rpe={detailSet?.rpe ?? null}
        note={detailSet?.notes ?? ''}
        onClose={() => setDetails(null)}
        onSave={(rpe, note) => {
          if (details) {
            mutate((d) => updateSet(d, details.exerciseId, details.setId, { rpe, notes: note || null }));
          }
          setDetails(null);
        }}
      />

      <Modal opened={finishing} onClose={() => setFinishing(false)} title="Finish workout?" centered>
        <Stack>
          <Text>
            {formatDuration(elapsed)} · {stats.sets} sets completed
          </Text>
          {incomplete > 0 && (
            <Alert color="yellow" variant="light">
              {incomplete} set{incomplete === 1 ? ' is' : 's are'} not checked off. They'll be kept in the log
              but not counted toward volume or records.
            </Alert>
          )}
          <Textarea
            label="Notes (optional)"
            autosize
            minRows={2}
            defaultValue={draft.notes ?? ''}
            onBlur={(e) => {
              const notes = e.currentTarget.value.trim() || null;
              if (notes !== draft.notes) mutate((d) => ({ ...d, notes }));
            }}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setFinishing(false)}>
              Keep going
            </Button>
            <Button onClick={finish}>Finish & save</Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={discarding} onClose={() => setDiscarding(false)} title="Discard workout?" centered>
        <Stack>
          <Text size="sm">Everything logged in this workout will be removed. This can't be undone.</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setDiscarding(false)}>
              Cancel
            </Button>
            <Button
              color="red"
              onClick={async () => {
                await mutateDraft(draft.id, (d) => discardSession(d));
                navigate('/workouts', { replace: true });
              }}
            >
              Discard
            </Button>
          </Group>
        </Stack>
      </Modal>
    </div>
  );
}

function SetDetailsModal({
  opened,
  rpe,
  note,
  onClose,
  onSave,
}: {
  opened: boolean;
  rpe: number | null;
  note: string;
  onClose: () => void;
  onSave: (rpe: number | null, note: string) => void;
}) {
  const [value, setValue] = useState<string | number>(rpe ?? '');
  const [text, setText] = useState(note);
  return (
    <Modal opened={opened} onClose={onClose} title="Set details" centered>
      <Stack>
        <NumberInput
          label="RPE (optional)"
          description="Rate of perceived exertion, 1–10"
          min={1}
          max={10}
          step={0.5}
          decimalScale={1}
          inputMode="decimal"
          value={value}
          onChange={setValue}
        />
        <Textarea
          label="Note"
          autosize
          minRows={2}
          value={text}
          onChange={(e) => setText(e.currentTarget.value)}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onSave(typeof value === 'number' ? value : null, text.trim())}>Save</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
