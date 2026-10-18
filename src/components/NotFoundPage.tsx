import { Button, Center, Stack, Text, Title } from '@mantine/core';
import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <Center mih="60dvh">
      <Stack align="center">
        <Title order={2}>Page not found</Title>
        <Text c="dimmed">That page doesn't exist.</Text>
        <Button component={Link} to="/">
          Go home
        </Button>
      </Stack>
    </Center>
  );
}

export function ComingSoon({ title }: { title: string }) {
  return (
    <Center mih="40dvh">
      <Stack align="center" gap={4}>
        <Title order={2}>{title}</Title>
        <Text c="dimmed">Coming in the next build phase.</Text>
      </Stack>
    </Center>
  );
}
