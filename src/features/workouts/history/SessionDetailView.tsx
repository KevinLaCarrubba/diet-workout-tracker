import { Badge, Card, Group, SimpleGrid, Stack, Text } from '@mantine/core';
import { IconArrowsExchange, IconTrophy } from '@tabler/icons-react';
import { dayjs, formatDuration } from '@/lib/time';
import { formatWeight, unitLabels, weightToDisplay, type UnitSystem } from '@/lib/units';
import { E1RM_DISCLAIMER, describeRecord, recordLabels } from '../records/recordFormat';
import { targetLabel } from '../session/draft';
import { exerciseBadges, type DetailExercise, type DetailSet, type SessionDetail } from './historyModel';

function setValue(s: DetailSet, e: DetailExercise, units: UnitSystem) {
  const w = s.weight_kg ? `${weightToDisplay(s.weight_kg, units)} ${unitLabels(units).weight}` : null;
  if (e.rep_mode === 'timed') {
    const held = s.duration_seconds != null ? `${s.duration_seconds}s` : '–';
    return w ? `${w} × ${held}` : held;
  }
  const reps = s.reps != null ? `${s.reps} ${s.reps === 1 ? 'rep' : 'reps'}` : '–';
  return w ? `${w} × ${s.reps ?? '–'}` : reps;
}

function SetLine({
  set,
  index,
  exercise,
  units,
}: {
  set: DetailSet;
  index: number;
  exercise: DetailExercise;
  units: UnitSystem;
}) {
  return (
    <Group justify="space-between" wrap="nowrap" gap="xs" align="flex-start">
      <Group gap="xs" wrap="nowrap" align="flex-start" style={{ minWidth: 0 }}>
        {set.is_warmup ? (
          <Badge size="sm" variant="outline" color="gray" w={36} title="Warm-up">
            W
          </Badge>
        ) : (
          <Badge size="sm" variant="light" color="gray" w={36} className="tabular">
            {index}
          </Badge>
        )}
        <div style={{ minWidth: 0 }}>
          <Group gap={6}>
            <Text fw={600} className="tabular" c={set.is_warmup ? 'dimmed' : undefined}>
              {setValue(set, exercise, units)}
            </Text>
            {exercise.rep_mode === 'amrap' && !set.is_warmup && (
              <Badge size="xs" variant="light">
                AMRAP
              </Badge>
            )}
            {set.is_warmup && (
              <Text size="xs" c="dimmed">
                warm-up
              </Text>
            )}
          </Group>
          {set.notes && (
            <Text size="xs" c="dimmed">
              {set.notes}
            </Text>
          )}
        </div>
      </Group>
      {set.rpe != null && (
        <Text size="sm" c="dimmed" className="tabular" style={{ flexShrink: 0 }}>
          RPE {set.rpe}
        </Text>
      )}
    </Group>
  );
}

