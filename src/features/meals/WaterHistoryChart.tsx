import {
  Button,
  Group,
  Paper,
  SegmentedControl,
  Skeleton,
  Table,
  Text,
  useComputedColorScheme,
} from '@mantine/core';
import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { SectionCard } from '@/components/SectionCard';
import { usePreferences } from '@/features/profile/api';
import { dayjs, localDate } from '@/lib/time';
import { formatVolume, unitLabels, volumeToDisplay } from '@/lib/units';
import { useWaterHistory } from './api';
import { fillDailyTotals, totalMl, withDayTotal } from './water';

const SERIES = { dark: '#7d9e0e', light: '#6f8d00' } as const;

interface Point {
  date: string;
  label: string;
  value: number;
  ml: number;
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: Point }[] }) {
  const units = usePreferences().units;
  const point = active ? payload?.[0]?.payload : undefined;
  if (!point) return null;
  return (
    <Paper withBorder shadow="sm" p="xs" radius="md">
      <Text size="xs" c="dimmed">
        {dayjs(point.date).format('ddd, MMM D')}
      </Text>
      <Text size="sm" fw={700} className="tabular">
        {formatVolume(point.ml, units)}
      </Text>
    </Paper>
  );
}

export function WaterHistoryChart({ goalMl, todayTotalMl }: { goalMl: number | null; todayTotalMl: number }) {
  const { units, timezone } = usePreferences();
  const scheme = useComputedColorScheme('dark');
  const [range, setRange] = useState<'14' | '30'>('14');
  const [asTable, setAsTable] = useState(false);
  const today = localDate(timezone);
  const from = dayjs(today)
    .subtract(Number(range) - 1, 'day')
    .format('YYYY-MM-DD');
  const history = useWaterHistory(from, today);
  const unit = unitLabels(units).volume;

  // Today's bar includes entries still waiting to sync from this device.
  const rows = withDayTotal(fillDailyTotals(history.data ?? [], from, today), today, todayTotalMl);
  const data: Point[] = rows.map((r) => ({
    date: r.local_date,
    label: dayjs(r.local_date).format(range === '14' ? 'dd' : 'M/D'),
    value: volumeToDisplay(r.total_ml, units),
    ml: r.total_ml,
  }));
  const goal = goalMl ? volumeToDisplay(goalMl, units) : null;
  const max = Math.max(goal ?? 0, ...data.map((d) => d.value), 1);
  const loggedDays = rows.filter((r) => r.total_ml > 0);
  const averageMl = loggedDays.length
    ? totalMl(loggedDays.map((r) => ({ amount_ml: r.total_ml }))) / loggedDays.length
    : 0;

  return (
    <SectionCard
      title="History"
      description={
        loggedDays.length ? `About ${formatVolume(averageMl, units)} a day on days you logged` : undefined
      }
      action={
        <SegmentedControl
          size="sm"
          value={range}
          onChange={(v) => setRange(v as '14' | '30')}
          data={[
            { value: '14', label: '14d' },
            { value: '30', label: '30d' },
          ]}
          aria-label="History range"
        />
      }
    >
      {history.isPending ? (
        <Skeleton h={200} />
      ) : history.isError ? (
        <Text size="sm" c="dimmed">
          History isn&apos;t available right now.
        </Text>
      ) : asTable ? (
        <Table striped verticalSpacing={6} fz="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Day</Table.Th>
              <Table.Th ta="right">Total ({unit})</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {[...data].reverse().map((d) => (
              <Table.Tr key={d.date}>
                <Table.Td>{dayjs(d.date).format('ddd, MMM D')}</Table.Td>
                <Table.Td ta="right" className="tabular">
                  {d.value}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      ) : (
        <div style={{ width: '100%', height: 200 }} aria-label={`Daily water, last ${range} days`} role="img">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 16, right: 4, bottom: 0, left: 0 }} barCategoryGap={2}>
              <CartesianGrid vertical={false} stroke="var(--mantine-color-default-border)" strokeWidth={1} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                interval={range === '14' ? 0 : 'preserveStartEnd'}
                tick={{ fill: 'var(--mantine-color-dimmed)', fontSize: 11 }}
              />
              <YAxis
                width={40}
                tickLine={false}
                axisLine={false}
                domain={[0, Math.ceil(max * 1.1)]}
                allowDecimals={false}
                tick={{ fill: 'var(--mantine-color-dimmed)', fontSize: 11 }}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--mantine-color-default-hover)' }} />
              {goal != null && (
                <ReferenceLine
                  y={goal}
                  stroke="var(--mantine-color-dimmed)"
                  strokeDasharray="4 4"
                  label={{
                    value: `Target ${goal} ${unit}`,
                    position: 'insideTopLeft',
                    fill: 'var(--mantine-color-text)',
                    fontSize: 11,
                  }}
                />
              )}
              <Bar dataKey="value" fill={SERIES[scheme]} radius={[4, 4, 0, 0]} maxBarSize={24} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <Group justify="space-between">
        <Text size="xs" c="dimmed">
          Targets are personal — not medical advice.
        </Text>
        <Button variant="subtle" size="xs" onClick={() => setAsTable((v) => !v)}>
          {asTable ? 'Show chart' : 'Show table'}
        </Button>
      </Group>
    </SectionCard>
  );
}
