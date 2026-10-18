import { Badge, Tooltip } from '@mantine/core';
import { useNetwork } from '@mantine/hooks';
import { IconCloudCheck, IconCloudOff, IconCloudUpload, IconAlertTriangle } from '@tabler/icons-react';
import { useSyncStore } from '@/stores/syncStore';

/** Offline / syncing / synced / error state, always visible in the header. */
/** `compact` shows icon + count only (for tight headers). */
export function StatusIndicator({ compact = false }: { compact?: boolean }) {
  const { online } = useNetwork();
  const { phase, pending, lastError } = useSyncStore();
  const label = (text: string) => (compact ? (pending > 0 ? String(pending) : null) : text);

  if (!online) {
    return (
      <Tooltip
        label={pending > 0 ? `${pending} change(s) saved on this device` : 'Changes are saved on this device'}
      >
        <Badge color="gray" variant="light" leftSection={<IconCloudOff size={14} />} role="status">
          {label(`Offline${pending > 0 ? ` · ${pending}` : ''}`)}
        </Badge>
      </Tooltip>
    );
  }
  if (phase === 'error') {
    return (
      <Tooltip label={lastError ?? 'Sync failed; will retry'}>
        <Badge color="red" variant="light" leftSection={<IconAlertTriangle size={14} />} role="status">
          {label('Sync error')}
        </Badge>
      </Tooltip>
    );
  }
  if (phase === 'syncing' || pending > 0) {
    return (
      <Badge color="blue" variant="light" leftSection={<IconCloudUpload size={14} />} role="status">
        {label(`Syncing${pending > 0 ? ` · ${pending}` : ''}`)}
      </Badge>
    );
  }
  return (
    <Badge
      color="lime"
      variant="light"
      leftSection={<IconCloudCheck size={14} />}
      role="status"
      aria-label={compact ? 'Synced' : undefined}
    >
      {label('Synced')}
    </Badge>
  );
}
