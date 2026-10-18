import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Menu,
  Modal,
  NumberInput,
  Skeleton,
  Spoiler,
  Stack,
  Text,
  Textarea,
  TextInput,
  UnstyledButton,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useMediaQuery } from '@mantine/hooks';
import {
  IconArchive,
  IconArrowDown,
  IconArrowLeft,
  IconArrowUp,
  IconCopy,
  IconDots,
  IconPencil,
  IconPlayerPlay,
  IconPlus,
  IconRestore,
  IconTrash,
} from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { PageHeader } from '@/components/PageHeader';
import { SectionCard } from '@/components/SectionCard';
import { notifyError, notifySaved } from '@/lib/notify';
import { useExercises, type Exercise, type TemplateExercise, type TemplateWithExercises } from '../api';
import { ExercisePickerModal } from '../components/ExercisePickerModal';
import { useActiveDraft, useStartWorkout } from '../session/hooks';
import {
  useAddTemplateItem,
  useCopyTemplate,
  useDeleteTemplate,
  useDeleteTemplateItem,
  useReorderTemplateItems,
  useTemplate,
  useUpdateTemplate,
} from './api';
import { groupRuns, itemTargetLabel, nextSortOrder, reorderChanges } from './helpers';
import { TemplateItemModal } from './TemplateItemModal';

function BackLink() {
  return (
    <Button
      component={Link}
      to="/workouts/templates"
      variant="subtle"
      color="gray"
      leftSection={<IconArrowLeft size={18} />}
      w="fit-content"
      px={4}
    >
      Templates
    </Button>
  );
}

interface DetailsValues {
  title: string;
  description: string;
  notes: string;
  default_rest_seconds: number | string;
}

