import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Group,
  Menu,
  Modal,
  Skeleton,
  Stack,
  Text,
} from '@mantine/core';
import {
  IconCalendarRepeat,
  IconCheck,
  IconCopy,
  IconDots,
  IconInfoCircle,
  IconPencil,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react';
import { useState } from 'react';
import { notifyError, notifySaved } from '@/lib/notify';
import { formatLocalTime } from '@/lib/time';
import { useDeleteSchedule, useDuplicateSchedule, useMealSchedules, useSaveSchedule } from './api';
import { nextDisplayOrder, parseItems, WEEKDAYS, weekdaysLabel, type MealSchedule } from './logic';
import { CoachNote, MealItems, TimingConflict } from './MealCard';
import { ScheduleEditor } from './ScheduleEditor';

function WeekdayDots({ days }: { days: number[] }) {
  return (
    <Group gap={4} wrap="nowrap" aria-label={weekdaysLabel(days)} role="img">
      {WEEKDAYS.map((d) => {
        const on = days.includes(d.value);
        return (
          <Box
            key={d.value}
            w={30}
            h={30}
            style={{
              borderRadius: 999,
              display: 'grid',
              placeItems: 'center',
              fontSize: 11,
              fontWeight: 700,
              background: on ? 'var(--mantine-primary-color-light)' : 'transparent',
              color: on ? 'var(--mantine-primary-color-light-color)' : 'var(--mantine-color-dimmed)',
              border: on ? 'none' : '1px dashed var(--mantine-color-default-border)',
            }}
            aria-hidden
          >
            {d.short.slice(0, 2)}
          </Box>
        );
      })}
    </Group>
  );
}

function ScheduleCard({
  schedule,
  onEdit,
  onDuplicate,
  onTogglePause,
  onDelete,
  onResolve,
}: {
  schedule: MealSchedule;
  onEdit: () => void;
  onDuplicate: () => void;
  onTogglePause: () => void;
  onDelete: () => void;
  onResolve: () => void;
}) {
  const items = parseItems(schedule.items);
  return (
    <Card
      component="article"
      aria-label={schedule.label}
      style={schedule.active ? undefined : { opacity: 0.65 }}
    >
      <Stack gap="sm">
        <Group justify="space-between" wrap="nowrap" align="flex-start">
          <div style={{ minWidth: 0 }}>
            <Group gap={6}>
              <Text fw={700} fz="lg">
                {schedule.label} · {formatLocalTime(schedule.local_time)}
              </Text>
              {!schedule.active && (
                <Badge color="gray" variant="outline" tt="none">
                  Paused
                </Badge>
              )}
            </Group>
            {schedule.description && (
              <Text size="sm" c="dimmed">
                {schedule.description}
              </Text>
            )}
          </div>
          <Menu position="bottom-end">
            <Menu.Target>
              <ActionIcon size="xl" aria-label={`Options for ${schedule.label}`}>
                <IconDots size={20} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item leftSection={<IconPencil size={16} />} onClick={onEdit}>
                Edit
              </Menu.Item>
              <Menu.Item leftSection={<IconCopy size={16} />} onClick={onDuplicate}>
                Duplicate
              </Menu.Item>
              <Menu.Item
                leftSection={schedule.active ? <IconPlayerPause size={16} /> : <IconPlayerPlay size={16} />}
                onClick={onTogglePause}
              >
                {schedule.active ? 'Pause' : 'Resume'}
              </Menu.Item>
              <Menu.Item color="red" leftSection={<IconTrash size={16} />} onClick={onDelete}>
                Delete
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
        <WeekdayDots days={schedule.recurrence_weekdays} />
        <Text size="xs" c="dimmed">
          {weekdaysLabel(schedule.recurrence_weekdays)}
          {schedule.meal_number != null && schedule.label !== `Meal ${schedule.meal_number}`
            ? ` · Coach meal #${schedule.meal_number}`
            : ''}
        </Text>
        {schedule.needs_confirmation && (
          <Stack gap={6}>
            <TimingConflict note={schedule.confirmation_note} />
            <Button
              size="sm"
              variant="light"
              color="yellow"
              leftSection={<IconCheck size={16} />}
              onClick={onResolve}
              style={{ alignSelf: 'flex-start' }}
            >
              Mark resolved
            </Button>
          </Stack>
        )}
        <MealItems items={items} />
        <CoachNote note={schedule.coach_note} />
        {schedule.notes && (
          <Text size="xs" c="dimmed">
            {schedule.notes}
          </Text>
        )}
        <Button variant="default" leftSection={<IconPencil size={16} />} onClick={onEdit}>
          Edit
        </Button>
      </Stack>
    </Card>
  );
}

export function WeeklyPlan() {
  const schedules = useMealSchedules();
  const save = useSaveSchedule();
  const duplicate = useDuplicateSchedule();
  const remove = useDeleteSchedule();
  const [editing, setEditing] = useState<MealSchedule | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<MealSchedule | null>(null);
  const list = schedules.data ?? [];

  const closeEditor = () => {
    setEditing(null);
    setCreating(false);
  };

  return (
    <Stack>
      <Alert variant="light" color="blue" icon={<IconInfoCircle size={18} />}>
        Your weekly plan fills in each day&apos;s meals. Editing it refreshes upcoming meals you haven&apos;t
        marked yet — past days and meals you&apos;ve already marked stay as they were.
      </Alert>
      <Button size="lg" leftSection={<IconPlus size={18} />} onClick={() => setCreating(true)}>
        Add meal to plan
      </Button>

      {schedules.isPending ? (
        <Stack>
          <Skeleton h={160} radius="lg" />
          <Skeleton h={160} radius="lg" />
        </Stack>
      ) : schedules.isError ? (
        <Alert color="red" variant="light" title="Couldn't load your plan">
          {schedules.error.message}
        </Alert>
      ) : list.length === 0 ? (
        <Card>
          <Stack align="center" gap="xs" py="md">
            <IconCalendarRepeat size={32} opacity={0.6} />
            <Text fw={600}>No meals in your plan yet</Text>
            <Text size="sm" c="dimmed" ta="center">
              Add a meal with a name and time — for example “Meal 2 · Chicken and rice · 1:30 PM” — and pick
              the days it repeats.
            </Text>
          </Stack>
        </Card>
      ) : (
        list.map((s) => (
          <ScheduleCard
            key={s.id}
            schedule={s}
            onEdit={() => setEditing(s)}
            onDuplicate={() =>
              duplicate.mutate(s, { onSuccess: () => notifySaved('Meal duplicated'), onError: notifyError })
            }
            onTogglePause={() =>
              save.mutate(
                { id: s.id, values: { active: !s.active } },
                { onSuccess: () => notifySaved(s.active ? 'Paused' : 'Resumed'), onError: notifyError },
              )
            }
            onResolve={() =>
              save.mutate(
                { id: s.id, values: { needs_confirmation: false } },
                { onSuccess: () => notifySaved('Marked resolved'), onError: notifyError },
              )
            }
            onDelete={() => setDeleting(s)}
          />
        ))
      )}

      <ScheduleEditor
        opened={creating || !!editing}
        schedule={editing}
        defaultOrder={nextDisplayOrder(list)}
        saving={save.isPending}
        onClose={closeEditor}
        onSave={(values) =>
          save.mutate(
            { id: editing?.id ?? null, values },
            {
              onSuccess: () => {
                notifySaved(editing ? 'Plan updated' : 'Added to your plan');
                closeEditor();
              },
              onError: notifyError,
            },
          )
        }
      />

      <Modal opened={!!deleting} onClose={() => setDeleting(null)} title="Delete this meal?" centered>
        <Stack>
          <Text size="sm">
            {deleting?.label} will be removed from your plan and from upcoming days. Meals you&apos;ve already
            marked stay in your history.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              color="red"
              loading={remove.isPending}
              onClick={() =>
                deleting &&
                remove.mutate(deleting.id, {
                  onSuccess: () => {
                    notifySaved('Meal deleted');
                    setDeleting(null);
                  },
                  onError: notifyError,
                })
              }
            >
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
