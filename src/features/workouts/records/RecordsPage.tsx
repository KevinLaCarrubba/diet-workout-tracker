import {
  Alert,
  Button,
  Card,
  Drawer,
  Group,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from '@mantine/core';
import { IconChevronRight, IconSearch, IconTrophy } from '@tabler/icons-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { PageHeader } from '@/components/PageHeader';
import { usePreferences } from '@/features/profile/api';
import { dayjs } from '@/lib/time';
import { formatWeight, unitLabels, weightToDisplay, type UnitSystem } from '@/lib/units';
import { usePersonalRecords, useStrengthProgression } from './api';
import { ProgressionChart } from './ProgressionChart';
import { E1RM_DISCLAIMER } from './recordFormat';
import { bestRecordsByExercise, filterByName, type BestRecord, type ExerciseRecords } from './recordsModel';

function RecordTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card p="sm" withBorder>
      <Text size="xs" c="dimmed" fw={700} tt="uppercase">
        {label}
      </Text>
      <Text fw={800} fz={18} className="tabular">
        {value}
      </Text>
      {hint && (
        <Text size="xs" c="dimmed">
          {hint}
        </Text>
      )}
    </Card>
  );
}

const repsAt = (r: BestRecord, units: UnitSystem) =>
  `${r.reps ?? r.value} @ ${weightToDisplay(r.weight_kg ?? 0, units)} ${unitLabels(units).weight}`;

function ExerciseRecordsPanel({
  entry,
  units,
  timezone,
}: {
  entry: ExerciseRecords;
  units: UnitSystem;
  timezone: string;
}) {
  const progression = useStrengthProgression(entry.exercise_id);
  const when = (r?: BestRecord) => (r ? dayjs(r.achieved_at).tz(timezone).format('MMM D, YYYY') : undefined);
  const { max_weight, estimated_1rm, max_reps_at_weight, session_volume } = entry.best;

  return (
    <Stack>
      <SimpleGrid cols={2} spacing="xs">
        <RecordTile
          label="Heaviest weight"
          value={max_weight ? formatWeight(max_weight.value, units) : '–'}
          hint={when(max_weight)}
        />
        <RecordTile
          label="Estimated 1RM"
          value={estimated_1rm ? `≈ ${formatWeight(estimated_1rm.value, units)}` : '–'}
          hint={estimated_1rm ? `${when(estimated_1rm)} · estimate` : undefined}
        />
        <RecordTile
          label="Most reps at a weight"
          value={max_reps_at_weight ? repsAt(max_reps_at_weight, units) : '–'}
          hint={when(max_reps_at_weight)}
        />
        <RecordTile
          label="Best session volume"
          value={session_volume ? formatWeight(session_volume.value, units) : '–'}
          hint={when(session_volume)}
        />
      </SimpleGrid>
      <Text size="xs" c="dimmed">
        {E1RM_DISCLAIMER}.
      </Text>

      {entry.repsAtWeight.length > 1 && (
        <Card withBorder>
          <Text fw={700} mb="xs">
            Most reps at each weight
          </Text>
          <Stack gap={6}>
            {entry.repsAtWeight.map((r) => (
              <Group key={r.weight_kg ?? 0} justify="space-between">
                <Text size="sm" className="tabular">
                  {formatWeight(r.weight_kg ?? 0, units)}
                </Text>
                <Text size="sm" fw={600} className="tabular">
                  {r.reps ?? r.value} reps
                </Text>
              </Group>
            ))}
          </Stack>
        </Card>
      )}

      <Card withBorder>
        <Text fw={700}>Estimated 1RM per workout ({unitLabels(units).weight})</Text>
        <Text size="xs" c="dimmed" mb="sm">
          Best Epley estimate from each workout's working sets of 1–12 reps.
        </Text>
        {progression.isPending ? (
          <Skeleton h={220} />
        ) : progression.isError ? (
          <Alert color="red" variant="light">
            Couldn't load your progression. Check your connection.
          </Alert>
        ) : progression.data.length === 0 ? (
          <Text size="sm" c="dimmed">
            Log sets of 1–12 reps to see your strength trend here.
          </Text>
        ) : (
          <ProgressionChart points={progression.data} units={units} timezone={timezone} />
        )}
      </Card>

      <Button component={Link} to={`/workouts/exercises/${entry.exercise_id}`} variant="default">
        Exercise details
      </Button>
    </Stack>
  );
}

