import { expect, test } from '@playwright/test';
import { signInWithPassword } from './support/auth';
import { readCredentials } from './support/credentials';

const credentials = readCredentials();

test.describe('Command palette', () => {
  test('Ctrl+K finds the seeded client and Enter opens its room', async ({ page }) => {
    test.setTimeout(120_000);
    await signInWithPassword(page, credentials.founder);

    await page.keyboard.press('Control+K');
    const palette = page.getByRole('dialog', { name: 'Paleta de comandos' });
    await expect(palette).toBeVisible();

    await palette.getByRole('combobox').fill('E2E Client');
    await expect(palette.getByRole('option', { name: /E2E Client/ })).toBeVisible();
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(/\/c\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { name: 'E2E Client', level: 1 })).toBeVisible();
  });
});
