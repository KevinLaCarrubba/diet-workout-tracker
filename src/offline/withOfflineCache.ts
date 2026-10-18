import { readCache, writeCache } from './db';
import { isNetworkError } from './syncEngine';

/**
 * Fetches from the network and keeps a copy on the device; when offline (or
 * the request fails for network reasons), serves the last copy instead.
 */
export async function withOfflineCache<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  try {
    const value = await fetcher();
    await writeCache(key, value);
    return value;
  } catch (error) {
    if (!navigator.onLine || isNetworkError(error)) {
      const cached = await readCache<T>(key);
      if (cached !== undefined) return cached;
    }
    throw error;
  }
}
