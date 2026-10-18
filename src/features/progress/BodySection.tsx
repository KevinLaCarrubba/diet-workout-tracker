import {
  ActionIcon,
  Alert,
  Button,
  Card,
  Divider,
  Group,
  Modal,
  NumberInput,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconPencil, IconPlus, IconRuler, IconTrash } from '@tabler/icons-react';
import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';
import { SectionCard } from '@/components/SectionCard';
import { usePreferences } from '@/features/profile/api';
import { notifyError, notifySaved } from '@/lib/notify';
import { dayjs, localDate } from '@/lib/time';
import { lengthFromDisplay, lengthToDisplay, round, unitLabels, type UnitSystem } from '@/lib/units';
import {
  MEASUREMENT_FIELDS,
  useDeleteMeasurement,
  useMeasurements,
  useSaveMeasurement,
  type BodyMeasurement,
  type MeasurementField,
} from './api';
import { axisTick, useChartColors } from './chartTheme';
import { formatShortDate, formatSigned, fromLocalInput, toLocalInput } from './format';
import { ChartTooltipCard, ConfirmDeleteModal } from './ui';

const LABELS: Record<MeasurementField, string> = {
  waist_cm: 'Waist',
  chest_cm: 'Chest',
  hips_cm: 'Hips',
  arm_cm: 'Arm',
  thigh_cm: 'Thigh',
  body_fat_percent: 'Body fat',
};

/** DB check ranges, in cm (or %). */
const LIMITS: Record<MeasurementField, [number, number]> = {
  waist_cm: [20, 300],
  chest_cm: [20, 300],
  hips_cm: [20, 300],
  arm_cm: [5, 150],
  thigh_cm: [10, 200],
  body_fat_percent: [2, 75],
};

const isPercent = (f: MeasurementField) => f === 'body_fat_percent';
const toDisplay = (f: MeasurementField, v: number, units: UnitSystem) =>
  isPercent(f) ? round(v, 1) : lengthToDisplay(v, units);
const fromDisplay = (f: MeasurementField, v: number, units: UnitSystem) =>
  isPercent(f) ? round(v, 1) : lengthFromDisplay(v, units);
const unitOf = (f: MeasurementField, units: UnitSystem) => (isPercent(f) ? '%' : unitLabels(units).length);
const formatValue = (f: MeasurementField, v: number, units: UnitSystem) =>
  `${toDisplay(f, v, units)}${isPercent(f) ? '%' : ` ${unitLabels(units).length}`}`;

export function BodySection() {
  const { units, timezone } = usePreferences();
  const today = localDate(timezone);
  const list = useMeasurements();
  const remove = useDeleteMeasurement();
  const [editing, setEditing] = useState<BodyMeasurement | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<BodyMeasurement | null>(null);

  return (
    <Stack>
      <MeasurementModal
        opened={adding || editing !== null}
        entry={editing}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
      />
      <ConfirmDeleteModal
        opened={deleting !== null}
        title="Delete measurements?"
        loading={remove.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() =>
          deleting &&
          remove.mutate(deleting.id, {
            onSuccess: () => {
              notifySaved('Measurements deleted');
              setDeleting(null);
            },
            onError: notifyError,
          })
        }
      >
        {deleting &&
          `The entry from ${dayjs(deleting.measured_at).tz(timezone).format('MMM D, YYYY')} will be removed.`}
      </ConfirmDeleteModal>

      <Button size="lg" leftSection={<IconPlus size={20} />} onClick={() => setAdding(true)}>
        Add measurements
      </Button>

      {list.isPending ? (
        <Skeleton h={240} radius="lg" />
      ) : list.isError ? (
        <Alert color="red">Couldn't load your measurements.</Alert>
      ) : list.data.length === 0 ? (
        <Card>
          <Stack align="center" ta="center" py="md">
            <IconRuler size={36} stroke={1.5} />
            <Text fw={700}>No measurements yet</Text>
            <Text size="sm" c="dimmed">
              Measurements are optional. Log any of waist, chest, hips, arm, thigh or body fat — just the ones
              you track.
            </Text>
          </Stack>
        </Card>
      ) : (
        <>
          <SmallMultiples rows={list.data} units={units} timezone={timezone} today={today} />
          <SectionCard title="History">
            <Stack gap={0}>
              {list.data.map((m, i) => (
                <Fragment key={m.id}>
                  {i > 0 && <Divider />}
                  <Group justify="space-between" wrap="nowrap" py="xs" gap="xs" align="flex-start">
                    <div style={{ minWidth: 0 }}>
                      <Text size="sm" fw={600}>
                        {dayjs(m.measured_at).tz(timezone).format('ddd, MMM D, YYYY')}
                      </Text>
                      <Text size="sm" c="dimmed">
                        {MEASUREMENT_FIELDS.filter((f) => m[f] !== null)
                          .map((f) => `${LABELS[f]} ${formatValue(f, Number(m[f]), units)}`)
                          .join(' · ')}
                      </Text>
                      {m.notes && (
                        <Text size="xs" c="dimmed" lineClamp={2}>
                          {m.notes}
                        </Text>
                      )}
                    </div>
                    <Group gap={4} wrap="nowrap">
                      <ActionIcon size="xl" aria-label="Edit measurements" onClick={() => setEditing(m)}>
                        <IconPencil size={20} />
                      </ActionIcon>
                      <ActionIcon
                        size="xl"
                        color="gray"
                        aria-label="Delete measurements"
                        onClick={() => setDeleting(m)}
                      >
                        <IconTrash size={20} />
                      </ActionIcon>
                    </Group>
                  </Group>
                </Fragment>
              ))}
            </Stack>
          </SectionCard>
        </>
      )}
    </Stack>
  );
}