function ExerciseRow({
  entry,
  units,
  onOpen,
}: {
  entry: ExerciseRecords;
  units: UnitSystem;
  onOpen: () => void;
}) {
  const { max_weight, estimated_1rm } = entry.best;
  return (
    <UnstyledButton onClick={onOpen} aria-label={`${entry.name} records`}>
      <Card>
        <Group justify="space-between" wrap="nowrap">
          <div style={{ minWidth: 0 }}>
            <Text fw={700} truncate>
              {entry.name}
            </Text>
            <Group gap="md" mt={4}>
              <div>
                <Text size="xs" c="dimmed">
                  Heaviest
                </Text>
                <Text size="sm" fw={600} className="tabular">
                  {max_weight ? formatWeight(max_weight.value, units) : '–'}
                </Text>
              </div>
              <div>
                <Text size="xs" c="dimmed">
                  Est. 1RM
                </Text>
                <Text size="sm" fw={600} className="tabular">
                  {estimated_1rm ? `≈ ${formatWeight(estimated_1rm.value, units)}` : '–'}
                </Text>
              </div>
            </Group>
          </div>
          <IconChevronRight size={20} color="var(--mantine-color-dimmed)" style={{ flexShrink: 0 }} />
        </Group>
      </Card>
    </UnstyledButton>
  );
}

export function RecordsPage() {
  const { units, timezone } = usePreferences();
  const records = usePersonalRecords();
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const all = bestRecordsByExercise(records.data ?? []);
  const shown = filterByName(all, search);
  const open = all.find((e) => e.exercise_id === openId) ?? null;

  return (
    <Stack>
      <PageHeader title="Records" subtitle="Your best lifts, per exercise" />

      {records.isPending ? (
        <Stack>
          <Skeleton h={42} />
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} h={84} />
          ))}
        </Stack>
      ) : records.isError ? (
        <Alert color="red" variant="light" title="Couldn't load your records">
          Check your connection and try again.
          <Button variant="subtle" size="sm" mt="xs" onClick={() => void records.refetch()}>
            Try again
          </Button>
        </Alert>
      ) : all.length === 0 ? (
        <Card>
          <Stack align="center" gap="xs" py="lg">
            <IconTrophy size={36} color="var(--mantine-color-dimmed)" />
            <Text fw={700}>No records yet</Text>
            <Text size="sm" c="dimmed" ta="center">
              Records appear after you repeat an exercise and beat a previous best — heavier weight, more reps
              or more volume.
            </Text>
          </Stack>
        </Card>
      ) : (
        <>
          <TextInput
            placeholder="Search exercises"
            aria-label="Search exercises"
            leftSection={<IconSearch size={16} />}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            size="md"
          />
          {shown.length === 0 ? (
            <Text c="dimmed" ta="center" py="md">
              No exercises match “{search}”.
            </Text>
          ) : (
            <Stack gap="sm">
              {shown.map((e) => (
                <ExerciseRow
                  key={e.exercise_id}
                  entry={e}
                  units={units}
                  onOpen={() => setOpenId(e.exercise_id)}
                />
              ))}
            </Stack>
          )}
        </>
      )}

      <Drawer
        opened={!!open}
        onClose={() => setOpenId(null)}
        position="bottom"
        size="92%"
        title={<Text fw={700}>{open?.name}</Text>}
        radius="md"
      >
        {open && <ExerciseRecordsPanel entry={open} units={units} timezone={timezone} />}
      </Drawer>
    </Stack>
  );
}
