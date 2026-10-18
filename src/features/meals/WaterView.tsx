import {
  ActionIcon,
  Button,
  Center,
  Group,
  Modal,
  NumberInput,
  RingProgress,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { IconCloudUp, IconPencil, IconX } from '@tabler/icons-react';
import { useState } from 'react';
import { SectionCard } from '@/components/SectionCard';
import { usePreferences, useSettings, useUpdateSettings } from '@/features/profile/api';
import { notifyError, notifySaved } from '@/lib/notify';
import { dayjs, localDate } from '@/lib/time';
import { formatVolume, unitLabels, volumeFromDisplay, volumeToDisplay } from '@/lib/units';
import { useWaterActions, useWaterDay } from './api';
import { useWaterAdd } from './useWaterAdd';
import { goalPercent, isValidAmount, quickAddPresets, totalMl, WATER_MAX_ML, type WaterEntry } from './water';
import { WaterHistoryChart } from './WaterHistoryChart';

function AmountModal({
  title,
  opened,
  initialMl,
  minMl = 1,
  maxMl = WATER_MAX_ML,
  confirmLabel,
  onClose,
  onSubmit,
}: {
  title: string;
  opened: boolean;
  initialMl: number | null;
  minMl?: number;
  maxMl?: number;
  confirmLabel: string;
  onClose: () => void;
  onSubmit: (ml: number) => void;
}) {
  const { units } = usePreferences();
  const unit = unitLabels(units).volume;
  const [value, setValue] = useState<number | string>('');
  const [error, setError] = useState<string | null>(null);
  const [openedFor, setOpenedFor] = useState<number | null | undefined>(undefined);
  if (opened && openedFor !== initialMl) {
    setOpenedFor(initialMl);
    setValue(initialMl ? volumeToDisplay(initialMl, units) : '');
    setError(null);
  }
  if (!opened && openedFor !== undefined) setOpenedFor(undefined);

  const submit = () => {
    const ml = volumeFromDisplay(Number(value), units);
    if (!value || !Number.isFinite(ml) || ml < minMl || ml > maxMl) {
      setError(`Enter ${volumeToDisplay(minMl, units)}–${volumeToDisplay(maxMl, units)} ${unit}`);
      return;
    }
    onSubmit(ml);
  };

  return (
    <Modal opened={opened} onClose={onClose} title={title} centered>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Stack>
          <NumberInput
            label={`Amount (${unit})`}
            inputMode="decimal"
            min={0}
            data-autofocus
            value={value}
            onChange={setValue}
            error={error}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">{confirmLabel}</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

export function WaterView() {
  const { units, timezone } = usePreferences();
  const today = localDate(timezone);
  const settings = useSettings();
  const updateSettings = useUpdateSettings();
  const day = useWaterDay(today);
  const actions = useWaterActions();
  const add = useWaterAdd();
  const [custom, setCustom] = useState<number | string>('');
  const [customError, setCustomError] = useState<string | null>(null);
  const [editing, setEditing] = useState<WaterEntry | null>(null);
  const [editingGoal, setEditingGoal] = useState(false);

  const unit = unitLabels(units).volume;
  const goal = settings.data?.water_goal_ml ?? null;
  const total = totalMl(day.entries);
  const percent = goalPercent(total, goal);
  const presets = quickAddPresets(units);

  const addCustom = () => {
    const ml = volumeFromDisplay(Number(custom), units);
    if (!custom || !isValidAmount(ml)) {
      setCustomError(`Enter up to ${volumeToDisplay(WATER_MAX_ML, units)} ${unit}`);
      return;
    }
    setCustomError(null);
    setCustom('');
    void add(ml);
  };

  return (
    <Stack>
      <SectionCard
        title="Today"
        action={
          <Button
            variant="subtle"
            size="xs"
            leftSection={<IconPencil size={14} />}
            onClick={() => setEditingGoal(true)}
            disabled={!settings.data}
          >
            Target
          </Button>
        }
      >
        <Center>
          {settings.isPending ? (
            <Skeleton circle h={180} />
          ) : (
            <RingProgress
              size={180}
              thickness={14}
              roundCaps
              sections={[{ value: percent, color: 'blue' }]}
              rootColor="var(--mantine-color-default-border)"
              label={
                <Stack gap={0} align="center">
                  <Text fz={28} fw={800} className="tabular" lh={1.1}>
                    {volumeToDisplay(total, units)}
                  </Text>
                  <Text size="sm" c="dimmed">
                    {goal ? `of ${formatVolume(goal, units)}` : unit}
                  </Text>
                </Stack>
              }
              aria-label={goal ? `${percent}% of today's target` : undefined}
            />
          )}
        </Center>
        <SimpleGrid cols={4} spacing="xs">
          {presets.map((p) => (
            <Button
              key={p.ml}
              size="lg"
              fz="sm"
              variant="light"
              color="blue"
              px={4}
              onClick={() => void add(p.ml)}
            >
              +{p.label}
            </Button>
          ))}
        </SimpleGrid>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            addCustom();
          }}
        >
          <Group align="flex-start" wrap="nowrap" gap="xs">
            <NumberInput
              style={{ flex: 1 }}
              aria-label={`Custom amount (${unit})`}
              placeholder={`Custom amount (${unit})`}
              inputMode="decimal"
              min={0}
              value={custom}
              onChange={setCustom}
              error={customError}
            />
            <Button type="submit" size="md" variant="default">
              Add
            </Button>
          </Group>
        </form>
      </SectionCard>

      <SectionCard title="Today's entries">
        {day.isPending && day.entries.length === 0 ? (
          <Skeleton h={60} />
        ) : day.entries.length === 0 ? (
          <Text size="sm" c="dimmed">
            Nothing logged yet today. Tap a quick-add button above.
          </Text>
        ) : (
          <Stack gap={4}>
            {day.entries.map((e) => (
              <Group key={e.id} justify="space-between" wrap="nowrap">
                <UnstyledButton
                  onClick={() => setEditing(e)}
                  style={{ flex: 1, minHeight: 44 }}
                  aria-label={`Edit ${formatVolume(e.amount_ml, units)} at ${dayjs(e.occurred_at).tz(timezone).format('h:mm A')}`}
                >
                  <Group gap="sm" wrap="nowrap">
                    <Text size="sm" c="dimmed" w={72} className="tabular">
                      {dayjs(e.occurred_at).tz(timezone).format('h:mm A')}
                    </Text>
                    <Text fw={600} className="tabular">
                      {formatVolume(e.amount_ml, units)}
                    </Text>
                    {e.pending && (
                      <Tooltip label="Saved on this device — will sync">
                        <IconCloudUp size={16} opacity={0.6} aria-label="Waiting to sync" />
                      </Tooltip>
                    )}
                  </Group>
                </UnstyledButton>
                <ActionIcon
                  size="xl"
                  color="gray"
                  aria-label={`Remove ${formatVolume(e.amount_ml, units)}`}
                  onClick={() => void actions.remove(e).then(() => notifySaved('Entry removed'), notifyError)}
                >
                  <IconX size={18} />
                </ActionIcon>
              </Group>
            ))}
          </Stack>
        )}
      </SectionCard>

      <WaterHistoryChart goalMl={goal} todayTotalMl={total} />

      <AmountModal
        title="Edit entry"
        opened={!!editing}
        initialMl={editing?.amount_ml ?? null}
        confirmLabel="Save"
        onClose={() => setEditing(null)}
        onSubmit={(ml) => {
          if (editing) void actions.update(editing, ml).then(() => notifySaved(), notifyError);
          setEditing(null);
        }}
      />
      <AmountModal
        title="Daily water target"
        opened={editingGoal}
        initialMl={goal}
        minMl={250}
        maxMl={10000}
        confirmLabel="Save target"
        onClose={() => setEditingGoal(false)}
        onSubmit={(ml) =>
          updateSettings.mutate(
            { water_goal_ml: ml },
            {
              onSuccess: () => {
                notifySaved('Target updated');
                setEditingGoal(false);
              },
              onError: notifyError,
            },
          )
        }
      />
    </Stack>
  );
}
