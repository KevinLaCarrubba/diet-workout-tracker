import {
  Button,
  Group,
  Modal,
  SegmentedControl,
  Stack,
  Switch,
  TagsInput,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useMediaQuery } from '@mantine/hooks';
import { notifyError, notifySaved } from '@/lib/notify';
import type { Exercise } from '../api';
import { useSaveExercise, type ExerciseValues } from './api';
import { exerciseErrorMessage } from './helpers';

const DIFFICULTIES = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
];

const clean = (list: string[]) => [...new Set(list.map((m) => m.trim().toLowerCase()).filter(Boolean))];

function initialValues(exercise?: Exercise | null): ExerciseValues {
  return {
    name: exercise?.name ?? '',
    primary_muscles: exercise?.primary_muscles ?? [],
    secondary_muscles: exercise?.secondary_muscles ?? [],
    equipment: exercise?.equipment ?? '',
    instructions: exercise?.instructions ?? '',
    difficulty: exercise?.difficulty ?? 'beginner',
    is_bodyweight: exercise?.is_bodyweight ?? false,
  };
}

function ExerciseForm({
  exercise,
  muscleSuggestions,
  onDone,
}: {
  exercise?: Exercise | null;
  muscleSuggestions: string[];
  onDone: (saved: Exercise) => void;
}) {
  const save = useSaveExercise();
  const form = useForm<ExerciseValues>({
    initialValues: initialValues(exercise),
    validate: {
      name: (v) =>
        v.trim().length < 1 ? 'Give it a name' : v.trim().length > 80 ? 'Keep it under 80 characters' : null,
      equipment: (v) => ((v ?? '').length > 40 ? 'Keep it under 40 characters' : null),
      instructions: (v) => ((v ?? '').length > 4000 ? 'Keep it under 4000 characters' : null),
    },
  });

  const submit = form.onSubmit((v) => {
    const values: ExerciseValues = {
      ...v,
      name: v.name.trim(),
      primary_muscles: clean(v.primary_muscles),
      secondary_muscles: clean(v.secondary_muscles),
      equipment: v.equipment?.trim() || null,
      instructions: v.instructions?.trim() || null,
    };
    save.mutate(
      { id: exercise?.id, values },
      {
        onSuccess: (saved) => {
          notifySaved(exercise ? 'Exercise updated' : 'Exercise added');
          onDone(saved);
        },
        onError: (error) => notifyError(new Error(exerciseErrorMessage(error))),
      },
    );
  });

  return (
    <form onSubmit={submit}>
      <Stack>
        <TextInput label="Name" size="md" required data-autofocus {...form.getInputProps('name')} />
        <TagsInput
          label="Primary muscles"
          description="Press Enter after each"
          size="md"
          data={muscleSuggestions}
          clearable
          {...form.getInputProps('primary_muscles')}
        />
        <TagsInput
          label="Secondary muscles"
          size="md"
          data={muscleSuggestions}
          clearable
          {...form.getInputProps('secondary_muscles')}
        />
        <TextInput
          label="Equipment"
          placeholder="e.g. dumbbell, cable, machine"
          size="md"
          {...form.getInputProps('equipment')}
        />
        <Stack gap={4}>
          <Text size="sm" fw={500}>
            Difficulty
          </Text>
          <SegmentedControl fullWidth size="md" data={DIFFICULTIES} {...form.getInputProps('difficulty')} />
        </Stack>
        <Switch
          size="md"
          label="Bodyweight exercise"
          description="Weight is optional when logging"
          {...form.getInputProps('is_bodyweight', { type: 'checkbox' })}
        />
        <Textarea
          label="Instructions"
          placeholder="Setup, movement, breathing…"
          autosize
          minRows={3}
          maxRows={10}
          size="md"
          {...form.getInputProps('instructions')}
        />
        <Group justify="flex-end">
          <Button type="submit" size="md" loading={save.isPending}>
            {exercise ? 'Save changes' : 'Add exercise'}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

export function ExerciseFormModal({
  opened,
  onClose,
  exercise,
  muscleSuggestions,
  onSaved,
}: {
  opened: boolean;
  onClose: () => void;
  exercise?: Exercise | null;
  muscleSuggestions: string[];
  onSaved?: (saved: Exercise) => void;
}) {
  const mobile = useMediaQuery('(max-width: 36em)');
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={exercise ? 'Edit exercise' : 'New exercise'}
      fullScreen={mobile}
      radius={mobile ? 0 : undefined}
    >
      {opened && (
        <ExerciseForm
          key={exercise?.id ?? 'new'}
          exercise={exercise}
          muscleSuggestions={muscleSuggestions}
          onDone={(saved) => {
            onSaved?.(saved);
            onClose();
          }}
        />
      )}
    </Modal>
  );
}
