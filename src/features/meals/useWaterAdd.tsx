import { Button, Group, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { usePreferences } from '@/features/profile/api';
import { notifyError } from '@/lib/notify';
import { formatVolume } from '@/lib/units';
import { useWaterActions } from './api';

/** Adds water and shows a short "Added 8 oz · Undo" toast. */
export function useWaterAdd() {
  const { units } = usePreferences();
  const actions = useWaterActions();
  return async (amountMl: number) => {
    try {
      const entry = await actions.add(amountMl);
      const id = `water-${entry.id}`;
      notifications.show({
        id,
        color: 'blue',
        autoClose: 5000,
        message: (
          <Group justify="space-between" wrap="nowrap">
            <Text size="sm">Added {formatVolume(entry.amount_ml, units)}</Text>
            <Button
              size="compact-sm"
              variant="subtle"
              onClick={() => {
                notifications.hide(id);
                void actions.remove(entry).catch(notifyError);
              }}
            >
              Undo
            </Button>
          </Group>
        ),
      });
      return entry;
    } catch (error) {
      notifyError(error);
      return null;
    }
  };
}