function DetailsModal({
  template,
  opened,
  onClose,
}: {
  template: TemplateWithExercises;
  opened: boolean;
  onClose: () => void;
}) {
  const mobile = useMediaQuery('(max-width: 36em)');
  const update = useUpdateTemplate();
  const form = useForm<DetailsValues>({
    initialValues: {
      title: template.title,
      description: template.description ?? '',
      notes: template.notes ?? '',
      default_rest_seconds: template.default_rest_seconds,
    },
    validate: {
      title: (v) => (!v.trim() ? 'Give it a name' : v.trim().length > 80 ? 'Up to 80 characters' : null),
      description: (v) => (v.length > 500 ? 'Up to 500 characters' : null),
      notes: (v) => (v.length > 2000 ? 'Up to 2000 characters' : null),
      default_rest_seconds: (v) => {
        const n = Number(v);
        return Number.isInteger(n) && n >= 0 && n <= 900 ? null : '0–900 seconds';
      },
    },
  });
  const submit = form.onSubmit((v) =>
    update.mutate(
      {
        id: template.id,
        patch: {
          title: v.title.trim(),
          description: v.description.trim() || null,
          notes: v.notes.trim() || null,
          default_rest_seconds: Number(v.default_rest_seconds),
        },
      },
      {
        onSuccess: () => {
          notifySaved('Template saved');
          onClose();
        },
        onError: notifyError,
      },
    ),
  );
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Template details"
      fullScreen={mobile}
      radius={mobile ? 0 : undefined}
    >
      <form onSubmit={submit}>
        <Stack>
          <TextInput label="Title" size="md" required {...form.getInputProps('title')} />
          <TextInput label="Short description" size="md" {...form.getInputProps('description')} />
          <NumberInput
            label="Default rest between sets (seconds)"
            size="md"
            min={0}
            max={900}
            step={15}
            allowDecimal={false}
            allowNegative={false}
            inputMode="numeric"
            {...form.getInputProps('default_rest_seconds')}
          />
          <Textarea
            label="Notes"
            size="md"
            autosize
            minRows={3}
            maxRows={14}
            {...form.getInputProps('notes')}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={update.isPending}>
              Save
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

function ItemCard({
  item,
  index,
  count,
  editable,
  alternatives,
  defaultRest,
  busy,
  onEdit,
  onMove,
  onRemove,
}: {
  item: TemplateExercise;
  index: number;
  count: number;
  editable: boolean;
  alternatives: Exercise[];
  defaultRest: number;
  busy: boolean;
  onEdit: () => void;
  onMove: (to: number) => void;
  onRemove: () => void;
}) {
  const meta = [
    itemTargetLabel(item),
    item.tempo ? `Tempo ${item.tempo}` : null,
    item.rest_seconds != null && item.rest_seconds !== defaultRest ? `Rest ${item.rest_seconds}s` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const body = (
    <Stack gap={4} style={{ minWidth: 0 }}>
      <Text fw={700}>{item.exercise.name}</Text>
      <Text size="sm" c="lime" fw={600}>
        {meta}
      </Text>
      {item.notes && (
        <Text size="sm" c="dimmed" fs="italic" style={{ whiteSpace: 'pre-line' }}>
          {item.notes}
        </Text>
      )}
      {alternatives.length > 0 && (
        <Text size="xs" c="dimmed">
          Alternatives: {alternatives.map((a) => a.name).join(', ')}
        </Text>
      )}
    </Stack>
  );

  return (
    <Card p="sm">
      <Group wrap="nowrap" align="flex-start" gap="xs">
        {editable ? (
          <UnstyledButton
            onClick={onEdit}
            style={{ flex: 1, minWidth: 0 }}
            aria-label={`Edit ${item.exercise.name}`}
          >
            {body}
          </UnstyledButton>
        ) : (
          <div style={{ flex: 1, minWidth: 0 }}>{body}</div>
        )}
        {editable && (
          <Stack gap={4} style={{ flexShrink: 0 }}>
            <Group gap={4} wrap="nowrap">
              <ActionIcon
                size={44}
                variant="default"
                aria-label={`Move ${item.exercise.name} up`}
                disabled={index === 0 || busy}
                onClick={() => onMove(index - 1)}
              >
                <IconArrowUp size={18} />
              </ActionIcon>
              <ActionIcon
                size={44}
                variant="default"
                aria-label={`Move ${item.exercise.name} down`}
                disabled={index === count - 1 || busy}
                onClick={() => onMove(index + 1)}
              >
                <IconArrowDown size={18} />
              </ActionIcon>
            </Group>
            <Menu position="bottom-end">
              <Menu.Target>
                <ActionIcon size={44} aria-label={`More for ${item.exercise.name}`} ml="auto">
                  <IconDots size={20} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item leftSection={<IconPencil size={16} />} onClick={onEdit}>
                  Edit
                </Menu.Item>
                <Menu.Item leftSection={<IconTrash size={16} />} color="red" onClick={onRemove}>
                  Remove from template
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Stack>
        )}
      </Group>
    </Card>
  );
}

function TemplateBody({ template }: { template: TemplateWithExercises }) {
  const navigate = useNavigate();
  const exercises = useExercises();
  const catalog = useMemo(() => exercises.data ?? [], [exercises.data]);
  const byId = useMemo(() => new Map(catalog.map((e) => [e.id, e])), [catalog]);
  const shared = template.user_id === null;
  const archived = !!template.archived_at;
  const editable = !shared && !archived;

  const addItem = useAddTemplateItem();
  const removeItem = useDeleteTemplateItem();
  const reorder = useReorderTemplateItems();
  const update = useUpdateTemplate();
  const remove = useDeleteTemplate();
  const copy = useCopyTemplate();
  const start = useStartWorkout();
  const active = useActiveDraft();

  const [picking, setPicking] = useState(false);
  const [editingItem, setEditingItem] = useState<TemplateExercise | null>(null);
  const [details, setDetails] = useState(false);
  const [confirm, setConfirm] = useState<'archive' | 'delete' | null>(null);

  const groupOptions = useMemo(
    () => [...new Set(template.items.map((i) => i.group_name?.trim()).filter((g): g is string => !!g))],
    [template.items],
  );
  const runs = groupRuns(template.items);

  const onPick = (exercise: Exercise) => {
    setPicking(false);
    addItem.mutate(
      { templateId: template.id, exerciseId: exercise.id, sortOrder: nextSortOrder(template.items) },
      { onSuccess: () => notifySaved(`Added ${exercise.name}`), onError: notifyError },
    );
  };

  const onMove = (from: number, to: number) => {
    const changes = reorderChanges(template.items, from, to);
    if (changes.length) reorder.mutate(changes, { onError: notifyError });
  };

  const onCopy = () =>
    copy.mutate(template.id, {
      onSuccess: (newId) => {
        notifySaved('Copied to your templates');
        void navigate(`/workouts/templates/${newId}`, { replace: true });
      },
      onError: notifyError,
    });

  const setArchived = (value: boolean) =>
    update.mutate(
      { id: template.id, patch: { archived_at: value ? new Date().toISOString() : null } },
      {
        onSuccess: () => {
          notifySaved(value ? 'Template archived' : 'Template restored');
          setConfirm(null);
        },
        onError: notifyError,
      },
    );

  return (
    <Stack>
      <BackLink />
      <PageHeader
        title={template.title}
        subtitle={template.description ?? (shared ? template.plan_name : undefined)}
        action={
          !shared ? (
            <Menu position="bottom-end">
              <Menu.Target>
                <ActionIcon size={44} aria-label="Template actions">
                  <IconDots size={20} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                {!archived && (
                  <Menu.Item leftSection={<IconPencil size={16} />} onClick={() => setDetails(true)}>
                    Edit details
                  </Menu.Item>
                )}
                {archived ? (
                  <Menu.Item leftSection={<IconRestore size={16} />} onClick={() => setArchived(false)}>
                    Restore
                  </Menu.Item>
                ) : (
                  <Menu.Item leftSection={<IconArchive size={16} />} onClick={() => setConfirm('archive')}>
                    Archive
                  </Menu.Item>
                )}
                <Menu.Item
                  leftSection={<IconTrash size={16} />}
                  color="red"
                  onClick={() => setConfirm('delete')}
                >
                  Delete
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          ) : undefined
        }
      />

      {shared && (
        <Card>
          <Stack gap="xs">
            <Group gap={6}>
              <Badge variant="light" color="blue">
                Plan library
              </Badge>
              {template.plan_name && (
                <Text size="sm" c="dimmed">
                  {template.plan_name}
                </Text>
              )}
            </Group>
            <Text size="sm">This is a shared example. Copy it to make it yours and edit anything.</Text>
            <Button size="md" leftSection={<IconCopy size={18} />} loading={copy.isPending} onClick={onCopy}>
              Copy to my templates
            </Button>
          </Stack>
        </Card>
      )}

      {archived && (
        <Alert variant="light" color="gray" title="Archived">
          <Stack gap="xs">
            <Text size="sm">Archived templates are hidden from your list and can't be started.</Text>
            <Button
              size="sm"
              variant="default"
              w="fit-content"
              leftSection={<IconRestore size={16} />}
              loading={update.isPending}
              onClick={() => setArchived(false)}
            >
              Restore
            </Button>
          </Stack>
        </Alert>
      )}

      {editable && (
        <Button
          size="lg"
          leftSection={<IconPlayerPlay size={20} />}
          disabled={template.items.length === 0 || !!active.data}
          loading={start.isPending}
          onClick={() => start.mutate({ template }, { onError: notifyError })}
        >
          Start this workout
        </Button>
      )}

      {template.notes && (
        <SectionCard title="Notes">
          <Spoiler maxHeight={110} showLabel="Show all" hideLabel="Show less">
            <Text size="sm" style={{ whiteSpace: 'pre-line' }}>
              {template.notes}
            </Text>
          </Spoiler>
        </SectionCard>
      )}

      <Group justify="space-between">
        <Text fw={700}>
          {template.items.length} {template.items.length === 1 ? 'exercise' : 'exercises'}
        </Text>
        <Text size="sm" c="dimmed">
          Default rest {template.default_rest_seconds}s
        </Text>
      </Group>

      {template.items.length === 0 ? (
        <Card>
          <Text c="dimmed" ta="center" py="sm">
            {editable ? 'No exercises yet. Add the first one below.' : 'This template has no exercises.'}
          </Text>
        </Card>
      ) : (
        <Stack gap="md">
          {runs.map((run, r) => (
            <Stack key={`${run.group ?? 'none'}-${r}`} gap="xs">
              {run.group && (
                <Text size="xs" fw={700} tt="uppercase" c="dimmed" pl={4}>
                  {run.group}
                </Text>
              )}
              {run.items.map(({ item, index }) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  index={index}
                  count={template.items.length}
                  editable={editable}
                  defaultRest={template.default_rest_seconds}
                  alternatives={(item.alternative_exercise_ids ?? [])
                    .map((id) => byId.get(id))
                    .filter((e): e is Exercise => !!e)}
                  busy={reorder.isPending}
                  onEdit={() => setEditingItem(item)}
                  onMove={(to) => onMove(index, to)}
                  onRemove={() =>
                    removeItem.mutate(item.id, {
                      onSuccess: () => notifySaved(`Removed ${item.exercise.name}`),
                      onError: notifyError,
                    })
                  }
                />
              ))}
            </Stack>
          ))}
        </Stack>
      )}

      {editable && (
        <Button
          size="md"
          variant="light"
          leftSection={<IconPlus size={18} />}
          loading={addItem.isPending}
          onClick={() => setPicking(true)}
        >
          Add exercise
        </Button>
      )}

      <ExercisePickerModal opened={picking} onClose={() => setPicking(false)} onPick={onPick} />
      <TemplateItemModal
        item={editingItem}
        onClose={() => setEditingItem(null)}
        catalog={catalog}
        groupOptions={groupOptions}
        defaultRest={template.default_rest_seconds}
      />
      {!shared && (
        <DetailsModal
          key={template.updated_at}
          template={template}
          opened={details}
          onClose={() => setDetails(false)}
        />
      )}

      <Modal
        opened={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm === 'delete' ? 'Delete template?' : 'Archive template?'}
        centered
      >
        <Stack>
          <Text size="sm">
            {confirm === 'delete'
              ? `“${template.title}” will be deleted and removed from your weekly plan. Workouts you've already logged stay in your history.`
              : `“${template.title}” will be hidden from your templates. Weekly plan days using it will show but can't be started until you restore it.`}
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              color={confirm === 'delete' ? 'red' : undefined}
              loading={remove.isPending || update.isPending}
              onClick={() => {
                if (confirm === 'archive') setArchived(true);
                else
                  remove.mutate(template.id, {
                    onSuccess: () => {
                      notifySaved('Template deleted');
                      void navigate('/workouts/templates', { replace: true });
                    },
                    onError: notifyError,
                  });
              }}
            >
              {confirm === 'delete' ? 'Delete' : 'Archive'}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}

export function TemplateEditorPage() {
  const { templateId = '' } = useParams();
  const template = useTemplate(templateId);

  if (template.isPending) {
    return (
      <Stack>
        <BackLink />
        <Skeleton h={36} w="70%" />
        <Skeleton h={88} radius="lg" />
        <Skeleton h={88} radius="lg" />
        <Skeleton h={88} radius="lg" />
      </Stack>
    );
  }
  if (template.isError || !template.data) {
    return (
      <Stack>
        <BackLink />
        <Alert
          color={template.isError ? 'red' : 'gray'}
          variant="light"
          title={template.isError ? "Couldn't load this template" : 'Template not found'}
        >
          {template.isError ? template.error.message : 'It may have been deleted.'}
        </Alert>
      </Stack>
    );
  }
  return <TemplateBody template={template.data} />;
}
