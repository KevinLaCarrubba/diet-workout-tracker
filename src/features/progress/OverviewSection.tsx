import { Alert, Button, Card, Group, SimpleGrid, Skeleton, Stack, Text } from '@mantine/core';
import { IconInfoCircle, IconScale } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { SectionCard } from '@/components/SectionCard';
import { useCurrentGoal, usePreferences } from '@/features/profile/api';
import { dayjs, localDate } from '@/lib/time';
import { formatWeight, unitLabels, weightToDisplay } from '@/lib/units';
import { useWeeklySummary, useWeightLogs, useWeightTrend, type WeeklySummary } from './api';
import { addDays, isoWeekStart } from './calendar';
import { formatDateRange, formatShortDate, formatSigned, formatWeightDelta } from './format';
import {
  dailyWeights,
  estimateGoalDate,
  lastNDays,
  linearRegression,
  MIN_SPAN_DAYS,
  MIN_WEIGH_INS,
} from './trend';
import { GoalBar, StatTile } from './ui';
import { WeighInModal } from './WeighInModal';

export function OverviewSection() {
  const { units, timezone } = usePreferences();
  const today = localDate(timezone);
  const logs = useWeightLogs();
  const goal = useCurrentGoal();
  const week = useTrendLatest(today);
  const [logOpen, setLogOpen] = useState(false);

  const daily28 = useMemo(
    () => lastNDays(dailyWeights(logs.data ?? [], timezone), today, 28),
    [logs.data, timezone, today],
  );

  if (logs.isPending || goal.isPending) return <Skeleton h={320} radius="lg" />;
  if (logs.isError)
    return <Alert color="red">Couldn't load your weigh-ins. Pull to refresh or try again later.</Alert>;

  const latest = logs.data[0];
  const g = goal.data;
  const label = unitLabels(units).weight;

  return (
    <Stack>
      <WeighInModal opened={logOpen} onClose={() => setLogOpen(false)} />
      {!latest ? (
        <Card>
          <Stack align="center" ta="center" py="md">
            <IconScale size={36} stroke={1.5} />
            <Text fw={700}>No weigh-ins yet</Text>
            <Text size="sm" c="dimmed">
              Log your weight to see trends, your 7-day average and goal progress.
            </Text>
            <Button size="lg" onClick={() => setLogOpen(true)}>
              Log weight
            </Button>
          </Stack>
        </Card>
      ) : (
        <Card>
          <Stack>
            <Group justify="space-between" align="flex-start" wrap="nowrap">
              <div>
                <Text size="xs" c="dimmed" fw={600}>
                  Current weight
                </Text>
                <Text fz={40} fw={800} lh={1.1}>
                  {formatWeight(latest.weight_kg, units)}
                </Text>
                <Text size="xs" c="dimmed">
                  {dayjs(latest.measured_at).tz(timezone).format('ddd, MMM D · h:mm A')}
                </Text>
              </div>
              <Button variant="light" onClick={() => setLogOpen(true)}>
                Log weight
              </Button>
            </Group>
            <SimpleGrid cols={2} spacing="md" verticalSpacing="md">
              <StatTile
                label="7-day average"
                value={week.avgKg !== null ? formatWeight(week.avgKg, units) : '—'}
                hint={
                  week.avgKg !== null && week.date && week.date !== today
                    ? `As of ${formatShortDate(week.date, today)}`
                    : week.avgKg === null
                      ? 'No weigh-ins this week'
                      : undefined
                }
              />
              <StatTile
                label="Total change"
                value={g ? formatWeightDelta(latest.weight_kg - g.start_weight_kg, units) : '—'}
                hint={g ? `Since ${formatWeight(g.start_weight_kg, units)} start` : undefined}
              />
              <StatTile label="Starting weight" value={g ? formatWeight(g.start_weight_kg, units) : '—'} />
              <StatTile label="Goal weight" value={g ? formatWeight(g.target_weight_kg, units) : '—'} />
            </SimpleGrid>
            {g ? (
              <GoalBar
                startKg={g.start_weight_kg}
                targetKg={g.target_weight_kg}
                currentKg={latest.weight_kg}
              />
            ) : (
              <Text size="sm" c="dimmed">
                Set a starting and goal weight in{' '}
                <Text component={Link} to="/settings" c="lime" inherit>
                  Settings
                </Text>{' '}
                to see goal progress.
              </Text>
            )}
          </Stack>
        </Card>
      )}

      {latest && <PaceCard daily28={daily28} today={today} label={label} goal={g ?? null} />}
      <WeekCard today={today} />
    </Stack>
  );
}

