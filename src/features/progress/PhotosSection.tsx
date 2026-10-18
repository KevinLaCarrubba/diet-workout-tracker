import {
  ActionIcon,
  Alert,
  AspectRatio,
  Badge,
  Box,
  Button,
  Card,
  FileButton,
  Group,
  Image,
  Loader,
  Modal,
  SegmentedControl,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  TextInput,
  Textarea,
  UnstyledButton,
} from '@mantine/core';
import { useNetwork } from '@mantine/hooks';
import {
  IconCamera,
  IconCheck,
  IconColumns2,
  IconLock,
  IconPhoto,
  IconTrash,
  IconX,
} from '@tabler/icons-react';
import { useMemo, useRef, useState } from 'react';
import { usePreferences } from '@/features/profile/api';
import { notifyError, notifySaved } from '@/lib/notify';
import { dayjs } from '@/lib/time';
import {
  useDeletePhoto,
  usePhotos,
  useSignedPhotoUrls,
  useUploadPhoto,
  type PhotoPose,
  type ProgressPhoto,
} from './api';
import { fromLocalInput, toLocalInput } from './format';
import { ConfirmDeleteModal } from './ui';

const POSES: { label: string; value: PhotoPose }[] = [
  { label: 'Front', value: 'front' },
  { label: 'Side', value: 'side' },
  { label: 'Back', value: 'back' },
  { label: 'Other', value: 'other' },
];
const poseLabel = (p: string | null) => POSES.find((x) => x.value === p)?.label ?? null;

