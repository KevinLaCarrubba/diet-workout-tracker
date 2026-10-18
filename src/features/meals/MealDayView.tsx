import { ActionIcon, Alert, Button, Card, Group, Skeleton, Stack, Text } from '@mantine/core';
import { IconChevronLeft, IconChevronRight, IconPlus, IconToolsKitchen2 } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { usePreferences } from '@/features/profile/api';
import { notifyError, notifySaved } from '@/lib/notify';
import { dayjs, formatLocalTime, localDate } from '@/lib/time';
import { useAddAdHocMeal, useDeleteOccurrence, useMealDay, useMealSchedules, useRescheduleMeal } from './api';
import { dayTitle, movedToLabel, nextQuarterHour, nextUpcomingMeal, type MealOccurrence } from './logic';
import { MealCard } from './MealCard';
import { AddMealModal, NoteModal, RescheduleModal } from './MealModals';
import { useMealActions } from './useMealActions';
import { useNow } from './useNow';

export function DateSwitcher({
  date,
  today,
  onChange,
}: {
  date: string;
  today: string;
  onChange: (date: string) => void;
}) {
  const shift = (days: number) => onChange(dayjs(date).add(days, 'day').format('YYYY-MM-DD'));
  return (
    <Group justify="space-between" wrap="nowrap">
      <ActionIcon size="xl" variant="default" aria-label="Previous day" onClick={() => shift(-1)}>
        <IconChevronLeft size={20} />
      </ActionIcon>
      <Button variant="subtle" size="md" onClick={() => onChange(today)} aria-label="Go to today">
        <Stack gap={0} align="center">
          <Text fw={700}>{dayTitle(date, today)}</Text>
          {date !== today && (
            <Text size="xs" c="dimmed">
              Tap for today
            </Text>
          )}
        </Stack>
      </Button>
      <ActionIcon size="xl" variant="default" aria-label="Next day" onClick={() => shift(1)}>
        <IconChevronRight size={20} />
      </ActionIcon>
    </Group>
  );
}

export function MealDayView() {
  const { timezone } = usePreferences();
  const today = localDate(timezone);
  const [date, setDate] = useState(today);
  const now = useNow();
  const day = useMealDay(date);
  const schedules = useMealSchedules();
  const actions = useMealActions();
  const reschedule = useRescheduleMeal();
  const addMeal = useAddAdHocMeal();
  const remove = useDeleteOccurrence();
  const [moving, setMoving] = useState<MealOccurrence | null>(null);
  const [noting, setNoting] = useState<MealOccurrence | null>(null);
  const [adding, setAdding] = useState(false);

  const scheduleById = useMemo(() => new Map((schedules.data ?? []).map((s) => [s.id, s])), [schedules.data]);
  const meals = day.data?.meals ?? [];
  const all = [...meals, ...(day.data?.related ?? [])];
  const next = date === today ? nextUpcomingMeal(meals, now) : null;
  const defaultTime = date === today ? nextQuarterHour(timezone, now) : '12:00';

  return (
    <Stack>
      <DateSwitcher date={date} today={today} onChange={setDate} />

      {day.isPending ? (
        <Stack>
          <Skeleton h={180} radius="lg" />
          <Skeleton h={180} radius="lg" />
        </Stack>
      ) : day.isError ? (
        <Alert color="red" variant="light" title="Couldn't load meals">
          <Stack gap="xs" align="flex-start">
            <Text size="sm">{day.error.message}</Text>
            <Button size="sm" variant="light" onClick={() => day.refetch()}>
              Try again
            </Button>
          </Stack>
        </Alert>
      ) : meals.length === 0 ? (
        <Card>
          <Stack align="center" gap="xs" py="md">
            <IconToolsKitchen2 size={32} opacity={0.6} />
            <Text fw={600}>{date < today ? 'Nothing recorded for this day' : 'No meals planned'}</Text>
            <Text size="sm" c="dimmed" ta="center">
              {date < today
                ? 'Past days only show meals that were planned or added at the time.'
                : 'Set up your weekly plan, or add a one-off meal for this day.'}
            </Text>
            <Group>
              <Button component={Link} to="/meals/plan" variant="light">
                Weekly plan
              </Button>
              <Button leftSection={<IconPlus size={18} />} onClick={() => setAdding(true)}>
                Add meal
              </Button>
            </Group>
          </Stack>
        </Card>
      ) : (
        <Stack>
          {meals.map((meal) =>
            meal.status === 'rescheduled' ? (
              <Text key={meal.id} size="sm" c="dimmed" px="xs">
                {meal.label_snapshot} · {formatLocalTime(meal.local_time)} — {movedToLabel(meal, all, date)}
              </Text>
            ) : (
              <MealCard
                key={meal.id}
                meal={meal}
                schedule={meal.schedule_id ? scheduleById.get(meal.schedule_id) : null}
                timezone={timezone}
                now={now}
                isNext={next?.id === meal.id}
                actions={{
                  onAte: () => actions.ate(meal),
                  onSkip: () => actions.skip(meal),
                  onSnooze: (m) => actions.snooze(meal, m),
                  onUndo: () => actions.undo(meal),
                  onReschedule: () => setMoving(meal),
                  onEditNote: () => setNoting(meal),
                  onDelete:
                    !meal.schedule_id && !meal.rescheduled_from
                      ? () =>
                          remove.mutate(meal.id, {
                            onSuccess: () => notifySaved('Meal removed'),
                            onError: notifyError,
                          })
                      : undefined,
                }}
              />
            ),
          )}
          <Button
            variant="light"
            size="lg"
            leftSection={<IconPlus size={18} />}
            onClick={() => setAdding(true)}
          >
            Add meal
          </Button>
        </Stack>
      )}

      <RescheduleModal
        meal={moving}
        defaultTime={
          moving && moving.local_date === today
            ? nextQuarterHour(timezone, now)
            : (moving?.local_time.slice(0, 5) ?? '12:00')
        }
        loading={reschedule.isPending}
        onClose={() => setMoving(null)}
        onSubmit={(v) =>
          moving &&
          reschedule.mutate(
            { original: moving, ...v },
            {
              onSuccess: () => {
                notifySaved(`Moved to ${formatLocalTime(v.time)}`);
                setMoving(null);
              },
              onError: notifyError,
            },
          )
        }
      />
      <NoteModal
        meal={noting}
        loading={actions.pending}
        onClose={() => setNoting(null)}
        onSubmit={(notes) => noting && actions.saveNote(noting, notes, () => setNoting(null))}
      />
      <AddMealModal
        opened={adding}
        date={date}
        defaultTime={defaultTime}
        loading={addMeal.isPending}
        onClose={() => setAdding(false)}
        onSubmit={(v) =>
          addMeal.mutate(v, {
            onSuccess: () => {
              notifySaved('Meal added');
              setAdding(false);
              if (v.date !== date) setDate(v.date);
            },
            onError: notifyError,
          })
        }
      />
    </Stack>
  );
}
