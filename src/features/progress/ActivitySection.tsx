import { ActionIcon, Alert, Box, Group, SimpleGrid, Skeleton, Stack, Text } from '@mantine/core';
import {
  IconArrowForwardUp,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconMinus,
  IconMoon,
  IconPlayerSkipForward,
  IconPoint,
} from '@tabler/icons-react';
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';
import { SectionCard } from '@/components/SectionCard';
import { usePreferences, useSettings } from '@/features/profile/api';
import { dayjs, localDate } from '@/lib/time';
import { formatVolume } from '@/lib/units';
import { useAdherenceMonth, useCardioBetween, useWaterDays } from './api';
import {
  addDays,
  dayState,
  monthGrid,
  recentWeekStarts,
  sumByWeek,
  type DayState,
  type ScheduledLike,
} from './calendar';
import { axisTick, useChartColors } from './chartTheme';
import { ChartTooltipCard } from './ui';

const WEEKS = 8;

export function ActivitySection() {
  const { timezone } = usePreferences();
  const today = localDate(timezone);
  return (
    <Stack>
      <AdherenceCalendar today={today} />
      <CardioWeeks today={today} />
      <WaterWeeks today={today} />
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Adherence calendar
// ---------------------------------------------------------------------------

const STATE_META: Record<Exclude<DayState, 'none'>, { label: string; icon: ReactNode }> = {
  completed: { label: 'Completed', icon: <IconCheck size={14} stroke={3} /> },
  upcoming: { label: 'Planned', icon: <IconPoint size={14} stroke={3} /> },
  'not-logged': { label: 'Not logged', icon: <IconMinus size={14} /> },
  skipped: { label: 'Skipped', icon: <IconPlayerSkipForward size={14} /> },
  rescheduled: { label: 'Moved', icon: <IconArrowForwardUp size={14} /> },
  rest: { label: 'Rest day', icon: <IconMoon size={14} /> },
};

function cellStyle(state: DayState): CSSProperties {
  switch (state) {
    case 'completed':
      return {
        background: 'var(--mantine-primary-color-filled)',
        color: 'var(--mantine-primary-color-contrast)',
      };
    case 'upcoming':
      return { border: '2px solid var(--mantine-color-blue-filled)', color: 'var(--mantine-color-text)' };
    case 'not-logged':
      return { border: '1px dashed var(--mantine-color-dimmed)', color: 'var(--mantine-color-dimmed)' };
    case 'skipped':
      return { background: 'var(--mantine-color-default-hover)', color: 'var(--mantine-color-dimmed)' };
    case 'rescheduled':
      return { color: 'var(--mantine-color-dimmed)' };
    case 'rest':
      return {
        background: 'var(--mantine-color-blue-light)',
        color: 'var(--mantine-color-blue-light-color)',
      };
    default:
      return { color: 'var(--mantine-color-dimmed)' };
  }
}

function AdherenceCalendar({ today }: { today: string }) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const query = useAdherenceMonth(month);
  const grid = useMemo(() => monthGrid(month), [month]);
  const byDate = useMemo(() => {
    const map = new Map<string, ScheduledLike[]>();
    for (const s of query.data?.scheduled ?? []) {
      map.set(s.local_date, [...(map.get(s.local_date) ?? []), s]);
    }
    return map;
  }, [query.data]);
  const shift = (n: number) => setMonth(dayjs.utc(`${month}-01`).add(n, 'month').format('YYYY-MM'));
  const counts = useMemo(() => {
    const c: Partial<Record<DayState, number>> = {};
    for (const date of grid.flat()) {
      if (!date) continue;
      const st = dayState(date, today, byDate.get(date) ?? [], query.data?.completedByDate[date] ?? 0);
      c[st] = (c[st] ?? 0) + 1;
    }
    return c;
  }, [grid, byDate, query.data, today]);

  return (
    <SectionCard
      title="Workout calendar"
      action={
        <Group gap={4} wrap="nowrap">
          <ActionIcon size="xl" aria-label="Previous month" onClick={() => shift(-1)}>
            <IconChevronLeft size={20} />
          </ActionIcon>
          <ActionIcon size="xl" aria-label="Next month" onClick={() => shift(1)}>
            <IconChevronRight size={20} />
          </ActionIcon>
        </Group>
      }
      description={dayjs.utc(`${month}-01`).format('MMMM YYYY')}
    >
      {query.isError ? (
        <Alert color="red">Couldn't load your schedule for this month.</Alert>
      ) : query.isPending ? (
        <Skeleton h={300} />
      ) : (
        <Stack gap="sm">
          <Box
            role="grid"
            aria-label={`Workouts in ${dayjs.utc(`${month}-01`).format('MMMM YYYY')}`}
            style={{ opacity: query.isPlaceholderData ? 0.6 : 1 }}
          >
            <SimpleGrid cols={7} spacing={4} verticalSpacing={4} role="row">
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                <Text key={i} size="xs" c="dimmed" ta="center" fw={600} role="columnheader">
                  {d}
                </Text>
              ))}
            </SimpleGrid>
            {grid.map((row, r) => (
              <SimpleGrid key={r} cols={7} spacing={4} mt={4} role="row">
                {row.map((date, i) => {
                  if (!date) return <div key={i} role="gridcell" />;
                  const state = dayState(
                    date,
                    today,
                    byDate.get(date) ?? [],
                    query.data.completedByDate[date] ?? 0,
                  );
                  const meta = state === 'none' ? null : STATE_META[state];
                  return (
                    <Box
                      key={date}
                      role="gridcell"
                      aria-label={`${dayjs.utc(date).format('dddd, MMMM D')}: ${meta?.label ?? 'Nothing planned'}${date === today ? ' (today)' : ''}`}
                      style={{
                        ...cellStyle(state),
                        minHeight: 44,
                        borderRadius: 'var(--mantine-radius-md)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 0,
                        outline: date === today ? '2px solid var(--mantine-color-text)' : undefined,
                        outlineOffset: 1,
                      }}
                    >
                      <Text size="xs" fw={date === today ? 800 : 600} inherit lh={1.2}>
                        {Number(date.slice(8))}
                      </Text>
                      <Box h={14} style={{ display: 'flex' }} aria-hidden>
                        {meta?.icon}
                      </Box>
                    </Box>
                  );
                })}
              </SimpleGrid>
            ))}
          </Box>
          <SimpleGrid cols={{ base: 2, xs: 3 }} spacing={6} verticalSpacing={6}>
            {(Object.keys(STATE_META) as (keyof typeof STATE_META)[]).map((state) => (
              <Group key={state} gap={6} wrap="nowrap">
                <Box
                  aria-hidden
                  w={22}
                  h={22}
                  style={{
                    ...cellStyle(state),
                    borderRadius: 6,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {STATE_META[state].icon}
                </Box>
                <Text size="xs">
                  {STATE_META[state].label}
                  <Text span c="dimmed" inherit>
                    {' '}
                    {counts[state] ?? 0}
                  </Text>
                </Text>
              </Group>
            ))}
          </SimpleGrid>
        </Stack>
      )}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Weekly bar charts
// ---------------------------------------------------------------------------

interface WeekBar {
  week: string;
  label: string;
  value: number;
  current: boolean;
}

function WeeklyBars({
  data,
  color,
  unit,
  yMax,
  title,
}: {
  data: WeekBar[];
  color: string;
  unit: (v: number) => string;
  yMax?: number;
  title: string;
}) {
  const c = useChartColors();
  const renderTooltip = ({ active, payload }: TooltipContentProps) => {
    const p = active ? (payload?.[0]?.payload as WeekBar | undefined) : undefined;
    if (!p) return null;
    return (
      <ChartTooltipCard
        title={`Week of ${dayjs.utc(p.week).format('MMM D')}${p.current ? ' (so far)' : ''}`}
        rows={[{ key: 'v', label: title, value: unit(p.value) }]}
      />
    );
  };
  const summary = data.map((d) => `${d.label}: ${unit(d.value)}`).join(', ');
  return (
    <div role="img" aria-label={`${title} per week. ${summary}`}>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap="20%">
          <CartesianGrid stroke={c.grid} vertical={false} />
          <XAxis
            dataKey="label"
            tick={axisTick(c)}
            tickLine={false}
            axisLine={{ stroke: c.grid }}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[0, yMax ?? 'auto']}
            allowDecimals={false}
            tick={axisTick(c)}
            tickLine={false}
            axisLine={false}
            width={36}
          />
          <Tooltip content={renderTooltip} cursor={{ fill: c.grid, fillOpacity: 0.4 }} />
          <Bar dataKey="value" fill={color} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function useWeeks(today: string) {
  return useMemo(() => {
    const starts = recentWeekStarts(today, WEEKS);
    return { starts, from: starts[0]!, to: addDays(starts[WEEKS - 1]!, 6) };
  }, [today]);
}

function CardioWeeks({ today }: { today: string }) {
  const c = useChartColors();
  const { starts, from, to } = useWeeks(today);
  const cardio = useCardioBetween(from, to);
  const data = useMemo(() => {
    const totals = sumByWeek(
      cardio.data ?? [],
      starts,
      (s) => s.date,
      (s) => s.seconds,
    );
    return starts.map((week, i) => ({
      week,
      label: dayjs.utc(week).format('MMM D'),
      value: Math.round(totals[i]! / 60),
      current: i === starts.length - 1,
    }));
  }, [cardio.data, starts]);
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <SectionCard title="Cardio minutes" description={`Per week, last ${WEEKS} weeks`}>
      {cardio.isPending ? (
        <Skeleton h={180} />
      ) : cardio.isError ? (
        <Alert color="red">Couldn't load cardio history.</Alert>
      ) : total === 0 ? (
        <Text size="sm" c="dimmed">
          No cardio logged in the last {WEEKS} weeks.
        </Text>
      ) : (
        <WeeklyBars data={data} color={c.series1} unit={(v) => `${v} min`} title="Cardio" />
      )}
    </SectionCard>
  );
}

function WaterWeeks({ today }: { today: string }) {
  const c = useChartColors();
  const { units } = usePreferences();
  const settings = useSettings();
  const { starts, from, to } = useWeeks(today);
  const water = useWaterDays(from, to);
  const goal = settings.data?.water_goal_ml ?? null;
  const data = useMemo(() => {
    const onTarget = (water.data ?? []).filter((d) => goal !== null && d.total_ml >= goal);
    const totals = sumByWeek(
      onTarget,
      starts,
      (d) => d.local_date,
      () => 1,
    );
    return starts.map((week, i) => ({
      week,
      label: dayjs.utc(week).format('MMM D'),
      value: totals[i]!,
      current: i === starts.length - 1,
    }));
  }, [water.data, starts, goal]);
  return (
    <SectionCard
      title="Water target"
      description={goal ? `Days reaching ${formatVolume(goal, units)}, per week` : 'Days on target per week'}
    >
      {water.isPending || settings.isPending ? (
        <Skeleton h={180} />
      ) : water.isError ? (
        <Alert color="red">Couldn't load water history.</Alert>
      ) : (water.data ?? []).length === 0 ? (
        <Text size="sm" c="dimmed">
          No water logged in the last {WEEKS} weeks.
        </Text>
      ) : (
        <WeeklyBars
          data={data}
          color={c.series2}
          unit={(v) => `${v} of 7 days`}
          yMax={7}
          title="Days on target"
        />
      )}
    </SectionCard>
  );
}
