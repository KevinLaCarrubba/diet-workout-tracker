import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestPersistentStorage } from './persistentStorage';

afterEach(() => vi.unstubAllGlobals());

describe('requestPersistentStorage', () => {
  it('asks once when not yet persisted', async () => {
    const persist = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('navigator', { storage: { persisted: vi.fn().mockResolvedValue(false), persist } });
    await expect(requestPersistentStorage()).resolves.toBe(true);
    expect(persist).toHaveBeenCalledOnce();
  });

  it('is a no-op where unsupported', async () => {
    vi.stubGlobal('navigator', {});
    await expect(requestPersistentStorage()).resolves.toBe(false);
  });
});
