import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Menu,
  Modal,
  Select,
  Skeleton,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { TimeInput } from '@mantine/dates';
import {
  IconArrowBackUp,
  IconCalendarEvent,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconDots,
  IconMoon,
  IconPlayerPlay,
  IconPlayerSkipForward,
} from '@tabler/icons-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { PageHeader } from '@/components/PageHeader';
import { SectionCard } from '@/components/SectionCard';
import { usePreferences } from '@/features/profile/api';
import { notifyError, notifySaved } from '@/lib/notify';
import { dayjs, formatLocalTime, localDate } from '@/lib/time';
import { useTemplates, type TemplateWithExercises } from '../api';
import { useActiveDraft, useStartWorkout } from '../session/hooks';
import {
  useRescheduleLinks,
  useRescheduleWorkout,
  useSaveScheduleRule,
  useScheduledWorkouts,
  useScheduleRules,
  useSetScheduledStatus,
  type ScheduledWorkout,
  type ScheduleLink,
} from './api';
import {
  dayState,
  formatWeekLabel,
  planRuleChange,
  ruleChoice,
  WEEKDAY_NAMES,
  weekRange,
  type PlanChoice,
  type Rule,
  type WeekDay,
} from './week';

const shortWhen = (link: Pick<ScheduleLink, 'local_date' | 'local_time'>) =>
  `${dayjs(link.local_date).format('ddd MMM D')}${link.local_time ? `, ${formatLocalTime(link.local_time)}` : ''}`;