function ExerciseCard({
  exercise,
  units,
  names,
}: {
  exercise: DetailExercise;
  units: UnitSystem;
  names: Map<string, string>;
}) {
  const done = exercise.sets.filter((s) => s.completed_at);
  const skipped = exercise.sets.length - done.length;
  const original = exercise.substituted_for_exercise_id
    ? names.get(exercise.substituted_for_exercise_id)
    : undefined;
  const numbers = done.map((s, i) =>
    s.is_warmup ? 0 : done.slice(0, i + 1).filter((x) => !x.is_warmup).length,
  );
  return (
    <Card>
      <Stack gap="xs">
        <div>
          <Text fw={700}>{exercise.exercise_name_snapshot}</Text>
          <Text size="sm" c="dimmed">
            {targetLabel(exercise)}
          </Text>
        </div>
        {(exerciseBadges(exercise).length > 0 || exercise.substituted_for_exercise_id) && (
          <Group gap={6}>
            {exerciseBadges(exercise).map((b) => (
              <Badge key={b} size="sm" variant="light" color="blue">
                {b}
              </Badge>
            ))}
            {exercise.substituted_for_exercise_id && (
              <Badge size="sm" variant="light" color="gray" leftSection={<IconArrowsExchange size={12} />}>
                {original ? `Swapped in for ${original}` : 'Substituted'}
              </Badge>
            )}
          </Group>
        )}
        {exercise.notes && (
          <Text size="sm" c="dimmed" fs="italic">
            {exercise.notes}
          </Text>
        )}
        {done.length === 0 ? (
          <Text size="sm" c="dimmed">
            No sets logged.
          </Text>
        ) : (
          <Stack gap={8}>
            {done.map((s, i) => (
              <SetLine key={s.id} set={s} index={numbers[i]!} exercise={exercise} units={units} />
            ))}
          </Stack>
        )}
        {skipped > 0 && done.length > 0 && (
          <Text size="xs" c="dimmed">
            {skipped} planned {skipped === 1 ? 'set' : 'sets'} not logged
          </Text>
        )}
      </Stack>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card p="sm">
      <Text size="xs" c="dimmed" fw={700} tt="uppercase">
        {label}
      </Text>
      <Text fw={800} fz={18} className="tabular">
        {value}
      </Text>
    </Card>
  );
}

/** Read-only view of one finished workout. */
export function SessionDetailView({
  detail,
  units,
  timezone,
  names,
}: {
  detail: SessionDetail;
  units: UnitSystem;
  timezone: string;
  /** Exercise id → current catalog name (for "swapped in for …"). */
  names: Map<string, string>;
}) {
  const loggedNames = new Map(
    detail.exercises.filter((e) => e.exercise_id).map((e) => [e.exercise_id!, e.exercise_name_snapshot]),
  );
  const nameOf = (id: string) => loggedNames.get(id) ?? names.get(id) ?? 'Exercise';
  return (
    <Stack>
      <Text c="dimmed" size="sm">
        {dayjs(detail.started_at).tz(timezone).format('dddd, MMM D, YYYY · h:mm A')}
      </Text>
      <SimpleGrid cols={3} spacing="xs">
        <Stat
          label="Time"
          value={detail.duration_seconds != null ? formatDuration(detail.duration_seconds) : '–'}
        />
        <Stat label="Sets" value={String(detail.total_sets)} />
        <Stat label="Volume" value={formatWeight(detail.total_volume_kg, units)} />
      </SimpleGrid>

      {detail.records.length > 0 && (
        <Card>
          <Group gap="xs" mb="xs">
            <IconTrophy size={20} color="var(--mantine-color-yellow-5)" />
            <Text fw={700}>Personal records this workout</Text>
          </Group>
          <Stack gap={8}>
            {detail.records.map((r, i) => (
              <Group key={i} justify="space-between" wrap="nowrap" align="flex-start">
                <div style={{ minWidth: 0 }}>
                  <Text size="sm" fw={600}>
                    {nameOf(r.exercise_id)}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {recordLabels[r.record_type]}
                  </Text>
                </div>
                <Text fw={700} className="tabular" ta="right">
                  {describeRecord(r, units)}
                </Text>
              </Group>
            ))}
          </Stack>
          {detail.records.some((r) => r.record_type === 'estimated_1rm') && (
            <Text size="xs" c="dimmed" mt="sm">
              {E1RM_DISCLAIMER}.
            </Text>
          )}
        </Card>
      )}

      {detail.notes && (
        <Card>
          <Text size="xs" c="dimmed" fw={700} tt="uppercase" mb={4}>
            Notes
          </Text>
          <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
            {detail.notes}
          </Text>
        </Card>
      )}

      {detail.exercises.length === 0 ? (
        <Card>
          <Text c="dimmed" size="sm">
            No exercises were logged in this workout.
          </Text>
        </Card>
      ) : (
        detail.exercises.map((e) => <ExerciseCard key={e.id} exercise={e} units={units} names={names} />)
      )}
    </Stack>
  );
}
