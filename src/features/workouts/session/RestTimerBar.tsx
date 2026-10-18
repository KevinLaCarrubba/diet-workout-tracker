import { ActionIcon, Button, Group, Progress, Stack, Text } from '@mantine/core';
import { IconPlayerPause, IconPlayerPlay, IconPlayerSkipForward } from '@tabler/icons-react';
import { useEffect, useRef } from 'react';
import { playChime, vibrate } from '@/lib/feedback';
import { formatDuration } from '@/lib/time';
import type { RestTimer } from '@/offline/types';
import classes from './ActiveWorkout.module.css';
import { restRemainingMs } from './draft';
import { useNow } from './hooks';

interface Props {
  rest: RestTimer;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  onPause: () => void;
  onResume: () => void;
  onAdd: (seconds: number) => void;
  onSkip: () => void;
}

/**
 * Countdown from an absolute end time, so it stays correct after the phone
 * sleeps. The chime/vibration only fire while FitTrack is open.
 */
export function RestTimerBar({
  rest,
  soundEnabled,
  vibrationEnabled,
  onPause,
  onResume,
  onAdd,
  onSkip,
}: Props) {
  const now = useNow(250, rest.ends_at != null);
  const remaining = restRemainingMs(rest, now);
  const paused = rest.ends_at == null;
  const alerted = useRef<number | null>(null);

  useEffect(() => {
    if (paused || remaining > 0 || alerted.current === rest.ends_at) return;
    alerted.current = rest.ends_at;
    // Don't chime for a timer that ran out long ago (e.g. app reopened later).
    if (rest.ends_at != null && Date.now() - rest.ends_at < 10_000) {
      if (soundEnabled) playChime();
      if (vibrationEnabled) vibrate();
    }
  }, [remaining, paused, rest.ends_at, soundEnabled, vibrationEnabled]);

  const done = remaining <= 0 && !paused;
  const pct = Math.min(100, (remaining / (rest.duration_seconds * 1000)) * 100);

  return (
    <div className={classes.restBar} role="timer" aria-live="polite" aria-label="Rest timer">
      <Stack gap={8}>
        <Group justify="space-between" wrap="nowrap">
          <div>
            <Text size="xs" c="dimmed" fw={700} tt="uppercase">
              {done ? 'Rest done' : paused ? 'Rest paused' : 'Rest'}
            </Text>
            <Text className={classes.restTime} c={done ? 'lime' : undefined}>
              {done ? 'Go!' : formatDuration(Math.ceil(remaining / 1000))}
            </Text>
          </div>
          <Group gap="xs" wrap="nowrap">
            <Button
              variant="default"
              size="md"
              onClick={() => onAdd(-15)}
              disabled={done || remaining < 15_000}
              aria-label="15 seconds less"
            >
              −15
            </Button>
            <Button variant="default" size="md" onClick={() => onAdd(30)} aria-label="30 seconds more">
              +30
            </Button>
            {!done && (
              <ActionIcon
                size={44}
                variant="default"
                onClick={paused ? onResume : onPause}
                aria-label={paused ? 'Resume rest' : 'Pause rest'}
              >
                {paused ? <IconPlayerPlay size={20} /> : <IconPlayerPause size={20} />}
              </ActionIcon>
            )}
            <ActionIcon
              size={44}
              variant={done ? 'filled' : 'default'}
              onClick={onSkip}
              aria-label={done ? 'Dismiss' : 'Skip rest'}
            >
              <IconPlayerSkipForward size={20} />
            </ActionIcon>
          </Group>
        </Group>
        <Progress value={done ? 0 : pct} size="sm" aria-hidden transitionDuration={250} />
      </Stack>
    </div>
  );
}
