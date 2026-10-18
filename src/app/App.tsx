import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import { AppErrorBoundary } from '@/components/AppErrorBoundary';
import { PwaUpdatePrompt } from '@/components/PwaUpdatePrompt';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { SyncProvider } from '@/offline/SyncProvider';
import { queryClient } from './queryClient';
import { router } from './router';
import { theme } from './theme';

export function App() {
  return (
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <Notifications position="top-center" zIndex={1000} />
      <AppErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <SyncProvider />
            <RouterProvider router={router} />
            <PwaUpdatePrompt />
          </AuthProvider>
        </QueryClientProvider>
      </AppErrorBoundary>
    </MantineProvider>
  );
}
