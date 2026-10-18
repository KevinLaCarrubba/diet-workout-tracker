import { Button, Group, Modal, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { DateInput, TimeInput } from '@mantine/dates';
import { schemaResolver, useForm } from '@mantine/form';
import { useEffect } from 'react';
import { z } from 'zod';
import { formatLocalTime } from '@/lib/time';
import type { MealOccurrence } from './logic';

const timeSchema = z.string().regex(/^\d{1,2}:\d{2}(:\d{2})?$/, 'Pick a time');
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a day');

const rescheduleSchema = z.object({ date: dateSchema, time: timeSchema });

export function RescheduleModal({
  meal,
  defaultTime,
  onClose,
  onSubmit,
  loading,
}: {
  meal: MealOccurrence | null;
  defaultTime: string;
  onClose: () => void;
  onSubmit: (v: { date: string; time: string }) => void;
  loading?: boolean;
}) {
  const form = useForm({
    initialValues: { date: '', time: '' },
    validate: schemaResolver(rescheduleSchema, { sync: true }),
  });
  useEffect(() => {
    if (meal) form.setValues({ date: meal.local_date, time: defaultTime });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meal?.id]);

  return (
    <Modal opened={!!meal} onClose={onClose} title={`Move ${meal?.label_snapshot ?? 'meal'}`} centered>
      <form onSubmit={form.onSubmit(onSubmit)} noValidate>
        <Stack>
          {meal && (
            <Text size="sm" c="dimmed">
              Planned for {formatLocalTime(meal.local_time)}. Pick a new time — the original stays in your
              history as moved.
            </Text>
          )}
          <DateInput label="Day" valueFormat="ddd, MMM D" {...form.getInputProps('date')} />
          <TimeInput label="Time" size="md" {...form.getInputProps('time')} />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={loading}>
              Move meal
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

const noteSchema = z.object({ notes: z.string().max(500, 'Keep notes under 500 characters') });

export function NoteModal({
  meal,
  onClose,
  onSubmit,
  loading,
}: {
  meal: MealOccurrence | null;
  onClose: () => void;
  onSubmit: (notes: string | null) => void;
  loading?: boolean;
}) {
  const form = useForm({
    initialValues: { notes: '' },
    validate: schemaResolver(noteSchema, { sync: true }),
  });
  useEffect(() => {
    if (meal) form.setValues({ notes: meal.notes ?? '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meal?.id]);

  return (
    <Modal opened={!!meal} onClose={onClose} title="Meal note" centered>
      <form onSubmit={form.onSubmit((v) => onSubmit(v.notes.trim() || null))} noValidate>
        <Stack>
          <Textarea
            label={`Note for ${meal?.label_snapshot ?? 'this meal'}`}
            description="Just for this day. Your weekly plan isn't changed."
            autosize
            minRows={3}
            maxLength={500}
            {...form.getInputProps('notes')}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={loading}>
              Save note
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

const adHocSchema = z.object({
  label: z.string().trim().min(1, 'Give it a name').max(40, 'Up to 40 characters'),
  description: z.string().max(120, 'Up to 120 characters'),
  date: dateSchema,
  time: timeSchema,
});

export function AddMealModal({
  opened,
  date,
  defaultTime,
  onClose,
  onSubmit,
  loading,
}: {
  opened: boolean;
  date: string;
  defaultTime: string;
  onClose: () => void;
  onSubmit: (v: { label: string; description: string; date: string; time: string }) => void;
  loading?: boolean;
}) {
  const form = useForm({
    initialValues: { label: '', description: '', date, time: defaultTime },
    validate: schemaResolver(adHocSchema, { sync: true }),
  });
  useEffect(() => {
    if (opened) form.setValues({ label: '', description: '', date, time: defaultTime });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]);

  return (
    <Modal opened={opened} onClose={onClose} title="Add a meal" centered>
      <form onSubmit={form.onSubmit(onSubmit)} noValidate>
        <Stack>
          <Text size="sm" c="dimmed">
            A one-off meal for this day only. Your weekly plan stays the same.
          </Text>
          <TextInput label="Name" placeholder="e.g. Snack" maxLength={40} {...form.getInputProps('label')} />
          <TextInput
            label="Description (optional)"
            placeholder="e.g. Chicken and rice"
            maxLength={120}
            {...form.getInputProps('description')}
          />
          <DateInput label="Day" valueFormat="ddd, MMM D" {...form.getInputProps('date')} />
          <TimeInput label="Time" size="md" {...form.getInputProps('time')} />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={loading}>
              Add meal
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
