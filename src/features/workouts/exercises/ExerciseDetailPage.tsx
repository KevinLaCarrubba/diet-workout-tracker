import { ActionIcon, Alert, Badge, Button, Card, Group, Menu, Skeleton, Stack, Text } from '@mantine/core';
import { IconArrowLeft, IconDots, IconPencil, IconTrash } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { PageHeader } from '@/components/PageHeader';
import { SectionCard } from '@/components/SectionCard';
import { ExerciseDemo } from '@/features/exercise-viewer/LazyExerciseViewer';
import { usePreferences } from '@/features/profile/api';
import { dayjs } from '@/lib/time';
import { useExercises, type Exercise } from '../api';
import { useExerciseHistory } from './api';
import { DeleteExerciseModal } from './DeleteExerciseModal';
import { ExerciseFormModal } from './ExerciseFormModal';
import { formatHistorySet, muscleGroups } from './helpers';

const DIFFICULTY_LABEL: Record<Exercise['difficulty'], string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

function BackLink() {
  return (
    <Button
      component={Link}
      to="/workouts/exercises"
      variant="subtle"
      color="gray"
      leftSection={<IconArrowLeft size={18} />}
      w="fit-content"
      px={4}
    >
      Exercises
    </Button>
  );
}

function History({ exerciseId }: { exerciseId: string }) {
  const { units } = usePreferences();
  const history = useExerciseHistory(exerciseId);
  return (
    <SectionCard title="Your recent sessions" description="Last 5 completed workouts with this exercise">
      {history.isPending ? (
        <Stack gap="xs">
          <Skeleton h={48} />
          <Skeleton h={48} />
        </Stack>
      ) : history.isError ? (
        <Text size="sm" c="dimmed">
          History isn't available right now ({history.error.message}).
        </Text>
      ) : history.data.length === 0 ? (
        <Text size="sm" c="dimmed">
          No logged sets yet. Your sets will show up here after your first workout with it.
        </Text>
      ) : (
        <Stack gap="sm">
          {history.data.map((s) => (
            <Stack key={s.sessionId} gap={4}>
              <Group justify="space-between" wrap="nowrap">
                <Text
                  component={Link}
                  to={`/workouts/history/${s.sessionId}`}
                  fw={600}
                  size="sm"
                  truncate
                  style={{ minWidth: 0 }}
                >
                  {s.title}
                </Text>
                <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
                  {dayjs(s.startedAt).format('ddd, MMM D')}
                </Text>
              </Group>
              <Group gap={6}>
                {s.sets.map((set) => (
                  <Badge
                    key={set.id}
                    variant={set.is_warmup ? 'outline' : 'light'}
                    color={set.is_warmup ? 'gray' : 'lime'}
                    tt="none"
                    size="lg"
                  >
                    {set.is_warmup ? 'W · ' : ''}
                    {formatHistorySet(set, units)}
                  </Badge>
                ))}
              </Group>
            </Stack>
          ))}
        </Stack>
      )}
    </SectionCard>
  );
}

export function ExerciseDetailPage() {
  const { exerciseId = '' } = useParams();
  const navigate = useNavigate();
  const exercises = useExercises();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const exercise = exercises.data?.find((e) => e.id === exerciseId);
  const muscles = useMemo(() => muscleGroups(exercises.data ?? []), [exercises.data]);

  if (exercises.isPending) {
    return (
      <Stack>
        <BackLink />
        <Skeleton h={36} w="70%" />
        <Skeleton h={120} radius="lg" />
        <Skeleton h={160} radius="lg" />
      </Stack>
    );
  }

  if (exercises.isError || !exercise) {
    return (
      <Stack>
        <BackLink />
        <Alert
          color={exercises.isError ? 'red' : 'gray'}
          variant="light"
          title={exercises.isError ? "Couldn't load this exercise" : 'Exercise not found'}
        >
          {exercises.isError ? exercises.error.message : 'It may have been deleted.'}
        </Alert>
      </Stack>
    );
  }

  const custom = !!exercise.owner_user_id;
  return (
    <Stack>
      <BackLink />
      <PageHeader
        title={exercise.name}
        subtitle={[
          exercise.equipment,
          DIFFICULTY_LABEL[exercise.difficulty],
          exercise.is_bodyweight ? 'Bodyweight' : null,
        ]
          .filter(Boolean)
          .join(' · ')}
        action={
          custom ? (
            <Menu position="bottom-end">
              <Menu.Target>
                <ActionIcon size={44} aria-label="Manage exercise">
                  <IconDots size={20} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item leftSection={<IconPencil size={16} />} onClick={() => setEditing(true)}>
                  Edit
                </Menu.Item>
                <Menu.Item
                  leftSection={<IconTrash size={16} />}
                  color="red"
                  onClick={() => setDeleting(true)}
                >
                  Delete
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          ) : undefined
        }
      />

      <Card>
        <Stack gap="sm">
          {custom && (
            <Badge variant="light" color="blue" w="fit-content">
              Custom exercise
            </Badge>
          )}
          <div>
            <Text size="xs" c="dimmed" fw={700} tt="uppercase" mb={4}>
              Primary muscles
            </Text>
            {exercise.primary_muscles.length > 0 ? (
              <Group gap={6}>
                {exercise.primary_muscles.map((m) => (
                  <Badge key={m} variant="filled" tt="capitalize">
                    {m}
                  </Badge>
                ))}
              </Group>
            ) : (
              <Text size="sm" c="dimmed">
                Not set
              </Text>
            )}
          </div>
          {exercise.secondary_muscles.length > 0 && (
            <div>
              <Text size="xs" c="dimmed" fw={700} tt="uppercase" mb={4}>
                Secondary muscles
              </Text>
              <Group gap={6}>
                {exercise.secondary_muscles.map((m) => (
                  <Badge key={m} variant="light" color="gray" tt="capitalize">
                    {m}
                  </Badge>
                ))}
              </Group>
            </div>
          )}
          <div>
            <Text size="xs" c="dimmed" fw={700} tt="uppercase" mb={4}>
              Instructions
            </Text>
            <Text size="sm" style={{ whiteSpace: 'pre-line' }}>
              {exercise.instructions?.trim() || 'No instructions yet.'}
            </Text>
          </div>
        </Stack>
      </Card>

      <ExerciseDemo
        exercise={{
          id: exercise.id,
          name: exercise.name,
          primary_muscles: exercise.primary_muscles,
          secondary_muscles: exercise.secondary_muscles,
          instructions: exercise.instructions,
        }}
      />

      <History exerciseId={exercise.id} />

      <ExerciseFormModal
        opened={editing}
        exercise={exercise}
        muscleSuggestions={muscles}
        onClose={() => setEditing(false)}
      />
      <DeleteExerciseModal
        exercise={deleting ? exercise : null}
        onClose={() => setDeleting(false)}
        onDeleted={() => void navigate('/workouts/exercises', { replace: true })}
      />
    </Stack>
  );
}
