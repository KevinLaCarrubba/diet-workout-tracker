import {
  Button,
  Chip,
  Group,
  NumberInput,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import type { UnitSystem } from '@/lib/units';
import {
  ACTIVITY_OPTIONS,
  distanceToMeters,
  distanceUnit,
  formatPace,
  numOrNull,
  paceSecondsPerKm,
  speedUnit,
  toSeconds,
  validateCardio,
  type CardioActivity,
  type CardioFormValues,
} from './cardioModel';

export function CardioForm({
  initialValues,
  units,
  saving,
  onSubmit,
  onDelete,
}: {
  initialValues: CardioFormValues;
  units: UnitSystem;
  saving?: boolean;
  onSubmit: (values: CardioFormValues) => void;
  /** Present when editing an existing entry. */
  onDelete?: () => void;
}) {
  const form = useForm<CardioFormValues>({ initialValues, validate: validateCardio });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const v = form.values;

  const duration = toSeconds(numOrNull(v.minutes), numOrNull(v.seconds));
  const distance = numOrNull(v.distance);
  const pace = formatPace(
    paceSecondsPerKm(duration, distance && distance > 0 ? distanceToMeters(distance, units) : null),
    units,
  );

  return (
    <form onSubmit={form.onSubmit(onSubmit)}>
      <Stack>
        <div>
          <Text size="sm" fw={500} mb={6}>
            Activity
          </Text>
          <Chip.Group
            multiple={false}
            value={v.activity_type}
            onChange={(value) => form.setFieldValue('activity_type', value as CardioActivity)}
          >
            <Group gap="xs">
              {ACTIVITY_OPTIONS.map((o) => (
                <Chip key={o.value} value={o.value} size="md">
                  {o.label}
                </Chip>
              ))}
            </Group>
          </Chip.Group>
        </div>

        {v.activity_type === 'custom' && (
          <TextInput
            label="Activity name"
            placeholder="e.g. Swimming"
            maxLength={60}
            size="md"
            {...form.getInputProps('custom_name')}
          />
        )}

        <TextInput label="When" type="datetime-local" size="md" {...form.getInputProps('occurred_local')} />

        <div>
          <Text size="sm" fw={500} mb={4}>
            Duration
          </Text>
          <Group grow align="flex-start">
            <NumberInput
              aria-label="Minutes"
              placeholder="0"
              suffix=" min"
              min={0}
              max={1440}
              allowDecimal={false}
              allowNegative={false}
              inputMode="numeric"
              size="md"
              {...form.getInputProps('minutes')}
            />
            <NumberInput
              aria-label="Seconds"
              placeholder="0"
              suffix=" sec"
              min={0}
              max={59}
              allowDecimal={false}
              allowNegative={false}
              inputMode="numeric"
              size="md"
              {...form.getInputProps('seconds')}
            />
          </Group>
        </div>

        <NumberInput
          label="Distance (optional)"
          suffix={` ${distanceUnit(units)}`}
          min={0}
          decimalScale={2}
          allowNegative={false}
          inputMode="decimal"
          size="md"
          description={pace ? `Pace ${pace}` : undefined}
          {...form.getInputProps('distance')}
        />

        <SimpleGrid cols={2} spacing="sm">
          <NumberInput
            label="Incline"
            suffix=" %"
            min={-10}
            max={40}
            decimalScale={1}
            inputMode="decimal"
            size="md"
            {...form.getInputProps('incline')}
          />
          <NumberInput
            label="Speed"
            suffix={` ${speedUnit(units)}`}
            min={0}
            decimalScale={1}
            allowNegative={false}
            inputMode="decimal"
            size="md"
            {...form.getInputProps('speed')}
          />
          <NumberInput
            label="Resistance / level"
            min={0}
            max={100}
            decimalScale={1}
            allowNegative={false}
            inputMode="decimal"
            size="md"
            {...form.getInputProps('resistance')}
          />
          <div />
          <NumberInput
            label="Avg heart rate"
            suffix=" bpm"
            min={30}
            max={250}
            allowDecimal={false}
            allowNegative={false}
            inputMode="numeric"
            size="md"
            {...form.getInputProps('avg_hr')}
          />
          <NumberInput
            label="Max heart rate"
            suffix=" bpm"
            min={30}
            max={250}
            allowDecimal={false}
            allowNegative={false}
            inputMode="numeric"
            size="md"
            {...form.getInputProps('max_hr')}
          />
        </SimpleGrid>

        <Textarea label="Notes" autosize minRows={2} maxRows={6} size="md" {...form.getInputProps('notes')} />

        <Button type="submit" size="lg" loading={saving}>
          Save
        </Button>

        {onDelete &&
          (confirmDelete ? (
            <Group grow>
              <Button variant="default" size="md" onClick={() => setConfirmDelete(false)}>
                Keep it
              </Button>
              <Button color="red" size="md" onClick={onDelete}>
                Delete
              </Button>
            </Group>
          ) : (
            <Button
              variant="subtle"
              color="red"
              size="md"
              leftSection={<IconTrash size={18} />}
              onClick={() => setConfirmDelete(true)}
            >
              Delete this entry
            </Button>
          ))}
      </Stack>
    </form>
  );
}