export function PhotosSection() {
  const { timezone } = usePreferences();
  const { online } = useNetwork();
  const photos = usePhotos();
  const remove = useDeletePhoto();
  const [filter, setFilter] = useState<'all' | PhotoPose>('all');
  const [picking, setPicking] = useState<{ file: File; preview: string; key: number } | null>(null);
  const pickFile = (file: File | null) => {
    if (file) setPicking({ file, preview: URL.createObjectURL(file), key: Date.now() });
  };
  const resetCamera = useRef<() => void>(null);
  const resetLibrary = useRef<() => void>(null);
  const [viewing, setViewing] = useState<ProgressPhoto | null>(null);
  const [deleting, setDeleting] = useState<ProgressPhoto | null>(null);
  const [comparing, setComparing] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);

  const visible = useMemo(
    () => (photos.data ?? []).filter((p) => filter === 'all' || p.pose === filter),
    [photos.data, filter],
  );
  const paths = useMemo(() => (photos.data ?? []).map((p) => p.private_storage_path).sort(), [photos.data]);
  const urls = useSignedPhotoUrls(paths);
  const urlOf = (p: ProgressPhoto) => urls.data?.[p.private_storage_path];
  const pickedPhotos = (photos.data ?? [])
    .filter((p) => picked.includes(p.id))
    .sort((a, b) => a.captured_at.localeCompare(b.captured_at));

  const togglePick = (id: string) =>
    setPicked((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= 2 ? [cur[1]!, id] : [...cur, id],
    );

  return (
    <Stack>
      <Alert color="gray" variant="light" icon={<IconLock size={18} />}>
        <Text size="sm" fw={600}>
          Private — only you can see these.
        </Text>
        <Text size="xs" c="dimmed">
          Photos are stored in a private folder and shown through links that expire after a few minutes.
          Location data is stripped when a photo is resized for upload.
        </Text>
      </Alert>

      <SimpleGrid cols={2}>
        <FileButton
          onChange={pickFile}
          accept="image/*"
          capture="user"
          disabled={!online}
          resetRef={resetCamera}
        >
          {(props) => (
            <Button {...props} size="lg" leftSection={<IconCamera size={20} />} disabled={!online}>
              Take photo
            </Button>
          )}
        </FileButton>
        <FileButton onChange={pickFile} accept="image/*" disabled={!online} resetRef={resetLibrary}>
          {(props) => (
            <Button
              {...props}
              size="lg"
              variant="light"
              leftSection={<IconPhoto size={20} />}
              disabled={!online}
            >
              Choose
            </Button>
          )}
        </FileButton>
      </SimpleGrid>
      {!online && (
        <Text size="sm" c="dimmed">
          You're offline. Photos can be added once you're back online.
        </Text>
      )}

      <UploadModal
        picking={picking}
        onClose={() => {
          if (picking) URL.revokeObjectURL(picking.preview);
          setPicking(null);
          resetCamera.current?.();
          resetLibrary.current?.();
        }}
      />

      {photos.isPending ? (
        <SimpleGrid cols={3}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} h={140} radius="md" />
          ))}
        </SimpleGrid>
      ) : photos.isError ? (
        <Alert color="red">Couldn't load your photos.</Alert>
      ) : photos.data.length === 0 ? (
        <Card>
          <Stack align="center" ta="center" py="md">
            <IconPhoto size={36} stroke={1.5} />
            <Text fw={700}>No progress photos</Text>
            <Text size="sm" c="dimmed">
              Photos are optional. Same spot, same light and same pose make comparisons easier.
            </Text>
          </Stack>
        </Card>
      ) : (
        <>
          <SegmentedControl
            fullWidth
            value={filter}
            onChange={(v) => setFilter(v as typeof filter)}
            data={[{ label: 'All', value: 'all' }, ...POSES]}
            aria-label="Filter by pose"
          />
          <Group justify="space-between">
            <Text size="sm" c="dimmed">
              {comparing
                ? `Pick two photos (${picked.length}/2)`
                : `${visible.length} photo${visible.length === 1 ? '' : 's'}`}
            </Text>
            {comparing ? (
              <Group gap="xs">
                <Button
                  variant="default"
                  onClick={() => {
                    setComparing(false);
                    setPicked([]);
                  }}
                >
                  Cancel
                </Button>
                <Button disabled={picked.length !== 2} onClick={() => setCompareOpen(true)}>
                  Compare
                </Button>
              </Group>
            ) : (
              <Button
                variant="light"
                leftSection={<IconColumns2 size={18} />}
                disabled={(photos.data?.length ?? 0) < 2}
                onClick={() => setComparing(true)}
              >
                Compare
              </Button>
            )}
          </Group>
          <SimpleGrid cols={{ base: 3, sm: 4 }} spacing="xs">
            {visible.map((p) => {
              const selected = picked.includes(p.id);
              return (
                <UnstyledButton
                  key={p.id}
                  onClick={() => (comparing ? togglePick(p.id) : setViewing(p))}
                  aria-label={`${poseLabel(p.pose) ?? 'Photo'} from ${dayjs(p.captured_at).tz(timezone).format('MMM D, YYYY')}${comparing ? (selected ? ', selected' : '') : ''}`}
                  aria-pressed={comparing ? selected : undefined}
                  style={{
                    position: 'relative',
                    borderRadius: 'var(--mantine-radius-md)',
                    overflow: 'hidden',
                    outline: selected ? '3px solid var(--mantine-primary-color-filled)' : undefined,
                    outlineOffset: -3,
                  }}
                >
                  <AspectRatio ratio={3 / 4}>
                    <PhotoImage url={urlOf(p)} loading={urls.isPending} />
                  </AspectRatio>
                  <Box
                    pos="absolute"
                    bottom={0}
                    left={0}
                    right={0}
                    px={6}
                    py={4}
                    style={{ background: 'linear-gradient(transparent, rgba(0,0,0,0.7))' }}
                  >
                    <Text size="xs" c="white" fw={600}>
                      {dayjs(p.captured_at).tz(timezone).format('MMM D')}
                    </Text>
                  </Box>
                  {comparing && selected && (
                    <Badge pos="absolute" top={6} right={6} circle size="lg">
                      <IconCheck size={14} />
                    </Badge>
                  )}
                </UnstyledButton>
              );
            })}
          </SimpleGrid>
        </>
      )}

      <Modal
        opened={viewing !== null}
        onClose={() => setViewing(null)}
        title={viewing ? dayjs(viewing.captured_at).tz(timezone).format('ddd, MMM D, YYYY · h:mm A') : ''}
        size="lg"
        centered
      >
        {viewing && (
          <Stack>
            <PhotoImage url={urlOf(viewing)} loading={urls.isPending} fit="contain" mah="70dvh" />
            <Group justify="space-between" wrap="nowrap" align="flex-start">
              <div>
                {poseLabel(viewing.pose) && <Badge variant="light">{poseLabel(viewing.pose)}</Badge>}
                {viewing.notes && (
                  <Text size="sm" mt={4}>
                    {viewing.notes}
                  </Text>
                )}
              </div>
              <ActionIcon
                size="xl"
                color="gray"
                aria-label="Delete photo"
                onClick={() => setDeleting(viewing)}
              >
                <IconTrash size={20} />
              </ActionIcon>
            </Group>
          </Stack>
        )}
      </Modal>

      <Modal opened={compareOpen} onClose={() => setCompareOpen(false)} title="Compare" size="xl" centered>
        {pickedPhotos.length === 2 && (
          <Stack>
            <SimpleGrid cols={2} spacing="xs">
              {pickedPhotos.map((p) => (
                <Stack key={p.id} gap={4}>
                  <PhotoImage url={urlOf(p)} loading={urls.isPending} fit="contain" mah="60dvh" />
                  <Text size="sm" fw={600} ta="center">
                    {dayjs(p.captured_at).tz(timezone).format('MMM D, YYYY')}
                  </Text>
                  {poseLabel(p.pose) && (
                    <Text size="xs" c="dimmed" ta="center">
                      {poseLabel(p.pose)}
                    </Text>
                  )}
                </Stack>
              ))}
            </SimpleGrid>
            <Text size="sm" c="dimmed" ta="center">
              {(() => {
                const days = dayjs(pickedPhotos[1]!.captured_at).diff(pickedPhotos[0]!.captured_at, 'day');
                return `${days} day${days === 1 ? '' : 's'} apart`;
              })()}
            </Text>
          </Stack>
        )}
      </Modal>

      <ConfirmDeleteModal
        opened={deleting !== null}
        title="Delete photo?"
        loading={remove.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() =>
          deleting &&
          remove.mutate(deleting, {
            onSuccess: () => {
              notifySaved('Photo deleted');
              setPicked((cur) => cur.filter((id) => id !== deleting.id));
              setDeleting(null);
              setViewing(null);
            },
            onError: notifyError,
          })
        }
      >
        The photo is permanently removed from your private storage. This can't be undone.
      </ConfirmDeleteModal>
    </Stack>
  );
}

