import { Card, Group, Stack, Text } from '@mantine/core';
import type { ReactNode } from 'react';

export function SectionCard({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card component="section" aria-label={title}>
      <Stack gap="sm">
        <Group justify="space-between" wrap="nowrap" align="flex-start">
          <div>
            <Text fw={700}>{title}</Text>
            {description && (
              <Text size="sm" c="dimmed">
                {description}
              </Text>
            )}
          </div>
          {action}
        </Group>
        {children}
      </Stack>
    </Card>
  );
}
