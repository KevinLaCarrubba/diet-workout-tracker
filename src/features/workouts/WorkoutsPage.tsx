import { Badge, Button, Card, Group, SimpleGrid, Skeleton, Stack, Text, UnstyledButton } from '@mantine/core';
import {
  IconCalendarWeek,
  IconChevronRight,
  IconHistory,
  IconListDetails,
  IconPlayerPlay,
  IconPlus,
  IconRun,
  IconTrophy,
  IconBarbell,
} from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { PageHeader } from '@/components/PageHeader';
import { notifyError } from '@/lib/notify';
import { formatLocalTime } from '@/lib/time';
import { useTemplates, type TemplateWithExercises } from './api';
import { useTodaySchedule } from './schedule/api';
import { useActiveDraft, useStartWorkout } from './session/hooks';

function NavTile({ to, icon, label }: { to: string; icon: ReactNode; label: string }) {
  return (
    <UnstyledButton component={Link} to={to} aria-label={label}>
      <Card p="sm" h="100%">
        <Stack gap={6} align="center">
          {icon}
          <Text size="sm" fw={600}>
            {label}
          </Text>
        </Stack>
      </Card>
    </UnstyledButton>
  );
}

export function WorkoutsPage() {
  const templates = useTemplates();
  const today = useTodaySchedule();
  const active = useActiveDraft();
  const start = useStartWorkout();

  const run = (template: TemplateWithExercises | null, scheduledWorkoutId?: string) =>
    start.mutate({ template, scheduledWorkoutId }, { onError: notifyError });

  const todayTemplate = today.workout?.template_id
    ? templates.data?.find((t) => t.id === today.workout?.template_id)
    : undefined;

  return (
    <Stack>
      <PageHeader
        title="Workouts"
        action={
          <Button
            component={Link}
            to="/workouts/templates"
            variant="light"
            size="sm"
            leftSection={<IconPlus size={16} />}
          >
            Templates
          </Button>
        }
      />

      {active.data ? (
        <Card style={{ borderColor: 'var(--mantine-primary-color-filled)' }}>
          <Group justify="space-between" wrap="nowrap">
            <div>
              <Text size="xs" c="dimmed" fw={700} tt="uppercase">
                In progress
              </Text>
              <Text fw={700} fz="lg">
                {active.data.title}
              </Text>
            </div>
            <Button
              component={Link}
              to={`/workouts/session/${active.data.id}`}
              size="md"
              leftSection={<IconPlayerPlay size={18} />}
            >
              Resume
            </Button>
          </Group>
        </Card>
      ) : (
        <Card>
          <Text size="xs" c="dimmed" fw={700} tt="uppercase">
            Today
          </Text>
          {today.isPending ? (
            <Skeleton h={48} mt="xs" />
          ) : today.workout ? (
            <Stack gap="sm" mt={4}>
              <Group justify="space-between" wrap="nowrap">
                <div>
                  <Text fw={700} fz="lg">
                    {today.workout.template?.title ?? 'Workout'}
                  </Text>
                  <Text size="sm" c="dimmed">
                    {today.workout.local_time ? formatLocalTime(today.workout.local_time) : 'Any time today'}
                  </Text>
                </div>
                {today.workout.status === 'completed' ? (
                  <Badge color="lime" variant="light">
                    Done
                  </Badge>
                ) : today.workout.status === 'skipped' ? (
                  <Badge color="gray" variant="light">
                    Skipped
                  </Badge>
                ) : null}
              </Group>
              {today.workout.status === 'scheduled' && (
                <Button
                  size="lg"
                  leftSection={<IconPlayerPlay size={20} />}
                  loading={start.isPending}
                  disabled={!!today.workout.template_id && !todayTemplate}
                  onClick={() => run(todayTemplate ?? null, today.workout!.id)}
                >
                  Start workout
                </Button>
              )}
            </Stack>
          ) : today.isRestDay ? (
            <Text fw={700} fz="lg" mt={4}>
              Rest day — recovery counts too.
            </Text>
          ) : (
            <Text c="dimmed" mt={4}>
              Nothing scheduled.{' '}
              <Text component={Link} to="/workouts/schedule" c="lime" inherit>
                Set up your week
              </Text>
            </Text>
          )}
          <Button
            variant="default"
            mt="sm"
            fullWidth
            leftSection={<IconBarbell size={18} />}
            loading={start.isPending}
            onClick={() => run(null)}
          >
            Start empty workout
          </Button>
        </Card>
      )}

      <SimpleGrid cols={{ base: 3, sm: 6 }} spacing="xs">
        <NavTile to="/workouts/schedule" icon={<IconCalendarWeek size={24} />} label="Schedule" />
        <NavTile to="/workouts/history" icon={<IconHistory size={24} />} label="History" />
        <NavTile to="/workouts/records" icon={<IconTrophy size={24} />} label="Records" />
        <NavTile to="/workouts/cardio" icon={<IconRun size={24} />} label="Cardio" />
        <NavTile to="/workouts/exercises" icon={<IconListDetails size={24} />} label="Exercises" />
        <NavTile to="/workouts/templates" icon={<IconPlus size={24} />} label="Templates" />
      </SimpleGrid>

      <Text fw={700} mt="sm">
        Your templates
      </Text>
      {templates.isPending ? (
        <Stack>
          <Skeleton h={72} radius="lg" />
          <Skeleton h={72} radius="lg" />
        </Stack>
      ) : templates.data && templates.data.length > 0 ? (
        <Stack gap="sm">
          {templates.data.map((t) => (
            <Card key={t.id} p="sm">
              <Group justify="space-between" wrap="nowrap">
                <UnstyledButton
                  component={Link}
                  to={`/workouts/templates/${t.id}`}
                  style={{ minWidth: 0, flex: 1 }}
                >
                  <Text fw={700} truncate>
                    {t.title}
                  </Text>
                  <Text size="xs" c="dimmed" truncate>
                    {t.items.length} exercises · {t.items.map((i) => i.exercise.name).join(', ')}
                  </Text>
                </UnstyledButton>
                <Group gap={4} wrap="nowrap">
                  <Button
                    size="sm"
                    variant="light"
                    disabled={!!active.data}
                    loading={start.isPending}
                    onClick={() => run(t)}
                    aria-label={`Start ${t.title}`}
                  >
                    Start
                  </Button>
                  <IconChevronRight size={18} color="var(--mantine-color-dimmed)" aria-hidden />
                </Group>
              </Group>
            </Card>
          ))}
        </Stack>
      ) : (
        <Card>
          <Stack align="center" gap="xs" py="sm">
            <Text c="dimmed" ta="center">
              No templates yet. Start from a proven plan like Push/Pull/Legs, or build your own.
            </Text>
            <Button component={Link} to="/workouts/templates">
              Browse plans
            </Button>
          </Stack>
        </Card>
      )}
    </Stack>
  );
}
