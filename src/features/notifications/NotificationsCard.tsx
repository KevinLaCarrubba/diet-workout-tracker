import { Alert, Badge, Button, Group, List, Skeleton, Stack, Text } from '@mantine/core';
import { IconBell, IconBellOff, IconSend } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { SectionCard } from '@/components/SectionCard';
import { useUserId } from '@/features/auth/useAuth';
import { notifyError, notifySaved } from '@/lib/notify';
import { supabase, unwrap } from '@/lib/supabase';
import { dayjs } from '@/lib/time';
import {
  currentSubscription,
  disablePush,
  enablePush,
  pushSupport,
  saveSubscription,
  sendTestNotification,
} from './push';

function useDevices() {
  const userId = useUserId();
  return useQuery({
    queryKey: ['notifications', 'devices', userId],
    queryFn: async () =>
      unwrap(
        await supabase
          .from('push_subscriptions')
          .select('id, endpoint, device_label, created_at, last_success_at, revoked_at')
          .eq('user_id', userId)
          .is('revoked_at', null)
          .order('created_at'),
      ),
  });
}

function useRecentNotifications() {
  const userId = useUserId();
  return useQuery({
    queryKey: ['notifications', 'log', userId],
    queryFn: async () =>
      unwrap(
        await supabase
          .from('notification_logs')
          .select('id, title, status, error_code, attempted_at')
          .eq('user_id', userId)
          .order('attempted_at', { ascending: false })
          .limit(8),
      ),
  });
}

/** Opt-in, per-device push setup with honest platform guidance. */
export function NotificationsCard() {
  const qc = useQueryClient();
  const support = pushSupport();
  const devices = useDevices();
  const log = useRecentNotifications();
  const [endpoint, setEndpoint] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    currentSubscription()
      .then(async (sub) => {
        setEndpoint(sub?.endpoint ?? null);
        // Keep the server copy fresh (keys can rotate).
        if (sub && Notification.permission === 'granted') await saveSubscription(sub).catch(() => undefined);
      })
      .catch(() => setEndpoint(null));
  }, []);

  const refresh = () => qc.invalidateQueries({ queryKey: ['notifications'] });
  const enable = useMutation({
    mutationFn: enablePush,
    onSuccess: (sub) => {
      setEndpoint(sub.endpoint);
      notifySaved('Notifications enabled on this device');
      void refresh();
    },
    onError: notifyError,
  });
  const disable = useMutation({
    mutationFn: disablePush,
    onSuccess: () => {
      setEndpoint(null);
      notifySaved('Notifications turned off on this device');
      void refresh();
    },
    onError: notifyError,
  });
  const test = useMutation({
    mutationFn: sendTestNotification,
    onSuccess: (r) =>
      r.delivered > 0
        ? notifySaved(`Test sent to ${r.delivered} device${r.delivered === 1 ? '' : 's'}`)
        : notifyError(
            new Error('The push service did not accept the test. Try turning notifications off and on.'),
          ),
    onError: notifyError,
  });

  const thisDeviceOn = !!endpoint && (devices.data ?? []).some((d) => d.endpoint === endpoint);

  return (
    <SectionCard
      title="Notifications"
      description="Opt-in per device. Delivery timing is up to your phone and browser, so reminders may arrive a few minutes late."
      action={
        thisDeviceOn ? (
          <Badge variant="light">On</Badge>
        ) : (
          <Badge color="gray" variant="light">
            Off
          </Badge>
        )
      }
    >
      <Stack>
        {!support.supported && support.reason === 'ios-not-installed' && (
          <Alert variant="light" color="blue" title="Install FitTrack to get reminders on iPhone">
            <List size="sm" type="ordered">
              <List.Item>In Safari, tap Share → “Add to Home Screen”.</List.Item>
              <List.Item>Open FitTrack from the Home Screen icon.</List.Item>
              <List.Item>Come back here and tap “Turn on notifications”.</List.Item>
            </List>
            <Text size="xs" mt="xs">
              Requires iOS 16.4 or later. Apple only allows web push for installed apps.
            </Text>
          </Alert>
        )}
        {!support.supported && (support.reason === 'no-push' || support.reason === 'no-sw') && (
          <Alert variant="light" color="yellow">
            This browser doesn't support web push notifications.
          </Alert>
        )}

        {support.supported &&
          (endpoint === undefined ? (
            <Skeleton h={42} />
          ) : thisDeviceOn ? (
            <Group grow>
              <Button
                variant="default"
                leftSection={<IconBellOff size={18} />}
                loading={disable.isPending}
                onClick={() => disable.mutate()}
              >
                Turn off here
              </Button>
              <Button
                variant="light"
                leftSection={<IconSend size={18} />}
                loading={test.isPending}
                onClick={() => test.mutate()}
              >
                Send test
              </Button>
            </Group>
          ) : (
            <Button
              leftSection={<IconBell size={18} />}
              loading={enable.isPending}
              onClick={() => enable.mutate()}
            >
              Turn on notifications
            </Button>
          ))}

        <Text size="xs" c="dimmed">
          The rest timer uses sound and vibration only while FitTrack is open — phones don't allow reliable
          background alarms for web apps.
        </Text>

        {(devices.data?.length ?? 0) > 0 && (
          <div>
            <Text size="sm" fw={600} mb={4}>
              Devices
            </Text>
            {devices.data!.map((d) => (
              <Text key={d.id} size="sm" c="dimmed">
                {d.device_label ?? 'Device'}
                {d.endpoint === endpoint ? ' (this device)' : ''} · added{' '}
                {dayjs(d.created_at).format('MMM D')}
              </Text>
            ))}
          </div>
        )}

        {(log.data?.length ?? 0) > 0 && (
          <div>
            <Text size="sm" fw={600} mb={4}>
              Recent reminders
            </Text>
            <Stack gap={2}>
              {log.data!.map((n) => (
                <Group key={n.id} justify="space-between" wrap="nowrap" gap="xs">
                  <Text size="xs" truncate>
                    {n.title}
                  </Text>
                  <Text size="xs" c={n.status === 'failed' ? 'red' : 'dimmed'} style={{ flexShrink: 0 }}>
                    {n.status === 'skipped' && n.error_code === 'quiet_hours' ? 'quiet hours' : n.status} ·{' '}
                    {dayjs(n.attempted_at).format('MMM D h:mm A')}
                  </Text>
                </Group>
              ))}
            </Stack>
          </div>
        )}
      </Stack>
    </SectionCard>
  );
}