function PhotoImage({
  url,
  loading,
  fit = 'cover',
  mah,
}: {
  url: string | undefined;
  loading: boolean;
  fit?: 'cover' | 'contain';
  mah?: string;
}) {
  if (!url) {
    return (
      <Box
        bg="var(--mantine-color-default)"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 120 }}
      >
        {loading ? <Loader size="sm" /> : <IconX size={20} aria-label="Photo unavailable" />}
      </Box>
    );
  }
  return <Image src={url} alt="" fit={fit} mah={mah} radius="md" referrerPolicy="no-referrer" />;
}

function UploadModal({
  picking,
  onClose,
}: {
  picking: { file: File; preview: string; key: number } | null;
  onClose: () => void;
}) {
  const upload = useUploadPhoto();
  return (
    <Modal
      opened={picking !== null}
      onClose={() => !upload.isPending && onClose()}
      title="New progress photo"
      centered
    >
      {picking && (
        <UploadForm
          key={picking.key}
          file={picking.file}
          preview={picking.preview}
          upload={upload}
          onDone={onClose}
        />
      )}
    </Modal>
  );
}

function UploadForm({
  file,
  preview,
  upload,
  onDone,
}: {
  file: File;
  preview: string;
  upload: ReturnType<typeof useUploadPhoto>;
  onDone: () => void;
}) {
  const { timezone } = usePreferences();
  const [pose, setPose] = useState<PhotoPose>('front');
  const [at, setAt] = useState(() => toLocalInput(new Date().toISOString(), timezone));
  const [notes, setNotes] = useState('');

  const save = () => {
    if (!at) return;
    upload.mutate(
      { file, pose, captured_at: fromLocalInput(at, timezone), notes: notes.trim() || null },
      {
        onSuccess: () => {
          notifySaved('Photo saved privately');
          onDone();
        },
        onError: notifyError,
      },
    );
  };

  return (
    <Stack>
      {preview && <Image src={preview} alt="Selected photo preview" mah={280} fit="contain" radius="md" />}
      <SegmentedControl
        fullWidth
        value={pose}
        onChange={(v) => setPose(v as PhotoPose)}
        data={POSES}
        aria-label="Pose"
      />
      <TextInput
        type="datetime-local"
        label="Taken"
        size="md"
        value={at}
        onChange={(e) => setAt(e.currentTarget.value)}
      />
      <Textarea
        label="Note (optional)"
        autosize
        minRows={2}
        maxLength={500}
        value={notes}
        onChange={(e) => setNotes(e.currentTarget.value)}
      />
      <Button
        size="lg"
        loading={upload.isPending}
        disabled={!at}
        onClick={save}
        leftSection={<IconLock size={18} />}
      >
        Save privately
      </Button>
    </Stack>
  );
}
