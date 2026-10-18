import { Button, Group, Modal, Paper, Progress, Stack, Text } from '@mantine/core';
import type { ReactNode } from 'react';
import { goalProgress } from './trend';

/** Label + value tile used in the overview and weekly summary. */
export function StatTile({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <Stack gap={2}>
      <Text size="xs" c="dimmed" fw={600}>
        {label}
      </Text>
      <Text fz="lg" fw={700}>
        {value}
      </Text>
      {hint && (
        <Text size="xs" c="dimmed">
          {hint}
        </Text>
      )}
    </Stack>
  );
}

export function ConfirmDeleteModal({
  opened,
  title,
  children,
  loading,
  onCancel,
  onConfirm,
}: {
  opened: boolean;
  title: string;
  children: ReactNode;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal opened={opened} onClose={onCancel} title={title} centered>
      <Stack>
        <Text size="sm">{children}</Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={onCancel}>
            Cancel
          </Button>
          <Button color="red" loading={loading} onClick={onConfirm}>
            Delete
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

export interface TooltipRow {
  key: string;
  label: string;
  value: string;
  swatch?: ReactNode;
}

/** Tooltip body for Recharts `content`: text in text colors, swatches carry identity. */
export function ChartTooltipCard({ title, rows }: { title: string; rows: TooltipRow[] }) {
  return (
    <Paper withBorder shadow="md" p="xs" radius="md">
      <Text size="xs" c="dimmed" mb={4}>
        {title}
      </Text>
      <Stack gap={2}>
        {rows.map((r) => (
          <Group key={r.key} gap={6} wrap="nowrap">
            {r.swatch}
            <Text size="sm">{r.label}</Text>
            <Text size="sm" fw={700} ml="auto" className="tabular">
              {r.value}
            </Text>
          </Group>
        ))}
      </Stack>
    </Paper>
  );
}

export const DotSwatch = ({ color }: { color: string }) => (
  <svg width={10} height={10} aria-hidden>
    <circle cx={5} cy={5} r={4} fill={color} />
  </svg>
);

export const LineSwatch = ({ color }: { color: string }) => (
  <svg width={16} height={10} aria-hidden>
    <line x1={1} y1={5} x2={15} y2={5} stroke={color} strokeWidth={2} strokeLinecap="round" />
  </svg>
);

export function GoalBar({
  startKg,
  targetKg,
  currentKg,
}: {
  startKg: number;
  targetKg: number;
  currentKg: number;
}) {
  const share = goalProgress(startKg, targetKg, currentKg);
  const pct = Math.round(share * 100);
  return (
    <Stack gap={4}>
      <Group justify="space-between">
        <Text size="sm" fw={600}>
          Goal progress
        </Text>
        <Text size="sm" c="dimmed" className="tabular">
          {pct}%
        </Text>
      </Group>
      <Progress value={pct} size="lg" radius="xl" aria-label={`Goal progress ${pct}%`} />
    </Stack>
  );
}
