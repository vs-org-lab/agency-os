import { expect, test, type Page } from '@playwright/test';
import { signInWithPassword } from './support/auth';
import { readCredentials } from './support/credentials';

const credentials = readCredentials();

async function openAccount(page: Page, name: string): Promise<void> {
  const menu = page.getByRole('dialog', { name });
  if (await menu.isVisible()) return;
  await page.getByRole('button', { name: credentials.founder.email }).click();
  await expect(menu).toBeVisible();
}

test('theme and locale preferences apply across the shell', async ({ page }) => {
  await signInWithPassword(page, credentials.founder);

  await openAccount(page, 'Conta');
  await page.getByRole('radio', { name: 'Escuro' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);

  await page.getByRole('radio', { name: 'English' }).click();
  await expect(page).toHaveURL(/\/en$/);
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('html')).toHaveClass(/dark/);

  await openAccount(page, 'Account');
  await page.getByRole('radio', { name: 'Light' }).click();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
});

test('unknown pages show the localized not found page', async ({ page }) => {
  await page.goto('/this-page-does-not-exist');

  await expect(page.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible();
});
