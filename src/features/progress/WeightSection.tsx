import {
  ActionIcon,
  Alert,
  Button,
  Card,
  Divider,
  Group,
  SegmentedControl,
  Skeleton,
  Stack,
  Text,
} from '@mantine/core';
import { IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';
import { Fragment, useMemo, useState } from 'react';
import { SectionCard } from '@/components/SectionCard';
import { useCurrentGoal, usePreferences } from '@/features/profile/api';
import { notifyError, notifySaved } from '@/lib/notify';
import { dayjs, localDate } from '@/lib/time';
import { formatWeight } from '@/lib/units';
import { useDeleteWeight, useWeightLogs, type WeightLog } from './api';
import { dailyWeights, trailingAverage } from './trend';
import { ConfirmDeleteModal } from './ui';
import { WeighInModal } from './WeighInModal';
import { WeightChart } from './WeightChart';

const RANGES = [
  { label: '30 days', value: '30' },
  { label: '90 days', value: '90' },
  { label: '1 year', value: '365' },
];
const PAGE = 30;

export function WeightSection() {
  const { units, timezone } = usePreferences();
  const today = localDate(timezone);
  const logs = useWeightLogs();
  const goal = useCurrentGoal();
  const remove = useDeleteWeight();
  const [range, setRange] = useState('90');
  const [editing, setEditing] = useState<WeightLog | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<WeightLog | null>(null);
  const [shown, setShown] = useState(PAGE);

  const trend = useMemo(
    () => trailingAverage(dailyWeights(logs.data ?? [], timezone)),
    [logs.data, timezone],
  );

  return (
    <Stack>
      <WeighInModal
        opened={adding || editing !== null}
        entry={editing}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
      />
      <ConfirmDeleteModal
        opened={deleting !== null}
        title="Delete weigh-in?"
        loading={remove.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() =>
          deleting &&
          remove.mutate(deleting.id, {
            onSuccess: () => {
              notifySaved('Weigh-in deleted');
              setDeleting(null);
            },
            onError: notifyError,
          })
        }
      >
        {deleting &&
          `${formatWeight(deleting.weight_kg, units)} on ${dayjs(deleting.measured_at).tz(timezone).format('MMM D, YYYY h:mm A')} will be removed.`}
      </ConfirmDeleteModal>

      <Button size="lg" leftSection={<IconPlus size={20} />} onClick={() => setAdding(true)}>
        Log weight
      </Button>

      <Card>
        <Stack gap="sm">
          <Text fw={700}>Weight trend</Text>
          <SegmentedControl
            fullWidth
            value={range}
            onChange={setRange}
            data={RANGES}
            aria-label="Chart range"
          />
          {logs.isPending ? (
            <Skeleton h={260} />
          ) : (
            <WeightChart
              trend={trend}
              today={today}
              days={Number(range)}
              units={units}
              goalKg={goal.data?.target_weight_kg ?? null}
            />
          )}
          <Text size="xs" c="dimmed">
            Each day uses your last weigh-in. The average covers the 7 calendar days ending that day.
          </Text>
        </Stack>
      </Card>

      <SectionCard title="History">
        {logs.isPending ? (
          <Skeleton h={160} />
        ) : logs.isError ? (
          <Alert color="red">Couldn't load your weigh-ins.</Alert>
        ) : logs.data.length === 0 ? (
          <Text size="sm" c="dimmed">
            No weigh-ins yet. Your entries will show up here.
          </Text>
        ) : (
          <Stack gap={0}>
            {logs.data.slice(0, shown).map((w, i) => (
              <Fragment key={w.id}>
                {i > 0 && <Divider />}
                <Group justify="space-between" wrap="nowrap" py="xs" gap="xs">
                  <div style={{ minWidth: 0 }}>
                    <Text fw={700} className="tabular">
                      {formatWeight(w.weight_kg, units)}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {dayjs(w.measured_at).tz(timezone).format('ddd, MMM D, YYYY · h:mm A')}
                    </Text>
                    {w.notes && (
                      <Text size="sm" c="dimmed" lineClamp={2}>
                        {w.notes}
                      </Text>
                    )}
                  </div>
                  <Group gap={4} wrap="nowrap">
                    <ActionIcon size="xl" aria-label="Edit weigh-in" onClick={() => setEditing(w)}>
                      <IconPencil size={20} />
                    </ActionIcon>
                    <ActionIcon
                      size="xl"
                      color="gray"
                      aria-label="Delete weigh-in"
                      onClick={() => setDeleting(w)}
                    >
                      <IconTrash size={20} />
                    </ActionIcon>
                  </Group>
                </Group>
              </Fragment>
            ))}
            {logs.data.length > shown && (
              <Button variant="subtle" mt="xs" onClick={() => setShown((n) => n + PAGE)}>
                Show more
              </Button>
            )}
          </Stack>
        )}
      </SectionCard>
    </Stack>
  );
}
