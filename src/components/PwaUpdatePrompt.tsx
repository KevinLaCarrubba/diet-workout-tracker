import { Button, Group, Notification, Portal, Text } from '@mantine/core';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useWorkoutActivity } from '@/stores/workoutActivityStore';

/**
 * A new service worker never takes over on its own (registerType: 'prompt').
 * During an active workout the update waits until the session is finished.
 */
export function PwaUpdatePrompt() {
  const workoutActive = useWorkoutActivity((s) => s.active);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // Check for updates hourly while the app stays open.
      if (registration) setInterval(() => registration.update().catch(() => {}), 60 * 60 * 1000);
    },
  });

  if (!needRefresh) return null;
  return (
    <Portal>
      <Notification
        title="Update available"
        withCloseButton
        onClose={() => setNeedRefresh(false)}
        style={{
          position: 'fixed',
          left: 12,
          right: 12,
          bottom: 'calc(var(--app-nav-height) + var(--safe-bottom) + 12px)',
          zIndex: 400,
          maxWidth: 420,
          marginInline: 'auto',
        }}
      >
        {workoutActive ? (
          <Text size="sm">A new version will be applied after you finish your workout.</Text>
        ) : (
          <Group justify="space-between" wrap="nowrap">
            <Text size="sm">Reload to get the latest FitTrack.</Text>
            <Button size="xs" onClick={() => updateServiceWorker(true)}>
              Reload
            </Button>
          </Group>
        )}
      </Notification>
    </Portal>
  );
}
