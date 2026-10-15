import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { signInWithPassword } from './support/auth';
import { readCredentials } from './support/credentials';
import { seedPaidClient } from './support/health';

const credentials = readCredentials();

test.describe('Client health', () => {
  test('the founder sees the health of a client on the room dashboard', async ({ page }) => {
    test.setTimeout(180_000);
    const seeded = await seedPaidClient(credentials.organizationId);

    await signInWithPassword(page, credentials.founder);
    await page.goto(`/c/${seeded.clientId}`);
    const card = page.getByRole('region', { name: 'Saúde' });
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card).toContainText('Pagamentos em dia');
    await expect(card).toContainText('1 de 1 pedidos pagos a tempo');
    await expect(card).toContainText(/\d+ de 100/);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(results.violations.map((violation) => violation.id)).toEqual([]);
  });
});
