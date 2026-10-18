import { Container, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { IconBarbell } from '@tabler/icons-react';
import type { ReactNode } from 'react';

export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <Container size={420} py="xl" mih="100dvh" style={{ display: 'flex', alignItems: 'center' }}>
      <Stack w="100%" gap="lg">
        <Group gap="xs" justify="center">
          <IconBarbell size={32} color="var(--mantine-primary-color-filled)" aria-hidden />
          <Text fw={800} fz="xl" lts={0.5}>
            FitTrack
          </Text>
        </Group>
        <Paper withBorder p="lg">
          <Stack gap="md">
            <div>
              <Title order={2} fz="h3">
                {title}
              </Title>
              {subtitle && (
                <Text c="dimmed" size="sm" mt={4}>
                  {subtitle}
                </Text>
              )}
            </div>
            {children}
          </Stack>
        </Paper>
      </Stack>
    </Container>
  );
}
