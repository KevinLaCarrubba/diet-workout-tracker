import { ActionIcon, Menu, NumberInput, Text, UnstyledButton } from '@mantine/core';
import { IconCheck, IconDots, IconPlayerPlay } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import type { DraftSet, PreviousSet, RepMode } from '@/offline/types';
import { weightFromDisplay, weightToDisplay, type UnitSystem } from '@/lib/units';
import classes from './ActiveWorkout.module.css';

interface Props {
  set: DraftSet;
  index: number;
  workingIndex: number | null;
  previous: PreviousSet | null;
  units: UnitSystem;
  isBodyweight: boolean;
  repMode: RepMode;
  onChange: (patch: {
    weight_kg?: number | null;
    reps?: number | null;
    rpe?: number | null;
    is_warmup?: boolean;
    duration_seconds?: number | null;
  }) => void;
  onToggle: (completed: boolean) => void;
  onRemove: () => void;
  onEditDetails: () => void;
}

const fmt = (n: number | null) => (n == null ? '' : String(n));

/** One-line set entry: number, previous, weight, reps, done. Big targets for one-handed use. */
export function SetRow({
  set,
  index,
  workingIndex,
  previous,
  units,
  isBodyweight,
  repMode,
  onChange,
  onToggle,
  onRemove,
  onEditDetails,
}: Props) {
  const timed = repMode === 'timed';
  // Hold timer for timed sets (wall sits, hangs): start on tap, stop + log on second tap.
  const [holdStart, setHoldStart] = useState<number | null>(null);
  const [holdNow, setHoldNow] = useState(0);
  useEffect(() => {
    if (holdStart == null) return;
    const id = setInterval(() => setHoldNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [holdStart]);
  const holdSeconds = holdStart == null ? 0 : Math.max(0, Math.floor((holdNow - holdStart) / 1000));
  const displayWeight = set.weight_kg == null ? null : weightToDisplay(set.weight_kg, units);
  const [weight, setWeight] = useState<string | number>(fmt(displayWeight));
  const repsValue = timed ? set.duration_seconds : set.reps;
  const [reps, setReps] = useState<string | number>(fmt(repsValue));

  // Follow external changes (prefill carry-over, substitution): reset local text when the stored value changes.
  const [seen, setSeen] = useState({ displayWeight, repsValue });
  if (seen.displayWeight !== displayWeight || seen.repsValue !== repsValue) {
    setSeen({ displayWeight, repsValue });
    if (seen.displayWeight !== displayWeight) setWeight(fmt(displayWeight));
    if (seen.repsValue !== repsValue) setReps(fmt(repsValue));
  }

  const commitWeight = (v: string | number) => {
    const n = typeof v === 'number' ? v : v === '' ? null : Number(v);
    if (n !== null && Number.isNaN(n)) return;
    const kg = n == null ? null : weightFromDisplay(n, units);
    if (kg !== set.weight_kg) onChange({ weight_kg: kg });
  };
  const commitReps = (v: string | number) => {
    const n = typeof v === 'number' ? Math.round(v) : v === '' ? null : Math.round(Number(v));
    if (n !== null && Number.isNaN(n)) return;
    if (timed) {
      if (n !== set.duration_seconds) onChange({ duration_seconds: n });
    } else if (n !== set.reps) onChange({ reps: n });
  };

  const done = !!set.completed_at;
  const prevWeight =
    previous?.weight_kg != null && previous.weight_kg > 0
      ? `${isBodyweight ? '+' : ''}${weightToDisplay(previous.weight_kg, units)}`
      : isBodyweight || timed
        ? ''
        : 'BW';
  const prevLabel = !previous
    ? '—'
    : timed
      ? `${prevWeight ? `${prevWeight} · ` : ''}${previous.duration_seconds ?? '–'}s`
      : `${prevWeight || 'BW'}×${previous.reps ?? '–'}`;

  return (
    <div className={classes.setRow} data-completed={done || undefined} data-testid="set-row">
      <UnstyledButton
        onClick={() => onChange({ is_warmup: !set.is_warmup })}
        aria-label={
          set.is_warmup
            ? `Set ${index + 1}: warm-up. Tap to make a working set`
            : `Set ${workingIndex}. Tap to mark as warm-up`
        }
        style={{ textAlign: 'center', minHeight: 44 }}
      >
        <Text fw={800} c={set.is_warmup ? 'yellow' : undefined}>
          {set.is_warmup ? 'W' : workingIndex}
        </Text>
      </UnstyledButton>
      <Text size="sm" c="dimmed" ta="center" className="tabular" truncate>
        {prevLabel}
      </Text>
      <NumberInput
        aria-label={`Set ${index + 1} weight`}
        className={`${classes.setInput} ${set.prefilled ? classes.prefilled : ''}`}
        hideControls
        inputMode="decimal"
        decimalScale={2}
        min={0}
        max={2000}
        placeholder={isBodyweight ? 'BW' : '0'}
        value={weight}
        onChange={(v) => {
          setWeight(v);
          if (typeof v === 'number') commitWeight(v);
        }}
        onBlur={() => commitWeight(weight)}
        onFocus={(e) => e.currentTarget.select()}
      />
      <NumberInput
        aria-label={timed ? `Set ${index + 1} seconds` : `Set ${index + 1} reps`}
        className={`${classes.setInput} ${set.prefilled ? classes.prefilled : ''}`}
        hideControls
        inputMode="numeric"
        allowDecimal={false}
        min={0}
        max={1000}
        placeholder={
          timed ? (holdStart != null ? String(holdSeconds) : 'sec') : repMode === 'amrap' ? 'max' : '0'
        }
        value={holdStart != null ? holdSeconds : reps}
        readOnly={holdStart != null}
        onChange={(v) => {
          setReps(v);
          if (typeof v === 'number') commitReps(v);
        }}
        onBlur={() => commitReps(reps)}
        onFocus={(e) => e.currentTarget.select()}
      />
      {timed && !done && set.duration_seconds == null ? (
        <ActionIcon
          className={classes.check}
          variant={holdStart != null ? 'filled' : 'default'}
          color={holdStart != null ? 'blue' : undefined}
          radius="md"
          aria-label={
            holdStart != null ? `Stop hold at ${holdSeconds} seconds` : `Start timing set ${index + 1}`
          }
          onClick={() => {
            if (holdStart == null) {
              const start = Date.now();
              setHoldStart(start);
              setHoldNow(start);
              return;
            }
            const secs = Math.max(1, Math.floor((Date.now() - holdStart) / 1000));
            setHoldStart(null);
            onChange({ duration_seconds: secs });
            onToggle(true);
          }}
        >
          {holdStart != null ? (
            <Text fw={800} size="sm" className="tabular">
              {holdSeconds}s
            </Text>
          ) : (
            <IconPlayerPlay size={22} />
          )}
        </ActionIcon>
      ) : (
        <ActionIcon
          className={classes.check}
          variant={done ? 'filled' : 'default'}
          radius="md"
          aria-label={done ? `Set ${index + 1} done. Tap to undo` : `Complete set ${index + 1}`}
          aria-pressed={done}
          onClick={() => onToggle(!done)}
        >
          <IconCheck size={26} stroke={3} />
        </ActionIcon>
      )}
      <Menu position="bottom-end" withinPortal>
        <Menu.Target>
          <ActionIcon size="md" aria-label={`Set ${index + 1} options`}>
            <IconDots size={18} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item onClick={onEditDetails}>RPE & note</Menu.Item>
          <Menu.Item onClick={() => onChange({ is_warmup: !set.is_warmup })}>
            {set.is_warmup ? 'Make working set' : 'Mark as warm-up'}
          </Menu.Item>
          <Menu.Item color="red" onClick={onRemove}>
            Remove set
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </div>
  );
}
