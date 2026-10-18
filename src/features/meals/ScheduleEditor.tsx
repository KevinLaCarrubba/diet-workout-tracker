import {
  ActionIcon,
  Alert,
  Button,
  Checkbox,
  Chip,
  Divider,
  Drawer,
  Group,
  Input,
  NumberInput,
  Paper,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { TimeInput } from '@mantine/dates';
import { schemaResolver, useForm } from '@mantine/form';
import { useMediaQuery } from '@mantine/hooks';
import { IconArrowDown, IconArrowUp, IconInfoCircle, IconPlus, IconX } from '@tabler/icons-react';
import { useEffect } from 'react';
import { z } from 'zod';
import { scheduleFromForm, scheduleToForm, WEEKDAYS, type MealSchedule, type SchedulePatch } from './logic';

const optionalInt = (min: number, max: number) =>
  z.union([
    z.literal(''),
    z.number().int(`Whole number`).min(min, `${min}–${max}`).max(max, `${min}–${max}`),
  ]);

const schema = z.object({
  label: z.string().trim().min(1, 'Give the meal a name').max(40, 'Up to 40 characters'),
  meal_number: optionalInt(1, 20),
  description: z.string().max(120, 'Up to 120 characters'),
  items: z.array(
    z.object({ key: z.string(), text: z.string().max(300, 'Up to 300 characters'), optional: z.boolean() }),
  ),
  coach_note: z.string().max(1000, 'Up to 1000 characters'),
  notes: z.string().max(500, 'Up to 500 characters'),
  local_time: z.string().regex(/^\d{1,2}:\d{2}(:\d{2})?$/, 'Pick a time'),
  recurrence_weekdays: z.array(z.string()).min(1, 'Pick at least one day'),
  active: z.boolean(),
  display_order: optionalInt(0, 999),
  needs_confirmation: z.boolean(),
  confirmation_note: z.string().max(500, 'Up to 500 characters'),
});

export function ScheduleEditor({
  opened,
  schedule,
  defaultOrder,
  saving,
  onClose,
  onSave,
}: {
  opened: boolean;
  /** null = new meal */
  schedule: MealSchedule | null;
  defaultOrder: number;
  saving?: boolean;
  onClose: () => void;
  onSave: (values: SchedulePatch) => void;
}) {
  const wide = useMediaQuery('(min-width: 48em)');
  const form = useForm({
    initialValues: scheduleToForm(null),
    validate: schemaResolver(schema, { sync: true }),
  });

  useEffect(() => {
    if (!opened) return;
    const values = scheduleToForm(schedule);
    if (!schedule) values.display_order = defaultOrder;
    form.setValues(values);
    form.resetDirty(values);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, schedule?.id]);

  const items = form.getValues().items;

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position={wide ? 'right' : 'bottom'}
      size={wide ? 'lg' : '92%'}
      title={schedule ? `Edit ${schedule.label}` : 'New meal'}
      styles={{ content: wide ? undefined : { borderTopLeftRadius: 16, borderTopRightRadius: 16 } }}
    >
      <form onSubmit={form.onSubmit((v) => onSave(scheduleFromForm(v)))} noValidate>
        <Stack pb="xl">
          {schedule && (
            <Alert variant="light" color="blue" icon={<IconInfoCircle size={18} />}>
              Changes apply from today onward to meals you haven't marked yet. Past days and meals you've
              already marked stay as they were.
            </Alert>
          )}
          <Group grow align="flex-start">
            <TextInput label="Name" placeholder="Meal 2" maxLength={40} {...form.getInputProps('label')} />
            <TimeInput label="Time" size="md" {...form.getInputProps('local_time')} />
          </Group>
          <TextInput
            label="Description"
            placeholder="e.g. Chicken and rice"
            maxLength={120}
            description={`${form.getValues().description.length}/120`}
            {...form.getInputProps('description')}
          />

          <Input.Wrapper label="Days" error={form.errors.recurrence_weekdays}>
            <Chip.Group multiple {...form.getInputProps('recurrence_weekdays')}>
              <Group gap={6} mt={6}>
                {WEEKDAYS.map((d) => (
                  <Chip key={d.value} value={String(d.value)} size="md" radius="xl">
                    {d.short}
                  </Chip>
                ))}
              </Group>
            </Chip.Group>
          </Input.Wrapper>

          <Input.Wrapper
            label="What's in it"
            description="Write quantities and alternatives exactly as your plan says, e.g. “6 oz chicken OR turkey”."
          >
            <Stack gap="xs" mt={6}>
              {items.map((item, index) => (
                <Paper key={item.key} withBorder p="xs" radius="md">
                  <Stack gap={6}>
                    <Group gap={4} wrap="nowrap" align="flex-start">
                      <TextInput
                        style={{ flex: 1 }}
                        aria-label={`Item ${index + 1}`}
                        placeholder="e.g. 5 oz jasmine rice"
                        {...form.getInputProps(`items.${index}.text`)}
                      />
                      <ActionIcon
                        size="xl"
                        variant="subtle"
                        color="gray"
                        aria-label={`Remove item ${index + 1}`}
                        onClick={() => form.removeListItem('items', index)}
                      >
                        <IconX size={18} />
                      </ActionIcon>
                    </Group>
                    <Group justify="space-between">
                      <Checkbox
                        label="Optional"
                        {...form.getInputProps(`items.${index}.optional`, { type: 'checkbox' })}
                      />
                      <Group gap={2}>
                        <ActionIcon
                          aria-label={`Move item ${index + 1} up`}
                          disabled={index === 0}
                          onClick={() => form.reorderListItem('items', { from: index, to: index - 1 })}
                        >
                          <IconArrowUp size={18} />
                        </ActionIcon>
                        <ActionIcon
                          aria-label={`Move item ${index + 1} down`}
                          disabled={index === items.length - 1}
                          onClick={() => form.reorderListItem('items', { from: index, to: index + 1 })}
                        >
                          <IconArrowDown size={18} />
                        </ActionIcon>
                      </Group>
                    </Group>
                  </Stack>
                </Paper>
              ))}
              <Button
                variant="light"
                leftSection={<IconPlus size={18} />}
                onClick={() =>
                  form.insertListItem('items', { key: crypto.randomUUID(), text: '', optional: false })
                }
              >
                Add item
              </Button>
            </Stack>
          </Input.Wrapper>

          <Textarea
            label="Coach note"
            description="Timing or instructions from your coach."
            autosize
            minRows={2}
            maxLength={1000}
            {...form.getInputProps('coach_note')}
          />
          <Textarea
            label="Your notes"
            autosize
            minRows={2}
            maxLength={500}
            {...form.getInputProps('notes')}
          />

          <Divider />
          <Group grow align="flex-start">
            <NumberInput
              label="Meal number"
              description="Your coach's numbering"
              min={1}
              max={20}
              allowDecimal={false}
              inputMode="numeric"
              {...form.getInputProps('meal_number')}
            />
            <NumberInput
              label="List order"
              description="Lower shows first"
              min={0}
              max={999}
              allowDecimal={false}
              inputMode="numeric"
              {...form.getInputProps('display_order')}
            />
          </Group>
          <Switch
            size="md"
            label="Active"
            description="Paused meals don't appear on your days or send reminders."
            {...form.getInputProps('active', { type: 'checkbox' })}
          />
          <Switch
            size="md"
            label="Timing needs confirming"
            description="Shows a “confirm with coach” flag until you mark it resolved."
            {...form.getInputProps('needs_confirmation', { type: 'checkbox' })}
          />
          {form.getValues().needs_confirmation && (
            <Textarea
              label="What needs confirming"
              autosize
              minRows={2}
              maxLength={500}
              {...form.getInputProps('confirmation_note')}
            />
          )}

          <Text size="xs" c="dimmed">
            Meals here are reminders only — names, times and what your plan lists.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {schedule ? 'Save changes' : 'Add to plan'}
            </Button>
          </Group>
        </Stack>
      </form>
    </Drawer>
  );
}
