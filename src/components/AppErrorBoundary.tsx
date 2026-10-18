import { Alert, Button, Center, Stack } from '@mantine/core';
import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Last-resort boundary around the whole app (route errors are handled by
 * RouteError). Workout drafts live in IndexedDB, so reloading is always safe.
 */
export class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[app] unhandled render error', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <Center mih="100dvh" p="md">
        <Stack maw={420}>
          <Alert color="red" variant="light" title="FitTrack hit a problem">
            {this.state.error.message || 'Unknown error'}. Your workouts are saved on this device.
          </Alert>
          <Button onClick={() => window.location.reload()}>Reload</Button>
        </Stack>
      </Center>
    );
  }
}
