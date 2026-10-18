import { Alert, Button, Modal, Stack, TextInput, Textarea } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useNetwork } from '@mantine/hooks';
import { IconWifiOff } from '@tabler/icons-react';
import { useEffect } from 'react';
import { usePreferences } from '@/features/profile/api';
import { WeightInput } from '@/features/profile/WeightInput';
import { notifyError, notifySaved } from '@/lib/notify';
import { dayjs } from '@/lib/time';
import { unitLabels, weightFromDisplay, weightToDisplay } from '@/lib/units';
import { useSaveWeight, type WeightLog } from './api';
import { fromLocalInput, toLocalInput } from './format';

/** Add (no `entry`) or edit a weigh-in. */
export function WeighInModal({
  opened,
  onClose,
  entry,
}: {
  opened: boolean;
  onClose: () => void;
  entry?: WeightLog | null;
}) {
  const { units, timezone } = usePreferences();
  const { online } = useNetwork();
  const save = useSaveWeight();
  const label = unitLabels(units).weight;
  const form = useForm({
    initialValues: { weight: '' as number | '', at: '', notes: '' },
    validate: {
      weight: (v) => {
        if (typeof v !== 'number') return 'Enter your weight';
        const kg = weightFromDisplay(v, units);
        return kg < 20 || kg > 400
          ? `Enter a weight between ${weightToDisplay(20, units)} and ${weightToDisplay(400, units)} ${label}`
          : null;
      },
      at: (v) => {
        if (!v) return 'Pick a date and time';
        return dayjs(fromLocalInput(v, timezone)).isAfter(dayjs().add(5, 'minute'))
          ? "Can't be in the future"
          : null;
      },
      notes: (v) => (v.length > 500 ? 'Keep notes under 500 characters' : null),
    },
  });

  useEffect(() => {
    if (!opened) return;
    form.setValues({
      weight: entry ? weightToDisplay(entry.weight_kg, units) : '',
      at: toLocalInput(entry?.measured_at ?? new Date().toISOString(), timezone),
      notes: entry?.notes ?? '',
    });
    form.resetDirty();
    form.clearErrors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, entry, units, timezone]);

  const submit = form.onSubmit((v) =>
    save.mutate(
      {
        id: entry?.id,
        weight_kg: weightFromDisplay(Number(v.weight), units),
        measured_at: fromLocalInput(v.at, timezone),
        notes: v.notes.trim() || null,
      },
      {
        onSuccess: () => {
          notifySaved(entry ? 'Weigh-in updated' : 'Weigh-in saved');
          onClose();
        },
        onError: notifyError,
      },
    ),
  );

  return (
    <Modal opened={opened} onClose={onClose} title={entry ? 'Edit weigh-in' : 'Log weight'} centered>
      <form onSubmit={submit}>
        <Stack>
          {!online && (
            <Alert color="gray" icon={<IconWifiOff size={18} />}>
              You're offline. Weigh-ins are saved directly, so this needs a connection.
            </Alert>
          )}
          <WeightInput
            label={`Weight (${label})`}
            data-autofocus
            size="lg"
            {...form.getInputProps('weight')}
          />
          <TextInput type="datetime-local" label="When" size="md" {...form.getInputProps('at')} />
          <Textarea
            label="Note (optional)"
            autosize
            minRows={2}
            maxLength={500}
            {...form.getInputProps('notes')}
          />
          <Button type="submit" size="lg" loading={save.isPending} disabled={!online}>
            {entry ? 'Save changes' : 'Save weigh-in'}
          </Button>
        </Stack>
      </form>
    </Modal>
  );
}
