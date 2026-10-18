import { expect, test } from '@playwright/test';
import { accessToken, hasAccount, signIn } from './helpers';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? 'https://scihuwuayemelfzziuqu.supabase.co';
const KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '';

test.describe('offline workout', () => {
  test.skip(!hasAccount || !KEY, 'E2E credentials and VITE_SUPABASE_PUBLISHABLE_KEY are required');

  test('a workout logged with no network survives a reload and syncs exactly once', async ({
    page,
    context,
  }) => {
    await signIn(page);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await page.goto('/workouts');
    await page.getByRole('button', { name: 'Start empty workout' }).click();
    await page.waitForURL(/\/workouts\/session\/[0-9a-f-]+$/);
    const sessionId = page.url().split('/').pop()!;

    // Add an exercise while online so the catalog is cached, then go offline.
    await page.getByRole('button', { name: 'Add exercise' }).first().click();
    await page.getByPlaceholder('Search name, muscle or equipment').fill('Goblet');
    await page.getByRole('button', { name: /Goblet Squat/ }).click();
    await context.setOffline(true);

    for (let i = 1; i <= 3; i++) {
      await page.getByLabel(`Set ${i} weight`).fill('30');
      await page.getByLabel(`Set ${i} reps`).fill('10');
      await page.getByRole('button', { name: `Complete set ${i}` }).click();
    }
    // Let the last on-device write commit (a real phone lock is never this instant).
    await expect(page.getByRole('button', { name: /^Set \d+ done/ })).toHaveCount(3);
    await page.waitForTimeout(500);
    await page.reload();
    await expect(page.getByRole('button', { name: /^Set \d+ done/ })).toHaveCount(3);

    await page.getByRole('button', { name: 'Finish', exact: true }).click();
    await page.getByRole('button', { name: 'Finish & save' }).click();
    await page.waitForURL(/summary$/);
    await expect(page.getByRole('status').first()).toContainText('Offline');

    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(page.getByText('Synced').first()).toBeVisible({ timeout: 30_000 });
    await page.reload();
    await page.waitForTimeout(3000);

    const token = await accessToken(page);
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/workout_sessions?select=id,status,total_sets&id=eq.${sessionId}`,
      {
        headers: { apikey: KEY, Authorization: `Bearer ${token}` },
      },
    );
    expect(await res.json()).toEqual([{ id: sessionId, status: 'completed', total_sets: 3 }]);
  });
});
