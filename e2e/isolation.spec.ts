import { expect, test } from '@playwright/test';
import { accessToken, creds, hasTwoAccounts, signIn } from './helpers';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? 'https://scihuwuayemelfzziuqu.supabase.co';
const KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '';

test.describe('row level security', () => {
  test.skip(!hasTwoAccounts || !KEY, 'two test accounts and VITE_SUPABASE_PUBLISHABLE_KEY are required');

  test("a member cannot read or change another member's rows", async ({ browser }) => {
    const a = await (await browser.newContext()).newPage();
    await signIn(a, creds.email, creds.password);
    const tokenA = await accessToken(a);
    const b = await (await browser.newContext()).newPage();
    await signIn(b, creds.email2, creds.password2);
    const tokenB = await accessToken(b);

    const rest = (token: string, path: string, init: RequestInit = {}) =>
      fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        ...init,
        headers: {
          apikey: KEY,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
      });

    const meA = (await (await rest(tokenA, 'profiles?select=id')).json()) as { id: string }[];
    const meB = (await (await rest(tokenB, 'profiles?select=id')).json()) as { id: string }[];
    expect(meA).toHaveLength(1);
    expect(meB).toHaveLength(1);
    expect(meA[0]!.id).not.toBe(meB[0]!.id);

    for (const table of [
      'workout_sessions',
      'meal_occurrences',
      'water_logs',
      'weight_logs',
      'progress_photos',
    ]) {
      const rows = (await (await rest(tokenB, `${table}?select=user_id`)).json()) as { user_id: string }[];
      expect(
        rows.every((r) => r.user_id === meB[0]!.id),
        table,
      ).toBe(true);
    }
    const hijack = await rest(tokenB, `profiles?id=eq.${meA[0]!.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ display_name: 'hijacked' }),
    });
    expect(await hijack.json()).toEqual([]);
  });
});
