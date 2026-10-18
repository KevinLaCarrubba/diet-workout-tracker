import {
  Badge,
  Button,
  Card,
  Group,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  ThemeIcon,
  UnstyledButton,
} from '@mantine/core';
import { IconCheck, IconChevronRight, IconCircleDashed, IconPlayerPlay } from '@tabler/icons-react';
import { Link } from 'react-router';
import { PageHeader } from '@/components/PageHeader';
import { TodayMealsCard, WaterQuickCard } from '@/features/meals/home';
import { useMealDay, useWaterDay } from '@/features/meals/api';
import { nextUpcomingMeal, visibleMeals } from '@/features/meals/logic';
import { totalMl } from '@/features/meals/water';
import { usePreferences, useSettings } from '@/features/profile/api';
import { WeightSummaryCard } from '@/features/progress/home';
import { useTemplates } from '@/features/workouts/api';
import { useTodaySchedule } from '@/features/workouts/schedule/api';
import { useActiveDraft, useStartWorkout } from '@/features/workouts/session/hooks';
import { notifyError } from '@/lib/notify';
import { dayjs, formatDuration, formatLocalTime, localDate } from '@/lib/time';
import { useHomeActivity } from './api';
import { buildChecklist } from './checklist';

function greeting(tz: string) {
  const hour = dayjs().tz(tz).hour();
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}

function TodayWorkoutCard() {
  const today = useTodaySchedule();
  const templates = useTemplates();
  const active = useActiveDraft();
  const start = useStartWorkout();
  const template = today.workout?.template_id
    ? templates.data?.find((t) => t.id === today.workout?.template_id)
    : undefined;

  return (
    <Card>
      <Group justify="space-between" mb={6}>
        <Text fw={700}>Today's workout</Text>
        <Button
          component={Link}
          to="/workouts/schedule"
          variant="subtle"
          size="compact-sm"
          rightSection={<IconChevronRight size={14} />}
        >
          Week
        </Button>
      </Group>
      {active.data ? (
        <Group justify="space-between" wrap="nowrap">
          <div style={{ minWidth: 0 }}>
            <Text fw={700} truncate>
              {active.data.title}
            </Text>
            <Text size="sm" c="dimmed">
              In progress
            </Text>
          </div>
          <Button
            component={Link}
            to={`/workouts/session/${active.data.id}`}
            leftSection={<IconPlayerPlay size={18} />}
          >
            Resume
          </Button>
        </Group>
      ) : today.isPending ? (
        <Skeleton h={56} />
      ) : today.workout ? (
        <Stack gap="sm">
          <Group justify="space-between" wrap="nowrap">
            <div style={{ minWidth: 0 }}>
              <Text fw={700} fz="lg" truncate>
                {today.workout.template?.title ?? 'Workout'}
              </Text>
              <Text size="sm" c="dimmed">
                {today.workout.local_time ? formatLocalTime(today.workout.local_time) : 'Any time today'}
                {template ? ` · ${template.items.length} exercises` : ''}
              </Text>
            </div>
            {today.workout.status === 'completed' && <Badge variant="light">Done</Badge>}
            {today.workout.status === 'skipped' && (
              <Badge variant="light" color="gray">
                Skipped
              </Badge>
            )}
          </Group>
          {today.workout.status === 'scheduled' && (
            <Button
              size="lg"
              leftSection={<IconPlayerPlay size={20} />}
              loading={start.isPending}
              disabled={!!today.workout?.template_id && !template}
              onClick={() =>
                start.mutate(
                  { template: template ?? null, scheduledWorkoutId: today.workout!.id },
                  { onError: notifyError },
                )
              }
            >
              Start workout
            </Button>
          )}
        </Stack>
      ) : today.isRestDay ? (
        <Text fw={600}>Rest day — recovery counts too.</Text>
      ) : (
        <Text c="dimmed" size="sm">
          Nothing scheduled.{' '}
          <Text component={Link} to="/workouts" c="lime" inherit>
            Start a workout
          </Text>
        </Text>
      )}
    </Card>
  );
}

