import { Alert, Button, Group, Modal, Stack, Text } from '@mantine/core';
import { useState } from 'react';
import { notifySaved } from '@/lib/notify';
import type { Exercise } from '../api';
import { useDeleteExercise } from './api';
import { exerciseErrorMessage } from './helpers';

export function DeleteExerciseModal({
  exercise,
  onClose,
  onDeleted,
}: {
  exercise: Exercise | null;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const remove = useDeleteExercise();
  const [error, setError] = useState<string | null>(null);
  const close = () => {
    setError(null);
    onClose();
  };
  return (
    <Modal opened={!!exercise} onClose={close} title="Delete exercise?" centered>
      <Stack>
        <Text size="sm">
          “{exercise?.name}” will be removed from your exercises. Past workouts keep their logged sets.
        </Text>
        {error && (
          <Alert color="yellow" variant="light">
            {error}
          </Alert>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={close}>
            {error ? 'Close' : 'Cancel'}
          </Button>
          {!error && (
            <Button
              color="red"
              loading={remove.isPending}
              onClick={() =>
                exercise &&
                remove.mutate(exercise.id, {
                  onSuccess: () => {
                    notifySaved('Exercise deleted');
                    close();
                    onDeleted?.();
                  },
                  onError: (e) => setError(exerciseErrorMessage(e)),
                })
              }
            >
              Delete
            </Button>
          )}
        </Group>
      </Stack>
    </Modal>
  );
}
