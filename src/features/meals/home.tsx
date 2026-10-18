import {
  ActionIcon,
  Anchor,
  Badge,
  Button,
  Card,
  Group,
  Progress,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
} from '@mantine/core';
import { IconCheck, IconChevronRight, IconPlayerSkipForward } from '@tabler/icons-react';
import { Link } from 'react-router';
import { usePreferences, useSettings } from '@/features/profile/api';
import { formatLocalTime, localDate } from '@/lib/time';
import { formatVolume } from '@/lib/units';
import { useMealDay, useWaterDay } from './api';
import { mealState, nextUpcomingMeal, stateLabel, visibleMeals, type MealOccurrence } from './logic';
import { useMealActions } from './useMealActions';
import { useNow } from './useNow';
import { useWaterAdd } from './useWaterAdd';
import { goalPercent, quickAddPresets, totalMl } from './water';

function CardHeader({ title, to, linkLabel }: { title: string; to: string; linkLabel: string }) {
  return (
    <Group justify="space-between" wrap="nowrap">
      <Text fw={700}>{title}</Text>
      <Anchor component={Link} to={to} size="sm" aria-label={linkLabel}>
        <Group gap={2} wrap="nowrap">
          Open <IconChevronRight size={14} />
        </Group>
      </Anchor>
    </Group>
  );
}

function CompactMealRow({
  meal,
  timezone,
  now,
  onAte,
  onSkip,
}: {
  meal: MealOccurrence;
  timezone: string;
  now: Date;
  onAte: () => void;
  onSkip: () => void;
}) {
  const state = mealState(meal, now);
  const open = state === 'pending' || state === 'snoozed';
  return (
    <Group justify="space-between" wrap="nowrap" mih={44}>
      <div style={{ minWidth: 0 }}>
        <Text size="sm" fw={600} truncate>
          {meal.label_snapshot} · {formatLocalTime(meal.local_time)}
        </Text>
        <Text size="xs" c="dimmed" truncate>
          {open
            ? (meal.description_snapshot ?? stateLabel(meal, timezone, now))
            : stateLabel(meal, timezone, now)}
        </Text>
      </div>
      {open ? (
        <Group gap={4} wrap="nowrap">
          <ActionIcon size="xl" variant="light" aria-label={`Ate ${meal.label_snapshot}`} onClick={onAte}>
            <IconCheck size={20} />
          </ActionIcon>
          <ActionIcon size="xl" variant="default" aria-label={`Skip ${meal.label_snapshot}`} onClick={onSkip}>
            <IconPlayerSkipForward size={18} />
          </ActionIcon>
        </Group>
      ) : (
        <Badge
          color={state === 'eaten' ? 'lime' : 'gray'}
          variant={state === 'eaten' ? 'light' : 'outline'}
          tt="none"
        >
          {state === 'eaten' ? 'Eaten' : 'Skipped'}
        </Badge>
      )}
    </Group>
  );
}

/** Home: the next meal up front, then the rest of today's meals. */
export function TodayMealsCard() {
  const { timezone } = usePreferences();
  const today = localDate(timezone);
  const now = useNow();
  const day = useMealDay(today);
  const actions = useMealActions();
  const meals = visibleMeals(day.data?.meals ?? []);
  const next = nextUpcomingMeal(meals, now);
  const rest = meals.filter((m) => m.id !== next?.id);
  const allMarked = meals.length > 0 && meals.every((m) => m.status !== 'pending');

  return (
    <Card component="section" aria-label="Today's meals">
      <Stack gap="sm">
        <CardHeader title="Meals" to="/meals" linkLabel="Open meals" />
        {day.isPending ? (
          <Skeleton h={120} />
        ) : day.isError ? (
          <Text size="sm" c="dimmed">
            Meals aren&apos;t available right now.
          </Text>
        ) : meals.length === 0 ? (
          <Stack gap="xs" align="flex-start">
            <Text size="sm" c="dimmed">
              No meals planned for today.
            </Text>
            <Button component={Link} to="/meals/plan" variant="light" size="sm">
              Set up your meal plan
            </Button>
          </Stack>
        ) : (
          <>
            {next ? (
              <Stack gap={6}>
                <Text size="xs" fw={700} c="lime" tt="uppercase">
                  Up next ·{' '}
                  {mealState(next, now) === 'snoozed'
                    ? stateLabel(next, timezone, now)
                    : formatLocalTime(next.local_time)}
                </Text>
                <Text fz={22} fw={800} lh={1.2}>
                  {next.label_snapshot}
                </Text>
                {next.description_snapshot && (
                  <Text size="sm" c="dimmed">
                    {next.description_snapshot}
                  </Text>
                )}
                <Group grow gap="xs">
                  <Button size="lg" leftSection={<IconCheck size={20} />} onClick={() => actions.ate(next)}>
                    Ate
                  </Button>
                  <Button size="lg" variant="default" onClick={() => actions.skip(next)}>
                    Skip
                  </Button>
                </Group>
              </Stack>
            ) : allMarked ? (
              <Text size="sm">All of today&apos;s meals are marked. Nice work.</Text>
            ) : null}
            <Stack gap={2}>
              {rest.map((m) => (
                <CompactMealRow
                  key={m.id}
                  meal={m}
                  timezone={timezone}
                  now={now}
                  onAte={() => actions.ate(m)}
                  onSkip={() => actions.skip(m)}
                />
              ))}
            </Stack>
          </>
        )}
      </Stack>
    </Card>
  );
}

/** Home: today's water progress with quick-add buttons. */
export function WaterQuickCard() {
  const { units, timezone } = usePreferences();
  const today = localDate(timezone);
  const settings = useSettings();
  const day = useWaterDay(today);
  const add = useWaterAdd();
  const goal = settings.data?.water_goal_ml ?? null;
  const total = totalMl(day.entries);
  const presets = quickAddPresets(units);

  return (
    <Card component="section" aria-label="Water today">
      <Stack gap="sm">
        <CardHeader title="Water" to="/meals/water" linkLabel="Open water" />
        <Group justify="space-between" align="baseline">
          <Text fz={22} fw={800} className="tabular">
            {formatVolume(total, units)}
          </Text>
          {goal != null && (
            <Text size="sm" c="dimmed">
              of {formatVolume(goal, units)}
            </Text>
          )}
        </Group>
        <Progress
          value={goalPercent(total, goal)}
          color="blue"
          size="lg"
          radius="xl"
          aria-label="Water toward today's target"
        />
        <SimpleGrid cols={4} spacing="xs">
          {presets.map((p) => (
            <Button
              key={p.ml}
              size="md"
              fz="sm"
              px={4}
              variant="light"
              color="blue"
              onClick={() => void add(p.ml)}
            >
              +{p.label}
            </Button>
          ))}
        </SimpleGrid>
      </Stack>
    </Card>
  );
}