function RescheduleModal({
  workout,
  today,
  onClose,
}: {
  workout: ScheduledWorkout | null;
  today: string;
  onClose: () => void;
}) {
  const reschedule = useRescheduleWorkout();
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [lastId, setLastId] = useState<string | null>(null);

  // Reset the fields whenever a different workout is opened.
  if (workout && workout.id !== lastId) {
    setLastId(workout.id);
    setDate(workout.local_date < today ? today : workout.local_date);
    setTime(workout.local_time?.slice(0, 5) ?? '');
  }

  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date);
  const submit = () => {
    if (!workout || !valid) return;
    reschedule.mutate(
      { original: workout, date, time: time || null },
      {
        onSuccess: () => {
          notifySaved(`Moved to ${shortWhen({ local_date: date, local_time: time || null })}`);
          onClose();
        },
        onError: notifyError,
      },
    );
  };

  return (
    <Modal opened={!!workout} onClose={onClose} title="Move workout" centered>
      <Stack>
        <Text size="sm" c="dimmed">
          {workout?.template?.title ?? 'Workout'} · currently {workout ? shortWhen(workout) : ''}
        </Text>
        <TextInput
          type="date"
          label="New date"
          size="md"
          value={date}
          onChange={(e) => setDate(e.currentTarget.value)}
          error={date && !valid ? 'Pick a date' : undefined}
        />
        <TimeInput
          label="Start time"
          description="Leave empty for any time that day"
          size="md"
          value={time}
          onChange={(e) => setTime(e.currentTarget.value)}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={reschedule.isPending} disabled={!valid}>
            Move
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function StateBadge({ row, movedTo }: { row: ScheduledWorkout; movedTo?: ScheduleLink }) {
  switch (dayState(row)) {
    case 'completed':
      return (
        <Badge color="lime" variant="filled" leftSection={<IconCheck size={12} />}>
          Done
        </Badge>
      );
    case 'skipped':
      return (
        <Badge color="gray" variant="light">
          Skipped
        </Badge>
      );
    case 'rescheduled':
      return (
        <Badge color="blue" variant="light">
          {movedTo ? `Moved to ${dayjs(movedTo.local_date).format('ddd')}` : 'Moved'}
        </Badge>
      );
    case 'rest':
      return (
        <Badge color="gray" variant="outline" leftSection={<IconMoon size={12} />}>
          Rest
        </Badge>
      );
    default:
      return (
        <Badge color="lime" variant="outline">
          Planned
        </Badge>
      );
  }
}

function ScheduledRow({
  row,
  template,
  links,
  canStart,
  starting,
  isToday,
  onStart,
  onMove,
}: {
  row: ScheduledWorkout;
  template: TemplateWithExercises | undefined;
  links: { movedTo: Map<string, ScheduleLink>; byId: Map<string, ScheduleLink> } | undefined;
  canStart: boolean;
  starting: boolean;
  isToday: boolean;
  onStart: () => void;
  onMove: () => void;
}) {
  const setStatus = useSetScheduledStatus();
  const state = dayState(row);
  const movedTo = links?.movedTo.get(row.id);
  const movedFrom = row.rescheduled_from ? links?.byId.get(row.rescheduled_from) : undefined;
  const title = state === 'rest' ? 'Rest day' : (row.template?.title ?? 'Workout');
  const update = (status: 'scheduled' | 'skipped') =>
    setStatus.mutate(
      { id: row.id, status },
      {
        onSuccess: () => notifySaved(status === 'skipped' ? 'Skipped — enjoy the break' : 'Back on the plan'),
        onError: notifyError,
      },
    );

  const detail =
    state === 'rest'
      ? 'Recovery counts too.'
      : state === 'rescheduled'
        ? movedTo
          ? `Moved to ${shortWhen(movedTo)}`
          : 'Moved to another day'
        : [
            row.local_time ? formatLocalTime(row.local_time) : 'Any time',
            movedFrom ? `moved from ${dayjs(movedFrom.local_date).format('ddd')}` : null,
          ]
            .filter(Boolean)
            .join(' · ');

  return (
    <Stack gap="xs">
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <div style={{ minWidth: 0, opacity: state === 'rescheduled' || state === 'skipped' ? 0.65 : 1 }}>
          <Text fw={700} truncate>
            {title}
          </Text>
          <Text size="sm" c="dimmed">
            {detail}
          </Text>
        </div>
        <StateBadge row={row} movedTo={movedTo} />
      </Group>
      {state === 'scheduled' && (
        <Group gap="xs" wrap="nowrap">
          <Button
            size="md"
            variant={isToday ? 'filled' : 'light'}
            leftSection={<IconPlayerPlay size={18} />}
            disabled={!canStart || !template}
            loading={starting}
            onClick={onStart}
            style={{ flex: 1 }}
          >
            Start
          </Button>
          <Menu position="bottom-end">
            <Menu.Target>
              <ActionIcon size={44} variant="default" aria-label={`More actions for ${title}`}>
                <IconDots size={20} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item leftSection={<IconCalendarEvent size={16} />} onClick={onMove}>
                Move to another day
              </Menu.Item>
              <Menu.Item leftSection={<IconPlayerSkipForward size={16} />} onClick={() => update('skipped')}>
                Skip this one
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      )}
      {state === 'scheduled' && !template && row.template_id && (
        <Text size="xs" c="dimmed">
          This template is archived or unavailable. Restore it from Templates to start it.
        </Text>
      )}
      {state === 'skipped' && (
        <Button
          size="md"
          variant="subtle"
          color="gray"
          leftSection={<IconArrowBackUp size={18} />}
          onClick={() => update('scheduled')}
          loading={setStatus.isPending}
          w="fit-content"
        >
          Undo skip
        </Button>
      )}
    </Stack>
  );
}

function DayCard({
  day,
  rows,
  today,
  ...rest
}: {
  day: WeekDay;
  rows: ScheduledWorkout[];
  today: string;
  templates: TemplateWithExercises[];
  links: { movedTo: Map<string, ScheduleLink>; byId: Map<string, ScheduleLink> } | undefined;
  canStart: boolean;
  startingId: string | null;
  onStart: (row: ScheduledWorkout, template: TemplateWithExercises | undefined) => void;
  onMove: (row: ScheduledWorkout) => void;
}) {
  const isToday = day.date === today;
  return (
    <Card
      p="sm"
      aria-label={`${day.label} ${day.date}`}
      style={isToday ? { borderColor: 'var(--mantine-primary-color-filled)' } : undefined}
    >
      <Group gap="md" wrap="nowrap" align="flex-start">
        <Stack gap={0} align="center" w={40} style={{ flexShrink: 0 }}>
          <Text size="xs" fw={700} tt="uppercase" c={isToday ? 'lime' : 'dimmed'}>
            {day.label}
          </Text>
          <Text fw={700} fz="lg">
            {dayjs(day.date).format('D')}
          </Text>
        </Stack>
        <Stack gap="sm" style={{ flex: 1, minWidth: 0 }}>
          {rows.length === 0 ? (
            <Text size="sm" c="dimmed" py={6}>
              Nothing planned
            </Text>
          ) : (
            rows.map((row) => {
              const template = row.template_id
                ? rest.templates.find((t) => t.id === row.template_id)
                : undefined;
              return (
                <ScheduledRow
                  key={row.id}
                  row={row}
                  template={template}
                  links={rest.links}
                  canStart={rest.canStart}
                  starting={rest.startingId === row.id}
                  isToday={isToday}
                  onStart={() => rest.onStart(row, template)}
                  onMove={() => rest.onMove(row)}
                />
              );
            })
          )}
        </Stack>
      </Group>
    </Card>
  );
}

function ThisWeek() {
  const { timezone } = usePreferences();
  const today = localDate(timezone);
  const [offset, setOffset] = useState(0);
  const range = weekRange(today, offset);
  const scheduled = useScheduledWorkouts(range.from, range.to);
  const templates = useTemplates();
  const links = useRescheduleLinks(scheduled.data);
  const active = useActiveDraft();
  const start = useStartWorkout();
  const [startingId, setStartingId] = useState<string | null>(null);
  const [moving, setMoving] = useState<ScheduledWorkout | null>(null);

  const onStart = (row: ScheduledWorkout, template: TemplateWithExercises | undefined) => {
    if (!template) return;
    setStartingId(row.id);
    start.mutate(
      { template, scheduledWorkoutId: row.id },
      { onError: notifyError, onSettled: () => setStartingId(null) },
    );
  };

  return (
    <Stack gap="sm">
      <Group justify="space-between" wrap="nowrap">
        <ActionIcon
          size={44}
          variant="default"
          aria-label="Previous week"
          onClick={() => setOffset((o) => o - 1)}
        >
          <IconChevronLeft size={20} />
        </ActionIcon>
        <Stack gap={0} align="center">
          <Text fw={700}>
            {offset === 0
              ? 'This week'
              : offset === 1
                ? 'Next week'
                : offset === -1
                  ? 'Last week'
                  : 'Week of'}
          </Text>
          <Text size="sm" c="dimmed">
            {formatWeekLabel(range.from, range.to)}
          </Text>
        </Stack>
        <ActionIcon
          size={44}
          variant="default"
          aria-label="Next week"
          onClick={() => setOffset((o) => o + 1)}
        >
          <IconChevronRight size={20} />
        </ActionIcon>
      </Group>
      {offset !== 0 && (
        <Button variant="subtle" size="sm" onClick={() => setOffset(0)} w="fit-content" mx="auto">
          Back to this week
        </Button>
      )}
      {active.data && (
        <Alert variant="light" color="lime">
          <Group justify="space-between" wrap="nowrap">
            <Text size="sm">“{active.data.title}” is in progress.</Text>
            <Button size="sm" component={Link} to={`/workouts/session/${active.data.id}`}>
              Resume
            </Button>
          </Group>
        </Alert>
      )}
      {scheduled.isPending ? (
        <Stack gap="sm">
          {Array.from({ length: 7 }, (_, i) => (
            <Skeleton key={i} h={72} radius="lg" />
          ))}
        </Stack>
      ) : scheduled.isError ? (
        <Alert color="red" variant="light" title="Couldn't load your week">
          <Stack gap="xs">
            <Text size="sm">{scheduled.error.message}</Text>
            <Button size="sm" variant="default" w="fit-content" onClick={() => void scheduled.refetch()}>
              Try again
            </Button>
          </Stack>
        </Alert>
      ) : (
        <Stack gap="sm">
          {range.days.map((day) => (
            <DayCard
              key={day.date}
              day={day}
              today={today}
              rows={(scheduled.data ?? []).filter((r) => r.local_date === day.date)}
              templates={templates.data ?? []}
              links={links.data}
              canStart={!active.data && !start.isPending}
              startingId={startingId}
              onStart={onStart}
              onMove={setMoving}
            />
          ))}
        </Stack>
      )}
      <RescheduleModal workout={moving} today={today} onClose={() => setMoving(null)} />
    </Stack>
  );
}

function PlanRow({
  weekday,
  rule,
  options,
}: {
  weekday: number;
  rule: Rule | undefined;
  options: { value: string; label: string }[];
}) {
  const save = useSaveScheduleRule();
  const choice = ruleChoice(rule);
  const [time, setTime] = useState(rule?.local_time?.slice(0, 5) ?? '');
  const [lastRule, setLastRule] = useState(rule);
  if (rule !== lastRule) {
    setLastRule(rule);
    setTime(rule?.local_time?.slice(0, 5) ?? '');
  }

  const apply = (next: PlanChoice, nextTime: string) => {
    const change = planRuleChange(weekday, rule, next, nextTime || null);
    if (change.type === 'noop') return;
    save.mutate(change, { onSuccess: () => notifySaved('Weekly plan updated'), onError: notifyError });
  };

  const isWorkout = choice !== 'none' && choice !== 'rest';
  return (
    <Stack gap={6}>
      <Text fw={600} size="sm">
        {WEEKDAY_NAMES[weekday - 1]}
      </Text>
      <Group gap="xs" wrap="nowrap" align="flex-start">
        <Select
          aria-label={`${WEEKDAY_NAMES[weekday - 1]} plan`}
          size="md"
          style={{ flex: 1, minWidth: 0 }}
          data={options}
          value={choice}
          allowDeselect={false}
          disabled={save.isPending}
          onChange={(v) => v && apply(v, time)}
          comboboxProps={{ withinPortal: true }}
        />
        {isWorkout && (
          <TimeInput
            aria-label={`${WEEKDAY_NAMES[weekday - 1]} start time`}
            size="md"
            w={124}
            value={time}
            onChange={(e) => setTime(e.currentTarget.value)}
            onBlur={(e) => apply(choice, e.currentTarget.value)}
          />
        )}
      </Group>
    </Stack>
  );
}

function WeeklyPlan() {
  const rules = useScheduleRules();
  const templates = useTemplates();

  if (rules.isPending || templates.isPending) return <Skeleton h={420} radius="lg" />;
  if (rules.isError || templates.isError) {
    return (
      <Alert color="red" variant="light" title="Couldn't load your weekly plan">
        {(rules.error ?? templates.error)?.message}
      </Alert>
    );
  }

  const ruleFor = (weekday: number) => rules.data.find((r) => r.weekday === weekday && r.active);
  const known = new Set(templates.data.map((t) => t.id));
  const options = [
    { value: 'none', label: 'Not planned' },
    { value: 'rest', label: 'Rest day' },
    ...templates.data.map((t) => ({ value: t.id, label: t.title })),
    // A rule may point at an archived template; keep it selectable so the row still renders.
    ...rules.data
      .filter((r) => r.template_id && !known.has(r.template_id))
      .map((r) => ({ value: r.template_id!, label: 'Archived template' })),
  ].filter((o, i, all) => all.findIndex((x) => x.value === o.value) === i);

  return (
    <SectionCard
      title="Weekly plan"
      description="Repeats every week. Changes apply to upcoming days; days you've already done, skipped or moved stay as they are."
    >
      {templates.data.length === 0 && (
        <Alert variant="light" color="blue">
          <Text size="sm">
            You don't have any templates yet.{' '}
            <Text component={Link} to="/workouts/templates" inherit c="lime">
              Create or copy one
            </Text>{' '}
            to plan workouts.
          </Text>
        </Alert>
      )}
      <Stack gap="md">
        {[1, 2, 3, 4, 5, 6, 7].map((wd) => (
          <PlanRow key={wd} weekday={wd} rule={ruleFor(wd)} options={options} />
        ))}
      </Stack>
    </SectionCard>
  );
}

export function SchedulePage() {
  return (
    <Stack>
      <PageHeader title="Schedule" subtitle="Your week at a glance. Plans can bend — move or skip anytime." />
      <ThisWeek />
      <WeeklyPlan />
    </Stack>
  );
}
