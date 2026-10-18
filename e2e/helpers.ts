import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

export const creds = {
  email: process.env.E2E_EMAIL ?? '',
  password: process.env.E2E_PASSWORD ?? '',
  email2: process.env.E2E_EMAIL_2 ?? '',
  password2: process.env.E2E_PASSWORD_2 ?? '',
};
export const hasAccount = !!(creds.email && creds.password);
export const hasTwoAccounts = hasAccount && !!(creds.email2 && creds.password2);

export async function signIn(page: Page, email = creds.email, password = creds.password) {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => url.pathname === '/' || url.pathname === '/onboarding');
}

/** Serious/critical axe violations only (WCAG 2.1 A/AA). */
export async function expectNoSeriousA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .exclude('canvas')
    .analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(
    serious.map((v) => `${v.id}: ${v.help} (${v.nodes.length}) → ${v.nodes[0]?.target.join(' ')}`),
  ).toEqual([]);
}

export async function accessToken(page: Page): Promise<string> {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.endsWith('-auth-token'));
    return key ? (JSON.parse(localStorage.getItem(key)!) as { access_token: string }).access_token : '';
  });
}
