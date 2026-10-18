import { Button, Paper, Table, Text, useComputedColorScheme } from '@mantine/core';
import { useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { dayjs } from '@/lib/time';
import { unitLabels, weightToDisplay, type UnitSystem } from '@/lib/units';
import type { ProgressionPoint } from './recordsModel';

// Validated series-1 color per theme (see agent brief / dataviz palette check).
const SERIES = { dark: '#7d9e0e', light: '#6f8d00' } as const;

interface Datum extends ProgressionPoint {
  y: number;
}

function ChartTooltip({
  active,
  payload,
  units,
  timezone,
}: {
  active?: boolean;
  payload?: { payload: Datum }[];
  units: UnitSystem;
  timezone: string;
}) {
  const d = payload?.[0]?.payload;
  if (!active || !d) return null;
  const w = unitLabels(units).weight;
  return (
    <Paper withBorder shadow="sm" p="xs" radius="sm">
      <Text size="xs" c="dimmed">
        {dayjs(d.t).tz(timezone).format('ddd, MMM D, YYYY')}
      </Text>
      <Text size="sm" fw={700} className="tabular">
        ≈ {d.y} {w} est. 1RM
      </Text>
      <Text size="xs" c="dimmed" className="tabular">
        from {weightToDisplay(d.weight_kg, units)} {w} × {d.reps}
      </Text>
    </Paper>
  );
}

/** Estimated 1RM per session over time (one series, so no legend). */
export function ProgressionChart({
  points,
  units,
  timezone,
}: {
  points: ProgressionPoint[];
  units: UnitSystem;
  timezone: string;
}) {
  const scheme = useComputedColorScheme('dark');
  const color = SERIES[scheme];
  const [showTable, setShowTable] = useState(false);
  const data: Datum[] = points.map((p) => ({ ...p, y: weightToDisplay(p.e1rm_kg, units) }));
  const w = unitLabels(units).weight;
  const tick = { fill: 'var(--mantine-color-dimmed)', fontSize: 12 };

  return (
    <div>
      <div style={{ width: '100%', height: 220 }} role="img" aria-label={`Estimated 1RM over time in ${w}`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--mantine-color-default-border)" strokeWidth={1} />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              padding={{ left: 16, right: 16 }}
              tickFormatter={(t: number) => dayjs(t).tz(timezone).format('MMM D')}
              tick={tick}
              tickLine={false}
              axisLine={{ stroke: 'var(--mantine-color-default-border)' }}
              minTickGap={24}
            />
            <YAxis
              dataKey="y"
              width={44}
              tick={tick}
              tickLine={false}
              axisLine={false}
              domain={['auto', 'auto']}
              allowDecimals={false}
            />
            <Tooltip
              cursor={{ stroke: 'var(--mantine-color-dimmed)', strokeWidth: 1 }}
              content={<ChartTooltip units={units} timezone={timezone} />}
            />
            <Line
              type="monotone"
              dataKey="y"
              stroke={color}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={{ r: 4, fill: color, stroke: 'var(--mantine-color-body)', strokeWidth: 2 }}
              activeDot={{ r: 6, fill: color, stroke: 'var(--mantine-color-body)', strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <Button variant="subtle" size="sm" onClick={() => setShowTable((v) => !v)} mt={4}>
        {showTable ? 'Hide values' : 'Show values'}
      </Button>
      {showTable && (
        <Table striped withRowBorders={false} fz="sm" className="tabular">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Date</Table.Th>
              <Table.Th>Est. 1RM</Table.Th>
              <Table.Th>Best set</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {[...data].reverse().map((d) => (
              <Table.Tr key={d.session_id}>
                <Table.Td>{dayjs(d.t).tz(timezone).format('MMM D, YYYY')}</Table.Td>
                <Table.Td>
                  ≈ {d.y} {w}
                </Table.Td>
                <Table.Td>
                  {weightToDisplay(d.weight_kg, units)} × {d.reps}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </div>
  );
}
