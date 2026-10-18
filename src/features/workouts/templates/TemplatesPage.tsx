import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Modal,
  Skeleton,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from '@mantine/core';
import { IconChevronRight, IconCopy, IconPlus } from '@tabler/icons-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { PageHeader } from '@/components/PageHeader';
import { SectionCard } from '@/components/SectionCard';
import { notifyError, notifySaved } from '@/lib/notify';
import { useSharedPlans, useTemplates, type TemplateWithExercises } from '../api';
import { useCopyTemplate, useCreateTemplate } from './api';
import { groupPlans, groupSummary } from './helpers';

function TemplateRow({ template }: { template: TemplateWithExercises }) {
  const groups = groupSummary(template);
  const count = template.items.length;
  return (
    <Card p={0}>
      <UnstyledButton component={Link} to={`/workouts/templates/${template.id}`} p="sm" mih={60} w="100%">
        <Group justify="space-between" wrap="nowrap">
          <div style={{ minWidth: 0 }}>
            <Text fw={700} truncate>
              {template.title}
            </Text>
            <Text size="xs" c="dimmed" truncate>
              {count} {count === 1 ? 'exercise' : 'exercises'}
              {groups
                ? ` · ${groups}`
                : count > 0
                  ? ` · ${template.items.map((i) => i.exercise.name).join(', ')}`
                  : ''}
            </Text>
          </div>
          <IconChevronRight
            size={18}
            color="var(--mantine-color-dimmed)"
            aria-hidden
            style={{ flexShrink: 0 }}
          />
        </Group>
      </UnstyledButton>
    </Card>
  );
}

function NewTemplateModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const create = useCreateTemplate();
  const [title, setTitle] = useState('');
  const trimmed = title.trim();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!trimmed || trimmed.length > 80) return;
    create.mutate(
      { title: trimmed },
      {
        onSuccess: (id) => {
          setTitle('');
          onClose();
          void navigate(`/workouts/templates/${id}`);
        },
        onError: notifyError,
      },
    );
  };
  return (
    <Modal opened={opened} onClose={onClose} title="New template" centered>
      <form onSubmit={submit}>
        <Stack>
          <TextInput
            label="Title"
            placeholder="e.g. Upper body A"
            size="md"
            data-autofocus
            value={title}
            maxLength={80}
            onChange={(e) => setTitle(e.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!trimmed} loading={create.isPending}>
              Create
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

function PlanLibrary() {
  const plans = useSharedPlans();
  const copy = useCopyTemplate();
  const [copying, setCopying] = useState<string | null>(null);

  const copyPlan = async (name: string, templates: TemplateWithExercises[]) => {
    setCopying(name);
    try {
      for (const t of templates) await copy.mutateAsync(t.id);
      notifySaved(templates.length === 1 ? 'Added to your templates' : `Added ${templates.length} templates`);
    } catch (error) {
      notifyError(error);
    } finally {
      setCopying(null);
    }
  };

  return (
    <SectionCard title="Plan library" description="Proven starting points. Copy one, then edit anything.">
      {plans.isPending ? (
        <Stack gap="xs">
          <Skeleton h={96} />
          <Skeleton h={96} />
        </Stack>
      ) : plans.isError ? (
        <Text size="sm" c="dimmed">
          The plan library isn't available right now.
        </Text>
      ) : plans.data.length === 0 ? (
        <Text size="sm" c="dimmed">
          No shared plans yet.
        </Text>
      ) : (
        <Stack gap="md">
          {groupPlans(plans.data).map((plan) => (
            <Card key={plan.name} withBorder p="sm">
              <Stack gap="xs">
                <Group justify="space-between" wrap="nowrap">
                  <Text fw={700}>{plan.name}</Text>
                  <Badge variant="light" color="gray">
                    {plan.templates.length} {plan.templates.length === 1 ? 'day' : 'days'}
                  </Badge>
                </Group>
                <Stack gap={2}>
                  {plan.templates.map((t) => (
                    <Text
                      key={t.id}
                      component={Link}
                      to={`/workouts/templates/${t.id}`}
                      size="sm"
                      c="dimmed"
                      py={4}
                      style={{ textDecoration: 'none' }}
                    >
                      {t.title} · {t.items.length} exercises ›
                    </Text>
                  ))}
                </Stack>
                <Button
                  variant="light"
                  leftSection={<IconCopy size={18} />}
                  loading={copying === plan.name}
                  disabled={copying !== null && copying !== plan.name}
                  onClick={() => void copyPlan(plan.name, plan.templates)}
                >
                  Use this plan
                </Button>
              </Stack>
            </Card>
          ))}
        </Stack>
      )}
    </SectionCard>
  );
}

export function TemplatesPage() {
  const templates = useTemplates();
  const [creating, setCreating] = useState(false);

  return (
    <Stack>
      <PageHeader
        title="Templates"
        subtitle="Reusable workouts you can schedule and start."
        action={
          <Button leftSection={<IconPlus size={18} />} onClick={() => setCreating(true)}>
            New
          </Button>
        }
      />

      {templates.isPending ? (
        <Stack gap="xs">
          <Skeleton h={60} radius="lg" />
          <Skeleton h={60} radius="lg" />
          <Skeleton h={60} radius="lg" />
        </Stack>
      ) : templates.isError ? (
        <Alert color="red" variant="light" title="Couldn't load your templates">
          <Stack gap="xs">
            <Text size="sm">{templates.error.message}</Text>
            <Button size="sm" variant="default" w="fit-content" onClick={() => void templates.refetch()}>
              Try again
            </Button>
          </Stack>
        </Alert>
      ) : templates.data.length === 0 ? (
        <Card>
          <Stack align="center" gap="xs" py="sm">
            <Text c="dimmed" ta="center">
              No templates yet. Copy a plan from the library below, or build your own.
            </Text>
            <Button leftSection={<IconPlus size={18} />} onClick={() => setCreating(true)}>
              New template
            </Button>
          </Stack>
        </Card>
      ) : (
        <Stack gap="xs">
          {templates.data.map((t) => (
            <TemplateRow key={t.id} template={t} />
          ))}
        </Stack>
      )}

      <PlanLibrary />
      <NewTemplateModal opened={creating} onClose={() => setCreating(false)} />
    </Stack>
  );
}
