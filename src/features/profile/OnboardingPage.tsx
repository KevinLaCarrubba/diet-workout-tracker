import {
  Alert,
  Button,
  Container,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { schemaResolver, useForm } from '@mantine/form';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import { browserTimezone, timezoneOptions } from '@/lib/time';
import { unitLabels, weightFromDisplay, type UnitSystem } from '@/lib/units';
import { useSaveGoal, useUpdateProfile } from './api';
import { HeightInput } from './HeightInput';
import { WeightInput } from './WeightInput';

const schema = z.object({
  display_name: z.string().trim().min(1, 'What should we call you?').max(60),
  preferred_units: z.enum(['imperial', 'metric']),
  timezone: z.string().min(1, 'Pick your timezone'),
  height_cm: z.number().min(50).max(275).nullable(),
  start_weight: z.number({ message: 'Enter your current weight' }).positive(),
  target_weight: z.number({ message: 'Enter a goal weight' }).positive(),
  target_date: z.string().nullable(),
});

type Values = z.input<typeof schema>;

export function OnboardingPage() {
  const navigate = useNavigate();
  const updateProfile = useUpdateProfile();
  const saveGoal = useSaveGoal();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Values>({
    initialValues: {
      display_name: '',
      preferred_units: 'imperial',
      timezone: browserTimezone(),
      height_cm: null,
      start_weight: undefined as unknown as number,
      target_weight: undefined as unknown as number,
      target_date: null,
    },
    validate: schemaResolver(schema, { sync: true }),
  });
  const units = form.values.preferred_units as UnitSystem;
  const labels = unitLabels(units);

  const submit = form.onSubmit(async (v) => {
    setError(null);
    try {
      await updateProfile.mutateAsync({
        display_name: v.display_name.trim(),
        preferred_units: v.preferred_units,
        timezone: v.timezone,
        height_cm: v.height_cm,
      });
      await saveGoal.mutateAsync({
        start_weight_kg: weightFromDisplay(v.start_weight, units),
        target_weight_kg: weightFromDisplay(v.target_weight, units),
        target_date: v.target_date,
      });
      await updateProfile.mutateAsync({ onboarded_at: new Date().toISOString() });
      navigate('/', { replace: true });
    } catch (e) {
      setError((e as Error).message);
    }
  });

  return (
    <Container size={480} py="xl">
      <Stack gap="lg">
        <div>
          <Title order={1} fz="h2">
            Welcome to FitTrack
          </Title>
          <Text c="dimmed">A few basics so your numbers, reminders and goals line up.</Text>
        </div>
        <form onSubmit={submit} noValidate>
          <Stack>
            {error && (
              <Alert color="red" variant="light" role="alert">
                {error}
              </Alert>
            )}
            <TextInput label="Display name" autoComplete="nickname" {...form.getInputProps('display_name')} />
            <Stack gap={4}>
              <Text size="sm" fw={500}>
                Units
              </Text>
              <SegmentedControl
                fullWidth
                data={[
                  { label: 'Imperial (lb, oz)', value: 'imperial' },
                  { label: 'Metric (kg, ml)', value: 'metric' },
                ]}
                {...form.getInputProps('preferred_units')}
              />
            </Stack>
            <Select
              label="Timezone"
              description="Used for meal times, workout schedules and reminders."
              searchable
              data={timezoneOptions()}
              {...form.getInputProps('timezone')}
            />
            <HeightInput
              units={units}
              valueCm={form.values.height_cm}
              onChange={(cm) => form.setFieldValue('height_cm', cm)}
            />
            <WeightInput
              label={`Starting weight (${labels.weight})`}
              {...form.getInputProps('start_weight')}
            />
            <WeightInput label={`Goal weight (${labels.weight})`} {...form.getInputProps('target_weight')} />
            <DateInput
              label="Target date (optional)"
              clearable
              minDate={new Date()}
              valueFormat="MMM D, YYYY"
              {...form.getInputProps('target_date')}
            />
            <Button type="submit" size="lg" loading={form.submitting} fullWidth mt="sm">
              Get started
            </Button>
          </Stack>
        </form>
      </Stack>
    </Container>
  );
}
