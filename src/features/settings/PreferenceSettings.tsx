import {
  Group,
  NumberInput,
  SegmentedControl,
  Select,
  Skeleton,
  Stack,
  Switch,
  TagsInput,
  Text,
} from '@mantine/core';
import { TimeInput } from '@mantine/dates';
import { SectionCard } from '@/components/SectionCard';
import { usePreferences, useSettings, useUpdateSettings, type SettingsPatch } from '@/features/profile/api';
import { notifyError } from '@/lib/notify';
import { unitLabels, volumeFromDisplay, volumeToDisplay } from '@/lib/units';

function useSettingsPatch() {
  const update = useUpdateSettings();
  return (patch: SettingsPatch) => update.mutate(patch, { onError: notifyError });
}

export function AppearanceSettings() {
  const { data } = useSettings();
  const patch = useSettingsPatch();
  if (!data) return <Skeleton h={160} radius="lg" />;
  return (
    <SectionCard title="App">
      <Stack>
        <Stack gap={4}>
          <Text size="sm" fw={500}>
            Theme
          </Text>
          <SegmentedControl
            fullWidth
            value={data.theme}
            onChange={(v) => patch({ theme: v as typeof data.theme })}
            data={[
              { label: 'Dark', value: 'dark' },
              { label: 'Light', value: 'light' },
              { label: 'System', value: 'auto' },
            ]}
          />
        </Stack>
        <Switch
          size="md"
          label="Sounds"
          description="Rest-timer chime while the app is open"
          checked={data.sound_enabled}
          onChange={(e) => patch({ sound_enabled: e.currentTarget.checked })}
        />
        <Switch
          size="md"
          label="Vibration"
          description="Where supported by your phone"
          checked={data.vibration_enabled}
          onChange={(e) => patch({ vibration_enabled: e.currentTarget.checked })}
        />
      </Stack>
    </SectionCard>
  );
}

export function WaterGoalSettings() {
  const { data } = useSettings();
  const { units } = usePreferences();
  const patch = useSettingsPatch();
  if (!data) return <Skeleton h={120} radius="lg" />;
  const label = unitLabels(units).volume;
  return (
    <SectionCard
      title="Daily water target"
      description="A personal target you choose; it is not a medical recommendation."
    >
      <NumberInput
        key={`${units}-${data.water_goal_ml}`}
        label={`Target (${label})`}
        min={units === 'imperial' ? 8 : 250}
        max={units === 'imperial' ? 338 : 10000}
        step={units === 'imperial' ? 8 : 250}
        allowDecimal={false}
        inputMode="numeric"
        defaultValue={volumeToDisplay(data.water_goal_ml, units)}
        onBlur={(e) => {
          const value = Number(e.currentTarget.value.replace(/[^\d.]/g, ''));
          const ml = volumeFromDisplay(value, units);
          if (ml >= 250 && ml <= 10000 && ml !== data.water_goal_ml) patch({ water_goal_ml: ml });
        }}
      />
    </SectionCard>
  );
}

