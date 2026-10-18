import {
  Autocomplete,
  Button,
  Group,
  Modal,
  MultiSelect,
  NumberInput,
  SegmentedControl,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useMediaQuery } from '@mantine/hooks';
import { useMemo } from 'react';
import type { RepMode } from '@/offline/types';
import { notifyError, notifySaved } from '@/lib/notify';
import type { Exercise, TemplateExercise } from '../api';
import { useUpdateTemplateItem } from './api';
import { buildItemPayload, itemValues, validateItem, type ItemValues } from './helpers';

const toInt = (v: number | string): number | null => {
  if (v === '' || v == null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
};

function ItemForm({
  item,
  catalog,
  groupOptions,
  defaultRest,
  onDone,
}: {
  item: TemplateExercise;
  catalog: Exercise[];
  groupOptions: string[];
  defaultRest: number;
  onDone: () => void;
}) {
  const update = useUpdateTemplateItem();
  const form = useForm<ItemValues>({ initialValues: itemValues(item), validate: (v) => validateItem(v) });
  const mode = form.values.rep_mode;

  const altOptions = useMemo(
    () =>
      catalog
        .filter((e) => e.id !== item.exercise_id)
        .map((e) => ({ value: e.id, label: e.owner_user_id ? `${e.name} (custom)` : e.name })),
    [catalog, item.exercise_id],
  );

  const submit = form.onSubmit((v) =>
    update.mutate(
      { id: item.id, payload: buildItemPayload(v) },
      {
        onSuccess: () => {
          notifySaved('Exercise updated');
          onDone();
        },
        onError: notifyError,
      },
    ),
  );

  const num = (field: 'target_sets' | 'rep_min' | 'rep_max' | 'duration_seconds_min' | 'rest_seconds') => ({
    value: form.values[field] ?? '',
    onChange: (v: number | string) => form.setFieldValue(field, toInt(v) as never),
    error: form.errors[field],
    allowDecimal: false,
    allowNegative: false,
    inputMode: 'numeric' as const,
    size: 'md' as const,
  });

  return (
    <form onSubmit={submit}>
      <Stack>
        <NumberInput label="Target sets" min={1} max={20} {...num('target_sets')} />
        <Stack gap={4}>
          <Text size="sm" fw={500}>
            Rep mode
          </Text>
          <SegmentedControl
            fullWidth
            size="md"
            value={mode}
            onChange={(v) => form.setFieldValue('rep_mode', v as RepMode)}
            data={[
              { value: 'reps', label: 'Reps' },
              { value: 'amrap', label: 'AMRAP' },
              { value: 'timed', label: 'Timed' },
            ]}
          />
        </Stack>
        {mode === 'reps' && (
          <Group grow>
            <NumberInput label="Min reps" min={1} max={100} {...num('rep_min')} />
            <NumberInput label="Max reps" min={1} max={100} {...num('rep_max')} />
          </Group>
        )}
        {mode === 'amrap' && (
          <Text size="sm" c="dimmed">
            As many reps as possible each set.
          </Text>
        )}
        {mode === 'timed' && (
          <NumberInput
            label="Minimum seconds per round"
            min={1}
            max={3600}
            suffix="s"
            {...num('duration_seconds_min')}
          />
        )}
        <NumberInput
          label="Rest between sets (seconds)"
          description={`Leave empty to use the template default (${defaultRest}s)`}
          min={0}
          max={900}
          step={15}
          placeholder={`${defaultRest}`}
          {...num('rest_seconds')}
        />
        <Autocomplete
          label="Group"
          description="Exercises with the same group are shown together, e.g. Back or Circuit A"
          size="md"
          data={groupOptions}
          {...form.getInputProps('group_name')}
        />
        <TextInput label="Tempo" placeholder="e.g. 2-1-2-0" size="md" {...form.getInputProps('tempo')} />
        <Textarea
          label="Coach cue"
          placeholder="Form reminder or note shown during the workout"
          autosize
          minRows={2}
          maxRows={6}
          size="md"
          {...form.getInputProps('notes')}
        />
        <MultiSelect
          label="Alternatives"
          description="Swaps you can pick during the workout if equipment is busy"
          size="md"
          searchable
          clearable
          data={altOptions}
          limit={50}
          nothingFoundMessage="No matching exercises"
          {...form.getInputProps('alternative_exercise_ids')}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" loading={update.isPending}>
            Save
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

export function TemplateItemModal({
  item,
  onClose,
  ...rest
}: {
  item: TemplateExercise | null;
  onClose: () => void;
  catalog: Exercise[];
  groupOptions: string[];
  defaultRest: number;
}) {
  const mobile = useMediaQuery('(max-width: 36em)');
  return (
    <Modal
      opened={!!item}
      onClose={onClose}
      title={item?.exercise.name ?? 'Exercise'}
      fullScreen={mobile}
      radius={mobile ? 0 : undefined}
    >
      {item && <ItemForm key={item.id} item={item} onDone={onClose} {...rest} />}
    </Modal>
  );
}
