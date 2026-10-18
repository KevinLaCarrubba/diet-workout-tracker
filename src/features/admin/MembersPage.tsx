import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Code,
  CopyButton,
  Group,
  Menu,
  Modal,
  Skeleton,
  Stack,
  Switch,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconCheck, IconCopy, IconDots, IconMailPlus } from '@tabler/icons-react';
import { useState } from 'react';
import { Navigate } from 'react-router';
import { PageHeader } from '@/components/PageHeader';
import { SectionCard } from '@/components/SectionCard';
import { useUserId } from '@/features/auth/useAuth';
import { useProfile } from '@/features/profile/api';
import { notifyError, notifySaved } from '@/lib/notify';
import { dayjs } from '@/lib/time';
import { useAdminAction, useInvitations, useMembers } from './api';

const MAX_MEMBERS = 5;

function LinkModal({ link, onClose }: { link: string | null; onClose: () => void }) {
  return (
    <Modal opened={!!link} onClose={onClose} title="Share this link" centered>
      <Stack>
        <Text size="sm">
          Send this one-time link privately (text or message). It signs the person in so they can choose a
          password. It stops working once used.
        </Text>
        <Code block style={{ wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>
          {link}
        </Code>
        <CopyButton value={link ?? ''}>
          {({ copied, copy }) => (
            <Button onClick={copy} leftSection={copied ? <IconCheck size={16} /> : <IconCopy size={16} />}>
              {copied ? 'Copied' : 'Copy link'}
            </Button>
          )}
        </CopyButton>
      </Stack>
    </Modal>
  );
}

export function MembersPage() {
  const userId = useUserId();
  const { data: profile } = useProfile();
  const members = useMembers();
  const invitations = useInvitations();
  const action = useAdminAction();
  const [link, setLink] = useState<string | null>(null);
  const [removing, setRemoving] = useState<{ id: string; email: string } | null>(null);
  const form = useForm({
    initialValues: { email: '', send_email: false },
    validate: { email: (v) => (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim()) ? null : 'Enter a valid email') },
  });

  if (profile && profile.role !== 'admin') return <Navigate to="/settings" replace />;

  const pending = (invitations.data ?? []).filter(
    (i) => i.status === 'pending' && dayjs(i.expires_at).isAfter(dayjs()),
  );
  const seatsUsed = (members.data?.length ?? 0) + pending.filter((i) => !i.invited_user_id).length;

  const run = (body: Parameters<typeof action.mutate>[0], success?: string) =>
    action.mutate(body, {
      onSuccess: (res) => {
        if (res.link) setLink(res.link);
        else if (success) notifySaved(success);
      },
      onError: notifyError,
    });

  const submit = form.onSubmit((v) => {
    run(
      { action: 'invite', email: v.email.trim().toLowerCase(), send_email: v.send_email },
      'Invitation emailed',
    );
    form.reset();
  });

  return (
    <Stack>
      <PageHeader
        title="Members"
        subtitle={`${members.data?.length ?? '–'} of ${MAX_MEMBERS} seats in use`}
      />
      <SectionCard title="Invite someone" description="Invitations expire after 7 days.">
        <form onSubmit={submit}>
          <Stack>
            <TextInput label="Email" type="email" inputMode="email" {...form.getInputProps('email')} />
            <Switch
              label="Also send the invitation email"
              description="Otherwise you'll get a link to share yourself."
              {...form.getInputProps('send_email', { type: 'checkbox' })}
            />
            {seatsUsed >= MAX_MEMBERS && (
              <Alert color="yellow" variant="light">
                All {MAX_MEMBERS} seats are in use or reserved by pending invitations.
              </Alert>
            )}
            <Button
              type="submit"
              leftSection={<IconMailPlus size={18} />}
              loading={action.isPending}
              disabled={seatsUsed >= MAX_MEMBERS}
            >
              Create invitation
            </Button>
          </Stack>
        </form>
      </SectionCard>

      <SectionCard title="Members">
        {members.isPending ? (
          <Skeleton h={80} />
        ) : (
          <Stack gap="xs">
            {members.data?.map((m) => (
              <Group key={m.id} justify="space-between" wrap="nowrap">
                <div style={{ minWidth: 0 }}>
                  <Group gap={6}>
                    <Text fw={600} truncate>
                      {m.display_name || m.email}
                    </Text>
                    {m.role === 'admin' && <Badge size="xs">Admin</Badge>}
                    {!m.email_confirmed && (
                      <Badge size="xs" color="gray">
                        Invited
                      </Badge>
                    )}
                  </Group>
                  <Text size="xs" c="dimmed" truncate>
                    {m.email} ·{' '}
                    {m.last_sign_in_at
                      ? `last seen ${dayjs(m.last_sign_in_at).format('MMM D')}`
                      : 'never signed in'}
                  </Text>
                </div>
                {m.id !== userId && (
                  <Menu position="bottom-end">
                    <Menu.Target>
                      <ActionIcon aria-label={`Manage ${m.email}`}>
                        <IconDots size={18} />
                      </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Item onClick={() => run({ action: 'reset_link', user_id: m.id })}>
                        Create password-reset link
                      </Menu.Item>
                      <Menu.Item color="red" onClick={() => setRemoving({ id: m.id, email: m.email })}>
                        Remove member and their data
                      </Menu.Item>
                    </Menu.Dropdown>
                  </Menu>
                )}
              </Group>
            ))}
          </Stack>
        )}
      </SectionCard>

      <SectionCard title="Pending invitations">
        {pending.length === 0 ? (
          <Text size="sm" c="dimmed">
            No pending invitations.
          </Text>
        ) : (
          <Stack gap="xs">
            {pending.map((i) => (
              <Group key={i.id} justify="space-between" wrap="nowrap">
                <div style={{ minWidth: 0 }}>
                  <Text fw={600} truncate>
                    {i.email}
                  </Text>
                  <Text size="xs" c="dimmed">
                    Expires {dayjs(i.expires_at).format('MMM D')}
                  </Text>
                </div>
                <Group gap={4} wrap="nowrap">
                  <Tooltip label="New invite link">
                    <ActionIcon
                      aria-label={`New invite link for ${i.email}`}
                      onClick={() => run({ action: 'new_link', invitation_id: i.id })}
                    >
                      <IconCopy size={18} />
                    </ActionIcon>
                  </Tooltip>
                  <Button
                    size="xs"
                    variant="subtle"
                    color="red"
                    onClick={() => run({ action: 'revoke', invitation_id: i.id }, 'Invitation revoked')}
                  >
                    Revoke
                  </Button>
                </Group>
              </Group>
            ))}
          </Stack>
        )}
      </SectionCard>
      <LinkModal link={link} onClose={() => setLink(null)} />
      <Modal opened={!!removing} onClose={() => setRemoving(null)} title="Remove member?" centered>
        <Stack>
          <Text size="sm">
            This permanently deletes {removing?.email}'s account, workouts, logs and photos. It cannot be
            undone.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button
              color="red"
              onClick={() => {
                if (removing) run({ action: 'remove_member', user_id: removing.id }, 'Member removed');
                setRemoving(null);
              }}
            >
              Remove
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
