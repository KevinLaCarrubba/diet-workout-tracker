import { expect, test } from '@playwright/test';
import { creds, expectNoSeriousA11yViolations, hasAccount, signIn } from './helpers';

test('signed-out visitors are sent to sign in', async ({ page }) => {
  await page.goto('/workouts');
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await expectNoSeriousA11yViolations(page);
});

test('wrong password shows a friendly error', async ({ page }) => {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill('nobody@example.com');
  await page.getByLabel('Password', { exact: true }).fill('not-the-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toContainText('Incorrect email or password');
});

test('the PWA manifest and service worker are installable', async ({ page }) => {
  await page.goto('/sign-in');
  const manifest = await page.evaluate(async () => {
    const href = document.querySelector<HTMLLinkElement>('link[rel=manifest]')?.href;
    return href ? ((await (await fetch(href)).json()) as { display: string; icons: unknown[] }) : null;
  });
  expect(manifest?.display).toBe('standalone');
  expect(manifest?.icons.length).toBeGreaterThanOrEqual(3);
  await expect
    .poll(() => page.evaluate(async () => (await navigator.serviceWorker.ready).active?.state), {
      timeout: 15_000,
    })
    .toBe('activated');
});

test.describe('signed in', () => {
  test.skip(!hasAccount, 'E2E_EMAIL / E2E_PASSWORD not set');

  test('main screens load without accessibility blockers', async ({ page }) => {
    await signIn(page);
    for (const path of ['/', '/workouts', '/meals', '/meals/water', '/progress', '/settings']) {
      await page.goto(path);
      await expect(page.locator('h1').first()).toBeVisible();
      await expectNoSeriousA11yViolations(page);
    }
  });

  test('signing out clears the session', async ({ page }) => {
    await signIn(page);
    await page.goto('/settings');
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
    void creds;
  });
});