function ChecklistCard() {
  const { timezone } = usePreferences();
  const today = localDate(timezone);
  const schedule = useTodaySchedule();
  const meals = useMealDay(today);
  const water = useWaterDay(today);
  const settings = useSettings();
  const activity = useHomeActivity();
  const items = buildChecklist({
    isRestDay: schedule.isRestDay,
    workout: schedule.workout,
    workoutDoneToday: activity.data?.workoutDoneToday ?? false,
    meals: meals.data?.meals ?? [],
    waterMl: totalMl(water.entries),
    waterGoalMl: settings.data?.water_goal_ml ?? 2000,
    weighedIn: activity.data?.weighedIn ?? false,
  });

  const pending = visibleMeals(meals.data?.meals ?? []);
  const nextMeal = nextUpcomingMeal(pending);
  const workoutAt =
    schedule.workout?.status === 'scheduled' &&
    schedule.workout.scheduled_at &&
    dayjs(schedule.workout.scheduled_at).isAfter(dayjs())
      ? schedule.workout
      : null;
  const next =
    nextMeal && (!workoutAt || dayjs(nextMeal.scheduled_at).isBefore(workoutAt.scheduled_at))
      ? `${nextMeal.label_snapshot} at ${formatLocalTime(nextMeal.local_time)}`
      : workoutAt
        ? `${workoutAt.template?.title ?? 'Workout'} at ${formatLocalTime(workoutAt.local_time!)}`
        : null;

  return (
    <Card>
      <Group justify="space-between" mb="xs">
        <Text fw={700}>Today</Text>
        <Text size="sm" c="dimmed">
          {items.filter((i) => i.done).length}/{items.length}
        </Text>
      </Group>
      <SimpleGrid cols={2} spacing="xs">
        {items.map((item) => (
          <UnstyledButton key={item.key} component={Link} to={item.to}>
            <Group gap="xs" wrap="nowrap" p={6} mih={44}>
              <ThemeIcon
                size={26}
                radius="xl"
                variant={item.done ? 'filled' : 'light'}
                color={item.done ? 'lime' : 'gray'}
              >
                {item.done ? <IconCheck size={16} /> : <IconCircleDashed size={16} />}
              </ThemeIcon>
              <div style={{ minWidth: 0 }}>
                <Text size="sm" fw={600} truncate>
                  {item.label}
                </Text>
                <Text size="xs" c="dimmed" truncate>
                  {item.detail}
                </Text>
              </div>
            </Group>
          </UnstyledButton>
        ))}
      </SimpleGrid>
      {next && (
        <Text size="sm" c="dimmed" mt="xs">
          Next up:{' '}
          <Text span fw={600} c="var(--mantine-color-text)">
            {next}
          </Text>
        </Text>
      )}
    </Card>
  );
}

function RecentWorkouts() {
  const activity = useHomeActivity();
  const recent = activity.data?.recent ?? [];
  if (recent.length === 0) return null;
  return (
    <Card>
      <Group justify="space-between" mb={6}>
        <Text fw={700}>Recent workouts</Text>
        <Button
          component={Link}
          to="/workouts/history"
          variant="subtle"
          size="compact-sm"
          rightSection={<IconChevronRight size={14} />}
        >
          History
        </Button>
      </Group>
      <Stack gap={4}>
        {recent.map((s) => (
          <UnstyledButton key={s.id} component={Link} to={`/workouts/history/${s.id}`}>
            <Group justify="space-between" wrap="nowrap" mih={40}>
              <Text size="sm" fw={600} truncate>
                {s.title}
              </Text>
              <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
                {dayjs(s.started_at).format('ddd MMM D')} · {formatDuration(s.duration_seconds ?? 0)} ·{' '}
                {s.total_sets} sets
              </Text>
            </Group>
          </UnstyledButton>
        ))}
      </Stack>
    </Card>
  );
}

export function HomePage() {
  const { timezone, profile } = usePreferences();
  return (
    <Stack>
      <PageHeader
        title={`${greeting(timezone)}${profile?.display_name ? `, ${profile.display_name}` : ''}`}
        subtitle={dayjs().tz(timezone).format('dddd, MMMM D')}
      />
      <ChecklistCard />
      <TodayWorkoutCard />
      <TodayMealsCard />
      <WaterQuickCard />
      <WeightSummaryCard />
      <RecentWorkouts />
    </Stack>
  );
}
