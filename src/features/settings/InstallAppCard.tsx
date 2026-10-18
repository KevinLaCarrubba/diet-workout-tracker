import { Alert, Button, List, Stack, Text } from '@mantine/core';
import { IconDeviceMobile } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { SectionCard } from '@/components/SectionCard';
import { isIos, isStandalone } from '@/lib/platform';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function InstallAppCard() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone());

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed) {
    return (
      <SectionCard title="App installed">
        <Text size="sm" c="dimmed">
          You're using FitTrack from your Home Screen.
        </Text>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Install FitTrack"
      description="Get a full-screen app with offline workouts and reminders."
    >
      <Stack>
        {deferred ? (
          <Button
            leftSection={<IconDeviceMobile size={18} />}
            onClick={async () => {
              await deferred.prompt();
              const choice = await deferred.userChoice;
              if (choice.outcome === 'accepted') setInstalled(true);
              setDeferred(null);
            }}
          >
            Install app
          </Button>
        ) : isIos() ? (
          <Alert variant="light" color="blue" title="On iPhone / iPad">
            <List size="sm" type="ordered">
              <List.Item>Open FitTrack in Safari.</List.Item>
              <List.Item>Tap the Share button.</List.Item>
              <List.Item>Choose “Add to Home Screen”.</List.Item>
              <List.Item>Open FitTrack from the new Home Screen icon.</List.Item>
            </List>
            <Text size="xs" mt="xs">
              iOS only allows push notifications for apps installed to the Home Screen.
            </Text>
          </Alert>
        ) : (
          <Text size="sm" c="dimmed">
            Use your browser's menu and choose “Install app” or “Add to Home screen”.
          </Text>
        )}
      </Stack>
    </SectionCard>
  );
}