export function ReminderSettings() {
  const { data } = useSettings();
  const patch = useSettingsPatch();
  if (!data) return <Skeleton h={320} radius="lg" />;
  return (
    <SectionCard
      title="Reminder preferences"
      description="Choose what FitTrack may remind you about once notifications are enabled on this device."
    >
      <Stack>
        <Switch
          size="md"
          label="Meal times"
          checked={data.notify_meals}
          onChange={(e) => patch({ notify_meals: e.currentTarget.checked })}
        />
        <Switch
          size="md"
          label="Gentle follow-up for pending meals"
          description="One nudge if a meal is still pending 45 minutes after its time"
          checked={data.notify_meal_followup}
          onChange={(e) => patch({ notify_meal_followup: e.currentTarget.checked })}
        />
        <Switch
          size="md"
          label="Upcoming workouts"
          checked={data.notify_workouts}
          onChange={(e) => patch({ notify_workouts: e.currentTarget.checked })}
        />
        {data.notify_workouts && (
          <NumberInput
            label="Remind me this many minutes before"
            min={0}
            max={240}
            step={5}
            allowDecimal={false}
            defaultValue={data.workout_reminder_minutes}
            onBlur={(e) => {
              const v = Number(e.currentTarget.value);
              if (v >= 0 && v <= 240 && v !== data.workout_reminder_minutes)
                patch({ workout_reminder_minutes: v });
            }}
          />
        )}
        <Switch
          size="md"
          label="Missed workout check-in"
          description="Only if a scheduled workout wasn't started, skipped or moved"
          checked={data.notify_missed_workouts}
          onChange={(e) => patch({ notify_missed_workouts: e.currentTarget.checked })}
        />
        {data.notify_missed_workouts && (
          <NumberInput
            label="Grace period (minutes)"
            min={15}
            max={1440}
            step={15}
            allowDecimal={false}
            defaultValue={data.missed_workout_grace_minutes}
            onBlur={(e) => {
              const v = Number(e.currentTarget.value);
              if (v >= 15 && v <= 1440 && v !== data.missed_workout_grace_minutes)
                patch({ missed_workout_grace_minutes: v });
            }}
          />
        )}
        <Switch
          size="md"
          label="Morning weigh-in"
          description="Only if you haven't logged a weight yet that day"
          checked={data.notify_weigh_in}
          onChange={(e) => patch({ notify_weigh_in: e.currentTarget.checked })}
        />
        {data.notify_weigh_in && (
          <TimeInput
            label="Weigh-in reminder time"
            defaultValue={data.weigh_in_time.slice(0, 5)}
            onBlur={(e) => e.currentTarget.value && patch({ weigh_in_time: e.currentTarget.value })}
          />
        )}
        <Switch
          size="md"
          label="Water reminders"
          description="A few spaced reminders while you're behind your target"
          checked={data.notify_water}
          onChange={(e) => patch({ notify_water: e.currentTarget.checked })}
        />
        {data.notify_water && (
          <TagsInput
            label="Water check-in times"
            description="24-hour HH:MM, e.g. 14:00"
            defaultValue={data.water_reminder_times.map((t) => t.slice(0, 5))}
            maxTags={8}
            onChange={(values) => {
              const times = values.filter((v) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v));
              if (times.length === values.length) patch({ water_reminder_times: times });
            }}
          />
        )}
        <Switch
          size="md"
          label="Weekly summary"
          checked={data.notify_weekly_summary}
          onChange={(e) => patch({ notify_weekly_summary: e.currentTarget.checked })}
        />
        {data.notify_weekly_summary && (
          <Group grow>
            <Select
              label="Day"
              value={String(data.weekly_summary_weekday)}
              data={['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => ({
                value: String(i + 1),
                label: d,
              }))}
              onChange={(v) => v && patch({ weekly_summary_weekday: Number(v) })}
              allowDeselect={false}
            />
            <TimeInput
              label="Time"
              defaultValue={data.weekly_summary_time.slice(0, 5)}
              onBlur={(e) => e.currentTarget.value && patch({ weekly_summary_time: e.currentTarget.value })}
            />
          </Group>
        )}
        <Switch
          size="md"
          label="Quiet hours"
          description="No notifications during this window (your timezone)"
          checked={data.quiet_hours_enabled}
          onChange={(e) => patch({ quiet_hours_enabled: e.currentTarget.checked })}
        />
        {data.quiet_hours_enabled && (
          <Group grow>
            <TimeInput
              label="From"
              defaultValue={data.quiet_hours_start.slice(0, 5)}
              onBlur={(e) => e.currentTarget.value && patch({ quiet_hours_start: e.currentTarget.value })}
            />
            <TimeInput
              label="Until"
              defaultValue={data.quiet_hours_end.slice(0, 5)}
              onBlur={(e) => e.currentTarget.value && patch({ quiet_hours_end: e.currentTarget.value })}
            />
          </Group>
        )}
      </Stack>
    </SectionCard>
  );
}
