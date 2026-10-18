import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Modal,
  Skeleton,
  Stack,
  Text,
  UnstyledButton,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconCloudUpload, IconPlus, IconRun } from '@tabler/icons-react';
import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { useUserId } from '@/features/auth/useAuth';
import { usePreferences } from '@/features/profile/api';
import { notifyError, notifySaved } from '@/lib/notify';
import { dayjs, localDate } from '@/lib/time';
import type { UnitSystem } from '@/lib/units';
import { useCardioSessions, useDeleteCardio, useSaveCardio } from './api';
import { CardioForm } from './CardioForm';
import {
  activityName,
  buildCardioRow,
  distanceUnit,
  emptyCardioForm,
  formatCardioDuration,
  formatPace,
  groupByWeek,
  kphToSpeed,
  metersToDistance,
  rowToForm,
  speedUnit,
  weekLabel,
  type CardioFormValues,
  type CardioItem,
} from './cardioModel';

function CardioRowCard({
  item,
  units,
  timezone,
  onOpen,
}: {
  item: CardioItem;
  units: UnitSystem;
  timezone: string;
  onOpen: () => void;
}) {
  const details = [
    formatCardioDuration(item.duration_seconds),
    item.distance_meters != null
      ? `${metersToDistance(Number(item.distance_meters), units)} ${distanceUnit(units)}`
      : null,
    formatPace(item.pace_seconds_per_km, units),
    item.speed_kph != null ? `${kphToSpeed(Number(item.speed_kph), units)} ${speedUnit(units)}` : null,
    item.incline_percent != null ? `${Number(item.incline_percent)}% incline` : null,
    item.resistance_level != null ? `level ${Number(item.resistance_level)}` : null,
    item.avg_heart_rate != null ? `avg ${item.avg_heart_rate} bpm` : null,
  ].filter(Boolean);
  return (
    <UnstyledButton onClick={onOpen} aria-label={`Edit ${activityName(item)}`}>
      <Card p="sm">
        <Group justify="space-between" wrap="nowrap" align="flex-start">
          <div style={{ minWidth: 0 }}>
            <Text fw={700}>{activityName(item)}</Text>
            <Text size="sm" c="dimmed">
              {dayjs(item.occurred_at).tz(timezone).format('ddd, MMM D · h:mm A')}
            </Text>
            <Text size="sm" className="tabular" mt={2}>
              {details.join(' · ')}
            </Text>
            {item.notes && (
              <Text size="xs" c="dimmed" lineClamp={2} mt={2}>
                {item.notes}
              </Text>
            )}
          </div>
          {item.pending && (
            <Badge
              color="blue"
              variant="light"
              leftSection={<IconCloudUpload size={12} />}
              style={{ flexShrink: 0 }}
            >
              Will sync
            </Badge>
          )}
        </Group>
      </Card>
    </UnstyledButton>
  );
}

type Editing = { id: string; values: CardioFormValues; isNew: boolean } | null;

export function CardioPage() {
  const userId = useUserId();
  const { units, timezone } = usePreferences();
  const { query, items, localLoading } = useCardioSessions();
  const save = useSaveCardio();
  const remove = useDeleteCardio();
  const [editing, setEditing] = useState<Editing>(null);
  const mobile = useMediaQuery('(max-width: 36em)');

  const today = localDate(timezone);
  const weeks = groupByWeek(items, timezone);
  const loading = (query.isPending && items.length === 0) || localLoading;

  const openNew = () =>
    setEditing({ id: crypto.randomUUID(), values: emptyCardioForm(timezone), isNew: true });
  const openEdit = (item: CardioItem) =>
    setEditing({ id: item.id, values: rowToForm(item, units, timezone), isNew: false });

  const submit = (values: CardioFormValues) => {
    if (!editing) return;
    save.mutate(buildCardioRow(values, { id: editing.id, userId, units, timezone }), {
      onSuccess: () => {
        setEditing(null);
        notifySaved(navigator.onLine ? 'Cardio saved' : 'Saved on this device · will sync');
      },
      onError: notifyError,
    });
  };

  const onDelete = () => {
    if (!editing) return;
    remove.mutate(editing.id, {
      onSuccess: () => {
        setEditing(null);
        notifySaved('Entry deleted');
      },
      onError: notifyError,
    });
  };

  return (
    <Stack>
      <PageHeader
        title="Cardio"
        subtitle="Walks, runs, machines and more"
        action={
          <Button leftSection={<IconPlus size={18} />} onClick={openNew}>
            Log
          </Button>
        }
      />

      {query.isError && (
        <Alert color={items.length > 0 ? 'blue' : 'red'} variant="light" title="Couldn't load your cardio">
          {items.length > 0
            ? 'Showing entries saved on this device. The rest will appear when you are back online.'
            : 'Check your connection and try again.'}
          <Button variant="subtle" size="sm" mt="xs" onClick={() => void query.refetch()}>
            Try again
          </Button>
        </Alert>
      )}

      {loading ? (
        <Stack>
          <Skeleton h={24} w="40%" />
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} h={88} />
          ))}
        </Stack>
      ) : weeks.length === 0 && !query.isError ? (
        <Card>
          <Stack align="center" gap="xs" py="lg">
            <IconRun size={36} color="var(--mantine-color-dimmed)" />
            <Text fw={700}>No cardio logged yet</Text>
            <Text size="sm" c="dimmed" ta="center">
              Log a walk, run, StairMaster climb or any other session. It saves on your phone even without
              reception.
            </Text>
            <Button mt="xs" leftSection={<IconPlus size={18} />} onClick={openNew}>
              Log cardio
            </Button>
          </Stack>
        </Card>
      ) : (
        <Stack gap="lg">
          {weeks.map((week) => (
            <Stack
              key={week.weekStart}
              gap="xs"
              component="section"
              aria-label={weekLabel(week.weekStart, today)}
            >
              <Group justify="space-between" align="baseline">
                <Text fw={700}>{weekLabel(week.weekStart, today)}</Text>
                <Text size="sm" c="dimmed" className="tabular">
                  {Math.round(week.totalSeconds / 60)} min
                  {week.totalMeters > 0 &&
                    ` · ${metersToDistance(week.totalMeters, units)} ${distanceUnit(units)}`}
                </Text>
              </Group>
              {week.items.map((item) => (
                <CardioRowCard
                  key={item.id}
                  item={item}
                  units={units}
                  timezone={timezone}
                  onOpen={() => openEdit(item)}
                />
              ))}
            </Stack>
          ))}
          {query.hasNextPage && (
            <Button
              variant="default"
              loading={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              Load more
            </Button>
          )}
        </Stack>
      )}

      <Modal
        opened={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.isNew ? 'Log cardio' : 'Edit cardio'}
        fullScreen={mobile}
        size="lg"
      >
        {editing && (
          <CardioForm
            key={editing.id}
            initialValues={editing.values}
            units={units}
            saving={save.isPending}
            onSubmit={submit}
            onDelete={editing.isNew ? undefined : onDelete}
          />
        )}
      </Modal>
    </Stack>
  );
}
