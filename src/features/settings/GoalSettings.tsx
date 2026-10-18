import { Button, Stack } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { useEffect } from 'react';
import { SectionCard } from '@/components/SectionCard';
import { useCurrentGoal, usePreferences, useSaveGoal } from '@/features/profile/api';
import { WeightInput } from '@/features/profile/WeightInput';
import { notifyError, notifySaved } from '@/lib/notify';
import { unitLabels, weightFromDisplay, weightToDisplay } from '@/lib/units';

export function GoalSettings() {
  const { units } = usePreferences();
  const { data: goal } = useCurrentGoal();
  const save = useSaveGoal();
  const labels = unitLabels(units);
  const form = useForm({
    initialValues: {
      start: '' as number | '',
      target: '' as number | '',
      target_date: null as string | null,
    },
    validate: {
      start: (v) => (typeof v === 'number' && v > 0 ? null : 'Required'),
      target: (v) => (typeof v === 'number' && v > 0 ? null : 'Required'),
    },
  });

  useEffect(() => {
    if (!goal) return;
    form.setValues({
      start: weightToDisplay(goal.start_weight_kg, units),
      target: weightToDisplay(goal.target_weight_kg, units),
      target_date: goal.target_date,
    });
    form.resetDirty();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goal, units]);

  const submit = form.onSubmit((v) =>
    save.mutate(
      {
        start_weight_kg: weightFromDisplay(Number(v.start), units),
        target_weight_kg: weightFromDisplay(Number(v.target), units),
        target_date: v.target_date,
      },
      { onSuccess: () => notifySaved('Goal updated'), onError: notifyError },
    ),
  );

  return (
    <SectionCard
      title="Weight goal"
      description="Changing your goal keeps a history; past progress stays intact."
    >
      <form onSubmit={submit}>
        <Stack>
          <WeightInput label={`Starting weight (${labels.weight})`} {...form.getInputProps('start')} />
          <WeightInput label={`Goal weight (${labels.weight})`} {...form.getInputProps('target')} />
          <DateInput
            label="Target date (optional)"
            clearable
            valueFormat="MMM D, YYYY"
            {...form.getInputProps('target_date')}
          />
          <Button type="submit" loading={save.isPending} disabled={!form.isDirty()}>
            Save goal
          </Button>
        </Stack>
      </form>
    </SectionCard>
  );
}
