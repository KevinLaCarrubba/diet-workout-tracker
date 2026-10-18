import {
  Alert,
  Badge,
  Button,
  Card,
  Center,
  Container,
  Group,
  Loader,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { IconTrophy } from '@tabler/icons-react';
import { Link, Navigate, useParams } from 'react-router';
import { StatusIndicator } from '@/components/StatusIndicator';
import { usePreferences } from '@/features/profile/api';
import { formatDuration } from '@/lib/time';
import { formatWeight, weightToDisplay, unitLabels } from '@/lib/units';
import type { PersonalRecordEvent } from '@/offline/types';
import { useSyncStore } from '@/stores/syncStore';
import { elapsedSeconds, sessionStats } from './draft';
import { useDraft } from './hooks';

const recordLabels: Record<PersonalRecordEvent['record_type'], string> = {
  max_weight: 'Heaviest weight',
  max_reps_at_weight: 'Most reps at weight',
  estimated_1rm: 'Estimated 1RM',
  session_volume: 'Best session volume',
};

export function WorkoutSummaryPage() {
  const { sessionId } = useParams();
  const { data: draft, loading } = useDraft(sessionId);
  const { units } = usePreferences();
  const pending = useSyncStore((s) => s.pending);

  if (loading) {
    return (
      <Center h="100dvh">
        <Loader />
      </Center>
    );
  }
  if (!draft) return <Navigate to={`/workouts/history/${sessionId}`} replace />;
  if (draft.status === 'in_progress') return <Navigate to={`/workouts/session/${draft.id}`} replace />;

  const stats = sessionStats(draft);
  const names = new Map(draft.exercises.map((e) => [e.exercise_id, e.exercise_name_snapshot]));
  const records = draft.records ?? [];
  const synced = records.length > 0 || pending === 0;

  const describe = (r: PersonalRecordEvent) => {
    const w = unitLabels(units).weight;
    switch (r.record_type) {
      case 'max_weight':
        return formatWeight(Number(r.value), units);
      case 'max_reps_at_weight':
        return `${r.reps} reps @ ${weightToDisplay(Number(r.weight_kg), units)} ${w}`;
      case 'estimated_1rm':
        return `≈ ${formatWeight(Number(r.value), units)} (estimate)`;
      case 'session_volume':
        return formatWeight(Number(r.value), units);
    }
  };

  return (
    <Container size={520} py="xl" px="md" mih="100dvh">
      <Stack>
        <Group justify="space-between">
          <Badge size="lg" variant="light">
            Workout complete
          </Badge>
          <StatusIndicator />
        </Group>
        <Title order={1} fz={30}>
          {draft.title}
        </Title>
        <SimpleGrid cols={3}>
          <Card>
            <Text size="xs" c="dimmed" fw={700}>
              TIME
            </Text>
            <Text fw={800} fz={20} className="tabular">
              {formatDuration(elapsedSeconds(draft))}
            </Text>
          </Card>
          <Card>
            <Text size="xs" c="dimmed" fw={700}>
              SETS
            </Text>
            <Text fw={800} fz={20} className="tabular">
              {stats.sets}
            </Text>
          </Card>
          <Card>
            <Text size="xs" c="dimmed" fw={700}>
              VOLUME
            </Text>
            <Text fw={800} fz={20} className="tabular" style={{ whiteSpace: 'nowrap' }}>
              {Math.round(weightToDisplay(stats.volumeKg, units)).toLocaleString()}
              <Text span fz="sm" c="dimmed" fw={600}>
                {' '}
                {unitLabels(units).weight}
              </Text>
            </Text>
          </Card>
        </SimpleGrid>

        {records.length > 0 ? (
          <Card>
            <Group gap="xs" mb="xs">
              <IconTrophy size={20} color="var(--mantine-color-yellow-5)" />
              <Text fw={700}>New personal records</Text>
            </Group>
            <Stack gap={6}>
              {records.map((r, i) => (
                <Group key={i} justify="space-between" wrap="nowrap">
                  <div>
                    <Text size="sm" fw={600}>
                      {names.get(r.exercise_id) ?? 'Exercise'}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {recordLabels[r.record_type]}
                    </Text>
                  </div>
                  <Text fw={700} className="tabular">
                    {describe(r)}
                  </Text>
                </Group>
              ))}
            </Stack>
            <Text size="xs" c="dimmed" mt="sm">
              Estimated 1RM uses the Epley formula and is an estimate, not a tested max.
            </Text>
          </Card>
        ) : !synced ? (
          <Alert variant="light" color="blue">
            Saved on this device. It will upload automatically when you're online, and any new records will
            show in your history.
          </Alert>
        ) : null}

        <Button component={Link} to="/" size="lg">
          Done
        </Button>
        <Button component={Link} to={`/workouts/history/${draft.id}`} variant="subtle">
          View details
        </Button>
      </Stack>
    </Container>
  );
}
