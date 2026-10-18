import { Button, SegmentedControl, Select, Stack, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useEffect } from 'react';
import { SectionCard } from '@/components/SectionCard';
import { useProfile, useUpdateProfile } from '@/features/profile/api';
import { HeightInput } from '@/features/profile/HeightInput';
import { notifyError, notifySaved } from '@/lib/notify';
import { timezoneOptions } from '@/lib/time';
import type { UnitSystem } from '@/lib/units';

export function ProfileSettings() {
  const { data: profile } = useProfile();
  const update = useUpdateProfile();
  const form = useForm({
    initialValues: {
      display_name: '',
      preferred_units: 'imperial' as UnitSystem,
      timezone: 'UTC',
      height_cm: null as number | null,
    },
    validate: {
      display_name: (v) => (v.trim().length === 0 ? 'Required' : v.length > 60 ? 'Too long' : null),
    },
  });

  useEffect(() => {
    if (!profile) return;
    form.setValues({
      display_name: profile.display_name,
      preferred_units: profile.preferred_units,
      timezone: profile.timezone,
      height_cm: profile.height_cm,
    });
    form.resetDirty();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  const submit = form.onSubmit((v) =>
    update.mutate(
      { ...v, display_name: v.display_name.trim() },
      { onSuccess: () => notifySaved(), onError: notifyError },
    ),
  );

  return (
    <SectionCard title="Profile">
      <form onSubmit={submit}>
        <Stack>
          <TextInput label="Display name" {...form.getInputProps('display_name')} />
          <Stack gap={4}>
            <Text size="sm" fw={500}>
              Units
            </Text>
            <SegmentedControl
              fullWidth
              data={[
                { label: 'Imperial', value: 'imperial' },
                { label: 'Metric', value: 'metric' },
              ]}
              {...form.getInputProps('preferred_units')}
            />
          </Stack>
          <Select label="Timezone" searchable data={timezoneOptions()} {...form.getInputProps('timezone')} />
          <HeightInput
            units={form.values.preferred_units}
            valueCm={form.values.height_cm}
            onChange={(cm) => form.setFieldValue('height_cm', cm)}
          />
          <Button type="submit" loading={update.isPending} disabled={!form.isDirty()}>
            Save profile
          </Button>
        </Stack>
      </form>
    </SectionCard>
  );
}
