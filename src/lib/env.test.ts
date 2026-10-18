import { describe, expect, it } from 'vitest';
import { parseEnv } from './env';

describe('environment validation', () => {
  it('accepts a URL and publishable key', () => {
    const env = parseEnv({
      VITE_SUPABASE_URL: 'https://abc.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_1234567890abcdef',
    });
    expect(env.VITE_VAPID_PUBLIC_KEY).toBe('');
  });

  it('rejects missing values with a helpful message', () => {
    expect(() => parseEnv({})).toThrow(/VITE_SUPABASE_URL/);
  });

  it('refuses secret keys in the browser bundle', () => {
    expect(() =>
      parseEnv({
        VITE_SUPABASE_URL: 'https://abc.supabase.co',
        VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_abcdefghijklmnop',
      }),
    ).toThrow(/secret/);
  });
});
