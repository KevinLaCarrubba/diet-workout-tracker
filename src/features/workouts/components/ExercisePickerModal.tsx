import { Badge, Button, Group, Modal, Skeleton, Stack, Text, TextInput, UnstyledButton } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { useExercises, type Exercise } from '../api';
import classes from './ExercisePickerModal.module.css';
import { filterExercises } from './filterExercises';

interface Props {
  opened: boolean;
  onClose: () => void;
  onPick: (exercise: Exercise) => void;
  title?: string;
  /** Muscle group to list first (e.g. when substituting). */
  preferMuscles?: string[];
}

export function ExercisePickerModal({
  opened,
  onClose,
  onPick,
  title = 'Add exercise',
  preferMuscles,
}: Props) {
  const { data, isPending } = useExercises();
  const [query, setQuery] = useState('');
  const list = useMemo(() => filterExercises(data ?? [], query, preferMuscles), [data, query, preferMuscles]);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={title}
      fullScreen
      radius={0}
      transitionProps={{ transition: 'slide-up' }}
      classNames={{ content: classes.content, body: classes.body }}
    >
      <Stack className={classes.stack}>
        <TextInput
          placeholder="Search name, muscle or equipment"
          leftSection={<IconSearch size={18} />}
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          data-autofocus
        />
        {isPending ? (
          <Stack>
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} h={52} />
            ))}
          </Stack>
        ) : list.length === 0 ? (
          <Text c="dimmed" ta="center" py="xl">
            No exercises match “{query}”.
          </Text>
        ) : (
          <div className={classes.list}>
            <Stack gap={4}>
              {list.map((e) => (
                <UnstyledButton
                  key={e.id}
                  onClick={() => {
                    onPick(e);
                    setQuery('');
                  }}
                  p="sm"
                  style={{ borderRadius: 'var(--mantine-radius-md)', minHeight: 52 }}
                  className="picker-row"
                >
                  <Group justify="space-between" wrap="nowrap">
                    <div style={{ minWidth: 0 }}>
                      <Text fw={600} truncate>
                        {e.name}
                      </Text>
                      <Text size="xs" c="dimmed" truncate>
                        {[e.primary_muscles.join(', '), e.equipment].filter(Boolean).join(' · ')}
                      </Text>
                    </div>
                    {e.owner_user_id && (
                      <Badge size="xs" variant="light" color="blue">
                        Custom
                      </Badge>
                    )}
                  </Group>
                </UnstyledButton>
              ))}
            </Stack>
          </div>
        )}
        <Button variant="default" onClick={onClose}>
          Cancel
        </Button>
      </Stack>
    </Modal>
  );
}
