import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    // offlineFirst: always run the query function (which falls back to the device
    // cache) instead of pausing in a pending state while there's no network.
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true, networkMode: 'offlineFirst' },
    mutations: { retry: 0 },
  },
});
