import { Alert, Badge, Button, Card, Group, Modal, Skeleton, Stack, Text } from '@mantine/core';
import { IconArrowLeft, IconCloudUpload, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { PageHeader } from '@/components/PageHeader';
import { usePreferences } from '@/features/profile/api';
import { notifyError, notifySaved } from '@/lib/notify';
import { useExercises } from '../api';
import { useDeleteSession, useLocalSession, useServerSessionDetail } from './api';
import { pickDetail } from './historyModel';
import { SessionDetailView } from './SessionDetailView';

export function SessionDetailPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { units, timezone } = usePreferences();
  const server = useServerSessionDetail(sessionId);
  const local = useLocalSession(sessionId);
  const exercises = useExercises();
  const remove = useDeleteSession();
  const [confirming, setConfirming] = useState(false);

  const detail = pickDetail(server.data, local.data?.draft, local.data?.pending ?? false);
  const names = new Map((exercises.data ?? []).map((e) => [e.id, e.name]));
  const back = (
    <Button
      component={Link}
      to="/workouts/history"
      variant="subtle"
      leftSection={<IconArrowLeft size={18} />}
      px="xs"
    >
      History
    </Button>
  );

  if (local.data?.draft?.status === 'in_progress') {
    return <Navigate to={`/workouts/session/${local.data.draft.id}`} replace />;
  }

  if (!detail && (local.loading || server.isPending)) {
    return (
      <Stack>
        {back}
        <Skeleton h={32} w="60%" />
        <Skeleton h={72} />
        <Skeleton h={160} />
        <Skeleton h={160} />
      </Stack>
    );
  }

  if (!detail) {
    return (
      <Stack>
        {back}
        <PageHeader title="Workout" />
        {server.isError ? (
          <Alert color="red" variant="light" title="Couldn't load this workout">
            Check your connection and try again.
            <Button variant="subtle" size="sm" mt="xs" onClick={() => void server.refetch()}>
              Try again
            </Button>
          </Alert>
        ) : (
          <Card>
            <Text fw={700}>Workout not found</Text>
            <Text size="sm" c="dimmed">
              It may have been deleted.
            </Text>
          </Card>
        )}
      </Stack>
    );
  }

  const onDelete = () =>
    remove.mutate(
      { id: detail.id, source: detail.source },
      {
        onSuccess: () => {
          setConfirming(false);
          notifySaved('Workout deleted');
          void navigate('/workouts/history', { replace: true });
        },
        onError: notifyError,
      },
    );

  return (
    <Stack>
      {back}
      <PageHeader
        title={detail.title}
        subtitle={
          detail.source === 'device' ? (
            <Badge component="span" color="blue" variant="light" leftSection={<IconCloudUpload size={12} />}>
              Saved on this device · will sync
            </Badge>
          ) : undefined
        }
      />
      <SessionDetailView detail={detail} units={units} timezone={timezone} names={names} />
      <Button
        variant="light"
        color="red"
        size="md"
        leftSection={<IconTrash size={18} />}
        onClick={() => setConfirming(true)}
        mt="md"
      >
        Delete workout
      </Button>

      <Modal opened={confirming} onClose={() => setConfirming(false)} title="Delete this workout?" centered>
        <Stack>
          <Text size="sm">
            This removes the workout, all of its sets and any records it set, from every device. This can't be
            undone.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button color="red" loading={remove.isPending} onClick={onDelete}>
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
