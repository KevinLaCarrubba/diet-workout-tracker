import { Alert, Button, Center, Stack } from '@mantine/core';
import { isRouteErrorResponse, useRouteError } from 'react-router';

/** Route-level error boundary: a broken screen never takes down the whole app. */
export function RouteError() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : 'Unknown error';
  return (
    <Center mih="60dvh" p="md">
      <Stack maw={420}>
        <Alert color="red" variant="light" title="Something went wrong">
          {message}
        </Alert>
        <Button onClick={() => window.location.reload()}>Reload</Button>
        <Button variant="subtle" component="a" href="/">
          Go home
        </Button>
      </Stack>
    </Center>
  );
}
