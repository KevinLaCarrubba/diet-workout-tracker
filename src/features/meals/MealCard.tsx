import { ActionIcon, Badge, Button, Card, Group, List, Menu, Paper, Stack, Text } from '@mantine/core';
import {
  IconAlertTriangle,
  IconArrowBackUp,
  IconCalendarTime,
  IconCheck,
  IconClock,
  IconDots,
  IconNote,
  IconPlayerSkipForward,
  IconTrash,
} from '@tabler/icons-react';
import { formatLocalTime } from '@/lib/time';
import {
  mealState,
  parseItems,
  SNOOZE_OPTIONS,
  stateLabel,
  type MealOccurrence,
  type MealSchedule,
  type MealState,
} from './logic';

const STATE_COLOR: Record<MealState, string> = {
  pending: 'gray',
  snoozed: 'blue',
  eaten: 'lime',
  skipped: 'gray',
  rescheduled: 'gray',
};

export interface MealCardActions {
  onAte: () => void;
  onSkip: () => void;
  onSnooze: (minutes: number) => void;
  onUndo: () => void;
  onReschedule: () => void;
  onEditNote: () => void;
  onDelete?: () => void;
}

/** The timing-conflict flag for meals whose plan still needs the coach's OK. */
export function TimingConflict({ note }: { note: string | null }) {
  return (
    <Stack gap={4}>
      <Badge
        color="yellow"
        variant="light"
        size="lg"
        tt="none"
        leftSection={<IconAlertTriangle size={14} />}
        style={{ maxWidth: '100%' }}
      >
        Timing conflict — confirm with coach
      </Badge>
      {note && (
        <Text size="xs" c="dimmed">
          {note}
        </Text>
      )}
    </Stack>
  );
}

export function MealItems({ items }: { items: ReturnType<typeof parseItems> }) {
  if (items.length === 0) return null;
  return (
    <List size="sm" spacing={4}>
      {items.map((item, i) => (
        <List.Item key={i}>
          {item.text}
          {item.optional && (
            <Badge size="xs" variant="outline" color="gray" ml={6} tt="none">
              optional
            </Badge>
          )}
        </List.Item>
      ))}
    </List>
  );
}

export function CoachNote({ note }: { note: string | null }) {
  if (!note) return null;
  return (
    <Paper p="xs" radius="md" bg="var(--mantine-color-default-hover)">
      <Text size="xs" fw={700} c="dimmed" tt="uppercase">
        Coach note
      </Text>
      <Text size="sm">{note}</Text>
    </Paper>
  );
}

export function MealCard({
  meal,
  schedule,
  timezone,
  isNext = false,
  now = new Date(),
  actions,
}: {
  meal: MealOccurrence;
  schedule?: MealSchedule | null;
  timezone: string;
  isNext?: boolean;
  now?: Date;
  actions: MealCardActions;
}) {
  const state = mealState(meal, now);
  const open = state === 'pending' || state === 'snoozed';
  const items = parseItems(meal.items_snapshot);
  const title = `${meal.label_snapshot} · ${formatLocalTime(meal.local_time)}`;

  return (
    <Card
      component="article"
      aria-label={title}
      style={isNext ? { borderColor: 'var(--mantine-primary-color-filled)', borderWidth: 2 } : undefined}
    >
      <Stack gap="sm">
        <Group justify="space-between" wrap="nowrap" align="flex-start">
          <div style={{ minWidth: 0 }}>
            {isNext && (
              <Text size="xs" fw={700} c="lime" tt="uppercase">
                Up next
              </Text>
            )}
            <Text fw={700} fz="lg">
              {title}
            </Text>
            {meal.description_snapshot && (
              <Text size="sm" c="dimmed">
                {meal.description_snapshot}
              </Text>
            )}
          </div>
          <Badge
            color={STATE_COLOR[state]}
            variant={state === 'eaten' ? 'light' : 'outline'}
            tt="none"
            style={{ flexShrink: 0 }}
          >
            {stateLabel(meal, timezone, now)}
          </Badge>
        </Group>

        {schedule?.needs_confirmation && <TimingConflict note={schedule.confirmation_note} />}
        <MealItems items={items} />
        <CoachNote note={meal.coach_note_snapshot} />
        {meal.notes && (
          <Text size="xs" c="dimmed">
            {meal.notes}
          </Text>
        )}
        {meal.rescheduled_from && (
          <Text size="xs" c="dimmed">
            Moved from its usual time
          </Text>
        )}

        <Group gap="xs" wrap="nowrap">
          {open ? (
            <>
              <Button
                size="lg"
                fz="md"
                px="xs"
                style={{ flex: 1 }}
                leftSection={<IconCheck size={20} />}
                onClick={actions.onAte}
              >
                Ate
              </Button>
              <Button
                size="lg"
                variant="default"
                fz="md"
                px="xs"
                style={{ flex: 1 }}
                onClick={actions.onSkip}
              >
                Skip
              </Button>
              <Menu position="bottom-end">
                <Menu.Target>
                  <Button size="lg" variant="default" fz="md" px="xs" style={{ flex: 1 }}>
                    Snooze
                  </Button>
                </Menu.Target>
                <Menu.Dropdown>
                  {SNOOZE_OPTIONS.map((m) => (
                    <Menu.Item
                      key={m}
                      leftSection={<IconClock size={16} />}
                      onClick={() => actions.onSnooze(m)}
                    >
                      {m === 60 ? '1 hour' : `${m} minutes`}
                    </Menu.Item>
                  ))}
                </Menu.Dropdown>
              </Menu>
            </>
          ) : (
            <Button
              size="lg"
              variant="default"
              style={{ flex: 1 }}
              leftSection={<IconArrowBackUp size={18} />}
              onClick={actions.onUndo}
            >
              Undo
            </Button>
          )}
          <Menu position="bottom-end">
            <Menu.Target>
              <ActionIcon size={50} variant="default" aria-label={`More for ${meal.label_snapshot}`}>
                <IconDots size={20} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              {open && (
                <Menu.Item leftSection={<IconCalendarTime size={16} />} onClick={actions.onReschedule}>
                  Reschedule
                </Menu.Item>
              )}
              <Menu.Item leftSection={<IconNote size={16} />} onClick={actions.onEditNote}>
                {meal.notes ? 'Edit note' : 'Add note'}
              </Menu.Item>
              {state === 'snoozed' && (
                <Menu.Item leftSection={<IconPlayerSkipForward size={16} />} onClick={actions.onUndo}>
                  Cancel snooze
                </Menu.Item>
              )}
              {!open && (
                <Menu.Item leftSection={<IconArrowBackUp size={16} />} onClick={actions.onUndo}>
                  Undo
                </Menu.Item>
              )}
              {actions.onDelete && (
                <Menu.Item color="red" leftSection={<IconTrash size={16} />} onClick={actions.onDelete}>
                  Remove this meal
                </Menu.Item>
              )}
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Stack>
    </Card>
  );
}
