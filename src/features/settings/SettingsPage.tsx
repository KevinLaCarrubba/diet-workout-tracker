import { Button, Stack, Text } from '@mantine/core';
import { IconChevronRight, IconLogout, IconUsers } from '@tabler/icons-react';
import { Link } from 'react-router';
import { PageHeader } from '@/components/PageHeader';
import { SectionCard } from '@/components/SectionCard';
import { useAuth } from '@/features/auth/useAuth';
import { NotificationsCard } from '@/features/notifications/NotificationsCard';
import { useProfile } from '@/features/profile/api';
import { supabase } from '@/lib/supabase';
import { GoalSettings } from './GoalSettings';
import { InstallAppCard } from './InstallAppCard';
import { AppearanceSettings, ReminderSettings, WaterGoalSettings } from './PreferenceSettings';
import { ProfileSettings } from './ProfileSettings';

export function SettingsPage() {
  const { session } = useAuth();
  const { data: profile } = useProfile();
  return (
    <Stack maw={640}>
      <PageHeader title="Settings" subtitle={session?.user.email} />
      <ProfileSettings />
      <GoalSettings />
      <WaterGoalSettings />
      <AppearanceSettings />
      <NotificationsCard />
      <ReminderSettings />
      <InstallAppCard />
      {profile?.role === 'admin' && (
        <SectionCard title="Admin">
          <Button
            component={Link}
            to="/settings/members"
            variant="light"
            leftSection={<IconUsers size={18} />}
            rightSection={<IconChevronRight size={16} />}
            justify="space-between"
          >
            Manage members & invitations
          </Button>
        </SectionCard>
      )}
      <SectionCard title="Account">
        <Button
          variant="default"
          leftSection={<IconLogout size={18} />}
          onClick={() => supabase.auth.signOut()}
        >
          Sign out
        </Button>
        <Text size="xs" c="dimmed">
          Your data is private to your account. Other members can't see it.
        </Text>
      </SectionCard>
    </Stack>
  );
}
