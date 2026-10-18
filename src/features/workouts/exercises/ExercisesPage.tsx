import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Chip,
  Group,
  Menu,
  ScrollArea,
  Skeleton,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from '@mantine/core';
import { IconChevronRight, IconDots, IconPencil, IconPlus, IconSearch, IconTrash } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { PageHeader } from '@/components/PageHeader';
import { useExercises, type Exercise } from '../api';
import { filterExercises } from '../components/filterExercises';
import { DeleteExerciseModal } from './DeleteExerciseModal';
import { ExerciseFormModal } from './ExerciseFormModal';
import { byMuscle, muscleGroups } from './helpers';

const ALL = 'all';
const MINE = 'mine';

function ExerciseRow({
  exercise,
  onEdit,
  onDelete,
}: {
  exercise: Exercise;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const custom = !!exercise.owner_user_id;
  return (
    <Card p={0}>
      <Group wrap="nowrap" gap={0}>
        <UnstyledButton
          component={Link}
          to={`/workouts/exercises/${exercise.id}`}
          p="sm"
          mih={60}
          style={{ flex: 1, minWidth: 0 }}
        >
          <Group gap={6} wrap="nowrap">
            <Text fw={600} truncate>
              {exercise.name}
            </Text>
            {custom && (
              <Badge size="xs" variant="light" color="blue" style={{ flexShrink: 0 }}>
                Custom
              </Badge>
            )}
          </Group>
          <Text size="xs" c="dimmed" truncate tt="capitalize">
            {[exercise.primary_muscles.join(', '), exercise.equipment].filter(Boolean).join(' · ') ||
              'No muscles listed'}
          </Text>
        </UnstyledButton>
        {custom ? (
          <Menu position="bottom-end">
            <Menu.Target>
              <ActionIcon size={44} mr={6} aria-label={`Manage ${exercise.name}`}>
                <IconDots size={20} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item leftSection={<IconPencil size={16} />} onClick={onEdit}>
                Edit
              </Menu.Item>
              <Menu.Item leftSection={<IconTrash size={16} />} color="red" onClick={onDelete}>
                Delete
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        ) : (
          <IconChevronRight
            size={18}
            color="var(--mantine-color-dimmed)"
            style={{ marginRight: 14 }}
            aria-hidden
          />
        )}
      </Group>
    </Card>
  );
}

export function ExercisesPage() {
  const exercises = useExercises();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<string>(ALL);
  const [editing, setEditing] = useState<Exercise | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Exercise | null>(null);

  const all = useMemo(() => exercises.data ?? [], [exercises.data]);
  const muscles = useMemo(() => muscleGroups(all), [all]);
  const list = useMemo(() => {
    const scoped =
      filter === MINE ? all.filter((e) => e.owner_user_id) : filter === ALL ? all : byMuscle(all, filter);
    return filterExercises(scoped, query);
  }, [all, filter, query]);

  return (
    <Stack>
      <PageHeader
        title="Exercises"
        subtitle={exercises.data ? `${all.length} exercises` : undefined}
        action={
          <Button leftSection={<IconPlus size={18} />} onClick={() => setCreating(true)}>
            New
          </Button>
        }
      />
      <TextInput
        size="md"
        placeholder="Search name, muscle or equipment"
        aria-label="Search exercises"
        leftSection={<IconSearch size={18} />}
        value={query}
        onChange={(e) => setQuery(e.currentTarget.value)}
      />
      <ScrollArea type="never" offsetScrollbars={false}>
        <Chip.Group value={filter} onChange={(v) => setFilter(v || ALL)}>
          <Group gap="xs" wrap="nowrap" pb={4}>
            <Chip value={ALL} size="md">
              All
            </Chip>
            <Chip value={MINE} size="md">
              Custom
            </Chip>
            {muscles.map((m) => (
              <Chip key={m} value={m} size="md" tt="capitalize">
                {m}
              </Chip>
            ))}
          </Group>
        </Chip.Group>
      </ScrollArea>

      {exercises.isPending ? (
        <Stack gap="xs">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} h={60} radius="lg" />
          ))}
        </Stack>
      ) : exercises.isError ? (
        <Alert color="red" variant="light" title="Couldn't load exercises">
          <Stack gap="xs">
            <Text size="sm">{exercises.error.message}</Text>
            <Button size="sm" variant="default" w="fit-content" onClick={() => void exercises.refetch()}>
              Try again
            </Button>
          </Stack>
        </Alert>
      ) : list.length === 0 ? (
        <Card>
          <Stack align="center" gap="xs" py="md">
            <Text c="dimmed" ta="center">
              {filter === MINE && !query
                ? "You haven't added any exercises of your own yet."
                : 'No exercises match. Try another search or filter.'}
            </Text>
            <Button variant="light" leftSection={<IconPlus size={18} />} onClick={() => setCreating(true)}>
              Add an exercise
            </Button>
          </Stack>
        </Card>
      ) : (
        <Stack gap="xs">
          {list.map((e) => (
            <ExerciseRow
              key={e.id}
              exercise={e}
              onEdit={() => setEditing(e)}
              onDelete={() => setDeleting(e)}
            />
          ))}
        </Stack>
      )}

      <ExerciseFormModal
        opened={creating || !!editing}
        exercise={editing}
        muscleSuggestions={muscles}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
      <DeleteExerciseModal exercise={deleting} onClose={() => setDeleting(null)} />
    </Stack>
  );
}