function SmallMultiples({
  rows,
  units,
  timezone,
  today,
}: {
  rows: BodyMeasurement[];
  units: UnitSystem;
  timezone: string;
  today: string;
}) {
  const series = useMemo(
    () =>
      MEASUREMENT_FIELDS.map((field) => ({
        field,
        points: rows
          .filter((r) => r[field] !== null)
          .map((r) => ({
            x: dayjs(r.measured_at).valueOf(),
            date: dayjs(r.measured_at).tz(timezone).format('YYYY-MM-DD'),
            value: toDisplay(field, Number(r[field]), units),
          }))
          .sort((a, b) => a.x - b.x),
      })).filter((s) => s.points.length > 0),
    [rows, units, timezone],
  );
  return (
    <SimpleGrid cols={{ base: 1, xs: 2 }}>
      {series.map((s) => (
        <MeasurementCard key={s.field} field={s.field} points={s.points} units={units} today={today} />
      ))}
    </SimpleGrid>
  );
}

function MeasurementCard({
  field,
  points,
  units,
  today,
}: {
  field: MeasurementField;
  points: { x: number; date: string; value: number }[];
  units: UnitSystem;
  today: string;
}) {
  const c = useChartColors();
  const unit = unitOf(field, units);
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const change = last.value - first.value;
  const renderTooltip = ({ active, payload }: TooltipContentProps) => {
    const p = active ? (payload?.[0]?.payload as (typeof points)[number] | undefined) : undefined;
    if (!p) return null;
    return (
      <ChartTooltipCard
        title={formatShortDate(p.date, today)}
        rows={[{ key: 'v', label: LABELS[field], value: `${p.value}${unit === '%' ? '%' : ` ${unit}`}` }]}
      />
    );
  };
  return (
    <Card>
      <Group justify="space-between" align="flex-start" mb={4}>
        <div>
          <Text size="sm" fw={700}>
            {LABELS[field]}
          </Text>
          <Text size="xs" c="dimmed">
            {points.length > 1
              ? `${formatSigned(change)} ${unit} since ${formatShortDate(first.date, today)}`
              : formatShortDate(last.date, today)}
          </Text>
        </div>
        <Text fw={800} fz="lg">
          {last.value}
          {unit === '%' ? '%' : ` ${unit}`}
        </Text>
      </Group>
      {points.length > 1 ? (
        <div
          role="img"
          aria-label={`${LABELS[field]} over time, ${points.length} entries, latest ${last.value} ${unit}`}
        >
          <ResponsiveContainer width="100%" height={110}>
            <LineChart data={points} margin={{ top: 6, right: 6, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={c.grid} vertical={false} />
              <XAxis dataKey="x" type="number" scale="time" domain={['dataMin', 'dataMax']} hide />
              <YAxis
                domain={[(min: number) => Math.floor(min - 1), (max: number) => Math.ceil(max + 1)]}
                tick={axisTick(c)}
                tickLine={false}
                axisLine={false}
                width={32}
                tickCount={3}
                allowDecimals={false}
              />
              <Tooltip content={renderTooltip} cursor={{ stroke: c.grid }} />
              <Line
                dataKey="value"
                stroke={c.series1}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                dot={
                  points.length <= 12 ? { r: 4, fill: c.series1, stroke: c.surface, strokeWidth: 2 } : false
                }
                activeDot={{ r: 5, fill: c.series1, stroke: c.surface, strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <Text size="xs" c="dimmed">
          Add another entry to see a trend.
        </Text>
      )}
    </Card>
  );
}

type FormValues = { at: string; notes: string } & Record<MeasurementField, number | ''>;

function MeasurementModal({
  opened,
  onClose,
  entry,
}: {
  opened: boolean;
  onClose: () => void;
  entry: BodyMeasurement | null;
}) {
  const { units, timezone } = usePreferences();
  const save = useSaveMeasurement();
  const blank = Object.fromEntries(MEASUREMENT_FIELDS.map((f) => [f, ''])) as Record<MeasurementField, ''>;
  const form = useForm<FormValues>({
    initialValues: { at: '', notes: '', ...blank },
    validate: (values) => {
      const errors: Record<string, string> = {};
      if (!values.at) errors.at = 'Pick a date and time';
      const filled = MEASUREMENT_FIELDS.filter((f) => values[f] !== '');
      if (filled.length === 0) errors.waist_cm = 'Enter at least one measurement';
      for (const f of filled) {
        const v = fromDisplay(f, Number(values[f]), units);
        const [lo, hi] = LIMITS[f];
        if (v < lo || v > hi) {
          errors[f] =
            `Between ${toDisplay(f, lo, units)} and ${toDisplay(f, hi, units)}${isPercent(f) ? '%' : ` ${unitLabels(units).length}`}`;
        }
      }
      if (values.notes.length > 500) errors.notes = 'Keep notes under 500 characters';
      return errors;
    },
  });

  useEffect(() => {
    if (!opened) return;
    const values = Object.fromEntries(
      MEASUREMENT_FIELDS.map((f) => [
        f,
        entry && entry[f] !== null ? toDisplay(f, Number(entry[f]), units) : '',
      ]),
    ) as Record<MeasurementField, number | ''>;
    form.setValues({
      ...values,
      at: toLocalInput(entry?.measured_at ?? new Date().toISOString(), timezone),
      notes: entry?.notes ?? '',
    });
    form.resetDirty();
    form.clearErrors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, entry, units, timezone]);

  const submit = form.onSubmit((v) => {
    const values = Object.fromEntries(
      MEASUREMENT_FIELDS.map((f) => [f, v[f] === '' ? null : fromDisplay(f, Number(v[f]), units)]),
    ) as Record<MeasurementField, number | null>;
    save.mutate(
      {
        id: entry?.id,
        ...values,
        measured_at: fromLocalInput(v.at, timezone),
        notes: v.notes.trim() || null,
      },
      {
        onSuccess: () => {
          notifySaved(entry ? 'Measurements updated' : 'Measurements saved');
          onClose();
        },
        onError: notifyError,
      },
    );
  });

  const len = unitLabels(units).length;
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={entry ? 'Edit measurements' : 'Add measurements'}
      centered
    >
      <form onSubmit={submit}>
        <Stack>
          <Text size="sm" c="dimmed">
            Fill in only what you measure.
          </Text>
          <SimpleGrid cols={2}>
            {MEASUREMENT_FIELDS.map((f) => (
              <NumberInput
                key={f}
                label={`${LABELS[f]} (${isPercent(f) ? '%' : len})`}
                decimalScale={1}
                inputMode="decimal"
                hideControls
                min={0}
                {...form.getInputProps(f)}
              />
            ))}
          </SimpleGrid>
          <TextInput type="datetime-local" label="When" size="md" {...form.getInputProps('at')} />
          <Textarea
            label="Note (optional)"
            autosize
            minRows={2}
            maxLength={500}
            {...form.getInputProps('notes')}
          />
          <Button type="submit" size="lg" loading={save.isPending}>
            {entry ? 'Save changes' : 'Save measurements'}
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}
