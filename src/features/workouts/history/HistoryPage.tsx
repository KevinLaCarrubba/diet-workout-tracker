import { Alert, Badge, Button, Card, Group, Skeleton, Stack, Text, UnstyledButton } from '@mantine/core';
import { IconChevronRight, IconCloudUpload, IconHistory, IconRun, IconTrophy } from '@tabler/icons-react';
import { Link } from 'react-router';
import { PageHeader } from '@/components/PageHeader';
import { usePreferences } from '@/features/profile/api';
import { dayjs } from '@/lib/time';
import { formatWeight } from '@/lib/units';
import { useHistory } from './api';
import { formatMinutes, type HistoryItem } from './historyModel';

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Text size="xs" c="dimmed" fw={700} tt="uppercase">
        {label}
      </Text>
      <Text fw={700} className="tabular">
        {value}
      </Text>
    </div>
  );
}

function HistoryCard({ item }: { item: HistoryItem }) {
  const { units, timezone } = usePreferences();
  return (
    <UnstyledButton component={Link} to={`/workouts/history/${item.id}`} aria-label={`Open ${item.title}`}>
      <Card>
        <Stack gap="xs">
          <Group justify="space-between" wrap="nowrap" align="flex-start">
            <div style={{ minWidth: 0 }}>
              <Text fw={700} truncate>
                {item.title}
              </Text>
              <Text size="sm" c="dimmed">
                {dayjs(item.started_at).tz(timezone).format('ddd, MMM D, YYYY · h:mm A')}
              </Text>
            </div>
            <IconChevronRight size={20} color="var(--mantine-color-dimmed)" style={{ flexShrink: 0 }} />
          </Group>
          <Group gap="lg">
            <Stat label="Time" value={formatMinutes(item.duration_seconds)} />
            <Stat label="Sets" value={String(item.total_sets)} />
            <Stat label="Volume" value={formatWeight(item.total_volume_kg, units)} />
          </Group>
          {(item.pr_count > 0 || item.pending) && (
            <Group gap="xs">
              {item.pr_count > 0 && (
                <Badge color="yellow" variant="light" leftSection={<IconTrophy size={12} />}>
                  {item.pr_count} {item.pr_count === 1 ? 'record' : 'records'}
                </Badge>
              )}
              {item.pending && (
                <Badge color="blue" variant="light" leftSection={<IconCloudUpload size={12} />}>
                  Saved on this device · will sync
                </Badge>
              )}
            </Group>
          )}
        </Stack>
      </Card>
    </UnstyledButton>
  );
}

export function HistoryPage() {
  const { query, items, localLoading } = useHistory();
  const loading = (query.isPending && items.length === 0) || localLoading;

  return (
    <Stack>
      <PageHeader
        title="History"
        subtitle="Your completed workouts"
        action={
          <Button component={Link} to="/workouts/cardio" variant="light" leftSection={<IconRun size={18} />}>
            Cardio
          </Button>
        }
      />

      {query.isError && (
        <Alert color={items.length > 0 ? 'blue' : 'red'} variant="light" title="Couldn't load your history">
          {items.length > 0
            ? 'Showing workouts saved on this device. The rest will appear when you are back online.'
            : 'Check your connection and try again.'}
          <Button variant="subtle" size="sm" mt="xs" onClick={() => void query.refetch()}>
            Try again
          </Button>
        </Alert>
      )}

      {loading ? (
        <Stack>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} h={128} radius="md" />
          ))}
        </Stack>
      ) : items.length === 0 && !query.isError ? (
        <Card>
          <Stack align="center" gap="xs" py="lg">
            <IconHistory size={36} color="var(--mantine-color-dimmed)" />
            <Text fw={700}>No workouts yet</Text>
            <Text size="sm" c="dimmed" ta="center">
              Finished workouts show up here with their sets, volume and any new records.
            </Text>
            <Button component={Link} to="/workouts" mt="xs">
              Start a workout
            </Button>
          </Stack>
        </Card>
      ) : (
        <Stack gap="sm">
          {items.map((item) => (
            <HistoryCard key={item.id} item={item} />
          ))}
          {query.hasNextPage && (
            <Button
              variant="default"
              size="md"
              loading={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              Load more
            </Button>
          )}
        </Stack>
      )}
    </Stack>
  );
}
