import { Group, Text } from '@mantine/core';
import { useMemo } from 'react';
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';
import { dayjs } from '@/lib/time';
import { unitLabels, weightToDisplay, type UnitSystem } from '@/lib/units';
import { addDays } from './calendar';
import { axisTick, useChartColors } from './chartTheme';
import type { TrendPoint } from './trend';
import { ChartTooltipCard, DotSwatch, LineSwatch } from './ui';

interface Point {
  x: number;
  date: string;
  weight: number;
  avg: number;
  entries: number;
}

const toX = (date: string) => dayjs.utc(date).valueOf();

export function WeightChart({
  trend,
  today,
  days,
  units,
  goalKg,
}: {
  trend: TrendPoint[];
  today: string;
  days: number;
  units: UnitSystem;
  goalKg: number | null;
}) {
  const c = useChartColors();
  const label = unitLabels(units).weight;
  const from = addDays(today, -(days - 1));
  const data = useMemo<Point[]>(
    () =>
      trend
        .filter((p) => p.date >= from && p.date <= today)
        .map((p) => ({
          x: toX(p.date),
          date: p.date,
          weight: weightToDisplay(p.weightKg, units),
          avg: weightToDisplay(p.avg7d, units),
          entries: p.entries7d,
        })),
    [trend, from, today, units],
  );
  const goal = goalKg === null ? null : weightToDisplay(goalKg, units);

  if (data.length === 0) {
    return (
      <Text size="sm" c="dimmed" ta="center" py="xl">
        No weigh-ins in this range yet.
      </Text>
    );
  }

  const renderTooltip = ({ active, payload }: TooltipContentProps) => {
    const p = active ? (payload?.[0]?.payload as Point | undefined) : undefined;
    if (!p) return null;
    return (
      <ChartTooltipCard
        title={dayjs.utc(p.date).format('ddd, MMM D, YYYY')}
        rows={[
          {
            key: 'w',
            label: 'Weigh-in',
            value: `${p.weight} ${label}`,
            swatch: <DotSwatch color={c.muted} />,
          },
          {
            key: 'a',
            label: `7-day avg (${p.entries} day${p.entries === 1 ? '' : 's'})`,
            value: `${p.avg} ${label}`,
            swatch: <LineSwatch color={c.series1} />,
          },
        ]}
      />
    );
  };

  return (
    <div>
      <Group gap="md" mb="xs" aria-hidden>
        <Group gap={6}>
          <DotSwatch color={c.muted} />
          <Text size="xs" c="dimmed">
            Daily weigh-in
          </Text>
        </Group>
        <Group gap={6}>
          <LineSwatch color={c.series1} />
          <Text size="xs" c="dimmed">
            7-day average
          </Text>
        </Group>
        {goal !== null && (
          <Group gap={6}>
            <LineSwatch color={c.textDim} />
            <Text size="xs" c="dimmed">
              Goal
            </Text>
          </Group>
        )}
      </Group>
      <div
        role="img"
        aria-label={`Weight over the last ${days} days: ${data.length} weigh-in days, latest 7-day average ${data[data.length - 1]!.avg} ${label}`}
      >
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={c.grid} vertical={false} />
            <XAxis
              dataKey="x"
              type="number"
              scale="time"
              domain={[toX(from), toX(today)]}
              tickFormatter={(v: number) => dayjs.utc(v).format(days > 120 ? 'MMM' : 'MMM D')}
              tick={axisTick(c)}
              tickLine={false}
              axisLine={{ stroke: c.grid }}
              tickCount={5}
              minTickGap={24}
            />
            <YAxis
              domain={[(min: number) => Math.floor(min - 1), (max: number) => Math.ceil(max + 1)]}
              tick={axisTick(c)}
              tickLine={false}
              axisLine={false}
              width={40}
              allowDecimals={false}
            />
            {goal !== null && (
              <ReferenceLine
                y={goal}
                stroke={c.textDim}
                strokeWidth={1}
                ifOverflow="extendDomain"
                label={{ value: `Goal ${goal}`, position: 'insideTopRight', fill: c.textDim, fontSize: 12 }}
              />
            )}
            <Tooltip content={renderTooltip} cursor={{ stroke: c.grid, strokeWidth: 1 }} />
            <Line
              dataKey="weight"
              stroke="none"
              isAnimationActive={false}
              dot={{ r: 4, fill: c.muted, stroke: c.surface, strokeWidth: 2 }}
              activeDot={{ r: 6, fill: c.muted, stroke: c.surface, strokeWidth: 2 }}
            />
            <Line
              dataKey="avg"
              type="monotone"
              stroke={c.series1}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={false}
              activeDot={{ r: 5, fill: c.series1, stroke: c.surface, strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
