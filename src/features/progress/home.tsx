import { Button, Card, Group, SimpleGrid, Skeleton, Stack, Text } from '@mantine/core';
import { IconChevronRight, IconPlus } from '@tabler/icons-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { useCurrentGoal, usePreferences } from '@/features/profile/api';
import { dayjs, localDate } from '@/lib/time';
import { formatWeight } from '@/lib/units';
import { useWeightLogs, useWeightTrend } from './api';
import { addDays } from './calendar';
import { formatWeightDelta } from './format';
import { GoalBar, StatTile } from './ui';
import { WeighInModal } from './WeighInModal';

/** Home dashboard card: latest weight, 7-day average, change vs start, goal progress. */
export function WeightSummaryCard() {
  const { units, timezone } = usePreferences();
  const today = localDate(timezone);
  const logs = useWeightLogs();
  const goal = useCurrentGoal();
  const trend = useWeightTrend(addDays(today, -6), today);
  const [open, setOpen] = useState(false);

  const latest = logs.data?.[0];
  const avg = trend.data?.at(-1)?.avg_7d ?? null;
  const g = goal.data;
  const loggedToday = latest ? dayjs(latest.measured_at).tz(timezone).format('YYYY-MM-DD') === today : false;

  return (
    <Card component="section" aria-label="Weight">
      <WeighInModal opened={open} onClose={() => setOpen(false)} />
      <Stack gap="sm">
        <Group justify="space-between" wrap="nowrap">
          <Text fw={700}>Weight</Text>
          <Button
            component={Link}
            to="/progress/weight"
            variant="subtle"
            size="sm"
            rightSection={<IconChevronRight size={16} />}
          >
            Trends
          </Button>
        </Group>
        {logs.isPending || goal.isPending ? (
          <Skeleton h={96} />
        ) : !latest ? (
          <Text size="sm" c="dimmed">
            No weigh-ins yet. Log one to start your trend.
          </Text>
        ) : (
          <>
            <SimpleGrid cols={3} spacing="sm">
              <StatTile label="Current" value={formatWeight(latest.weight_kg, units)} />
              <StatTile label="7-day avg" value={avg !== null ? formatWeight(avg, units) : '—'} />
              <StatTile
                label="Since start"
                value={g ? formatWeightDelta(latest.weight_kg - g.start_weight_kg, units) : '—'}
              />
            </SimpleGrid>
            {g && (
              <GoalBar
                startKg={g.start_weight_kg}
                targetKg={g.target_weight_kg}
                currentKg={latest.weight_kg}
              />
            )}
          </>
        )}
        <Button
          size="md"
          variant={loggedToday ? 'light' : 'filled'}
          leftSection={<IconPlus size={18} />}
          onClick={() => setOpen(true)}
        >
          {loggedToday ? 'Log another weigh-in' : 'Log weight'}
        </Button>
      </Stack>
    </Card>
  );
}