function useTrendLatest(today: string) {
  const trend = useWeightTrend(addDays(today, -6), today);
  const last = trend.data?.at(-1);
  return { avgKg: last ? last.avg_7d : null, date: last?.local_date ?? null };
}

function PaceCard({
  daily28,
  today,
  label,
  goal,
}: {
  daily28: ReturnType<typeof lastNDays>;
  today: string;
  label: string;
  goal: { start_weight_kg: number; target_weight_kg: number } | null;
}) {
  const { units } = usePreferences();
  const reg = linearRegression(daily28);
  const enough = daily28.length >= MIN_WEIGH_INS && (reg?.spanDays ?? 0) >= MIN_SPAN_DAYS;
  const ratePerWeek = reg ? weightToDisplay(reg.slope * 7, units) : null;
  const estimate = goal ? estimateGoalDate(daily28, goal.target_weight_kg, goal.start_weight_kg) : null;

  return (
    <SectionCard title="Trend" description="Based on your daily weights over the last 28 days.">
      <SimpleGrid cols={2} spacing="md">
        <StatTile
          label="Rate of change"
          value={
            enough && ratePerWeek !== null ? `${formatSigned(ratePerWeek)} ${label}/wk` : 'Not enough data'
          }
          hint={
            !enough
              ? `${daily28.length} of ${MIN_WEIGH_INS} weigh-ins over ${MIN_SPAN_DAYS}+ days`
              : undefined
          }
        />
        <StatTile
          label="Estimated goal date"
          value={
            !estimate
              ? '—'
              : estimate.kind === 'range'
                ? `Around ${formatDateRange(estimate.earliest, estimate.latest, today)}`
                : estimate.kind === 'reached'
                  ? 'At your goal'
                  : 'Not enough data'
          }
          hint={
            !estimate
              ? 'Set a goal to estimate'
              : estimate.kind === 'not-toward-goal'
                ? "Recent trend isn't heading toward the goal"
                : estimate.kind === 'insufficient'
                  ? 'Needs 10 weigh-ins over 2+ weeks'
                  : undefined
          }
        />
      </SimpleGrid>
      {estimate?.kind === 'range' && (
        <Group gap={6} wrap="nowrap" align="flex-start">
          <IconInfoCircle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
          <Text size="xs" c="dimmed">
            A rough range from your recent pace and its day-to-day variation. Water, salt and routine changes
            move the scale, so treat it as a guide, not a deadline.
          </Text>
        </Group>
      )}
    </SectionCard>
  );
}

function WeekCard({ today }: { today: string }) {
  const weekStart = isoWeekStart(today);
  const summary = useWeeklySummary(weekStart);
  const { units } = usePreferences();
  const range = `${dayjs.utc(weekStart).format('MMM D')} – ${dayjs.utc(addDays(weekStart, 6)).format('MMM D')}`;
  return (
    <SectionCard title="This week" description={range}>
      {summary.isPending ? (
        <Skeleton h={120} />
      ) : summary.isError || !summary.data ? (
        <Text size="sm" c="dimmed">
          The weekly summary isn't available right now.
        </Text>
      ) : (
        <WeekStats s={summary.data} weightLabel={(kg) => formatWeight(kg, units)} />
      )}
    </SectionCard>
  );
}

function WeekStats({ s, weightLabel }: { s: WeeklySummary; weightLabel: (kg: number) => string }) {
  return (
    <SimpleGrid cols={{ base: 2, xs: 3 }} spacing="md" verticalSpacing="md">
      <StatTile
        label="Workouts"
        value={
          s.workouts_scheduled > 0
            ? `${s.workouts_completed} of ${s.workouts_scheduled}`
            : `${s.workouts_completed}`
        }
        hint={s.workouts_scheduled > 0 ? 'done of planned' : 'done'}
      />
      <StatTile label="Skipped" value={s.workouts_skipped} />
      <StatTile label="Rest days" value={s.rest_days} />
      <StatTile label="Cardio" value={`${s.cardio_minutes} min`} />
      <StatTile
        label="Meals"
        value={s.meals_planned > 0 ? `${s.meals_eaten} of ${s.meals_planned}` : `${s.meals_eaten}`}
        hint={s.meals_planned > 0 ? 'eaten of planned' : undefined}
      />
      <StatTile
        label="Water target"
        value={`${s.water_days_on_target} day${s.water_days_on_target === 1 ? '' : 's'}`}
      />
      <StatTile
        label="Weigh-ins"
        value={s.weigh_ins}
        hint={
          s.weight_start_kg !== null && s.weight_end_kg !== null && s.weigh_ins > 1
            ? `${weightLabel(s.weight_start_kg)} → ${weightLabel(s.weight_end_kg)}`
            : undefined
        }
      />
    </SimpleGrid>
  );
}
