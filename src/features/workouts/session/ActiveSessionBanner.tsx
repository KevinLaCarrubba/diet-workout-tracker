import { Button, Group, Paper, Text } from '@mantine/core';
import { IconBarbell } from '@tabler/icons-react';
import { Link, useLocation } from 'react-router';
import { formatDuration } from '@/lib/time';
import { elapsedSeconds } from './draft';
import { useActiveDraft, useNow } from './hooks';

/** Persistent "workout in progress" bar shown above the bottom nav anywhere in the app. */
export function ActiveSessionBanner() {
  const { data: draft } = useActiveDraft();
  const location = useLocation();
  const now = useNow(1000, !!draft && !draft.paused_at);
  if (!draft || location.pathname.startsWith('/workouts/session')) return null;
  return (
    <Paper
      withBorder
      shadow="md"
      p="xs"
      pl="md"
      style={{
        position: 'fixed',
        left: 12,
        right: 12,
        bottom: 'calc(var(--app-nav-height) + var(--safe-bottom) + 8px)',
        zIndex: 150,
        maxWidth: 520,
        marginInline: 'auto',
      }}
      role="status"
    >
      <Group justify="space-between" wrap="nowrap">
        <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
          <IconBarbell size={20} color="var(--mantine-primary-color-filled)" aria-hidden />
          <div style={{ minWidth: 0 }}>
            <Text size="sm" fw={700} truncate>
              {draft.title}
            </Text>
            <Text size="xs" c="dimmed" className="tabular">
              {draft.paused_at ? 'Paused' : 'In progress'} · {formatDuration(elapsedSeconds(draft, now))}
            </Text>
          </div>
        </Group>
        <Button component={Link} to={`/workouts/session/${draft.id}`} size="sm">
          Resume
        </Button>
      </Group>
    </Paper>
  );
}
