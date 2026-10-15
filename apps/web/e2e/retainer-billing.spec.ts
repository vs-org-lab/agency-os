import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { magicLinkPath } from './support/admin';
import { signInWithPassword } from './support/auth';
import { readCredentials } from './support/credentials';
import { RETAINER_EXTRA, seedRetainerClient } from './support/retainers';

const credentials = readCredentials();

async function expectAccessible(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations.map((violation) => violation.id)).toEqual([]);
}

test.describe('Retainer billing', () => {
  test('an approved extra request is billed to the client and listed for the team', async ({
    page,
    browser,
  }) => {
    test.setTimeout(300_000);
    const seeded = await seedRetainerClient(credentials.organizationId);

    await signInWithPassword(page, credentials.founder);
    await page.goto(`/c/${seeded.clientId}/retainer`);
    const extra = page.getByRole('listitem').filter({ hasText: RETAINER_EXTRA });
    await extra.getByLabel('Valor do orçamento').fill('150');
    await extra.getByRole('button', { name: 'Enviar orçamento' }).click();
    await expect(page.getByText('Orçamento enviado ao cliente.')).toBeVisible({
      timeout: 30_000,
    });

    const clientContext = await browser.newContext();
    const client = await clientContext.newPage();
    await client.goto(await magicLinkPath(seeded.decisionMakerEmail));
    await client.goto('/portal/progress');
    await client
      .getByRole('listitem')
      .filter({ hasText: RETAINER_EXTRA })
      .getByRole('button', { name: 'Aprovar orçamento' })
      .click();
    await expect(client.getByText('Orçamento aprovado. A equipa vai começar.')).toBeVisible({
      timeout: 30_000,
    });

    await client.goto('/portal/invoices');
    const invoice = client.getByRole('article', {
      name: new RegExp(`Pedido extra: ${RETAINER_EXTRA}`),
    });
    await expect(invoice).toBeVisible({ timeout: 30_000 });
    await expect(invoice).toContainText(/150,00\s€/);
    await expectAccessible(client);
    await clientContext.close();

    await page.reload();
    const billing = page.getByRole('region', { name: 'Faturação' });
    const request = billing
      .getByRole('listitem')
      .filter({ hasText: `Pedido extra: ${RETAINER_EXTRA}` });
    await expect(request).toBeVisible();
    await expect(request.getByRole('button', { name: 'Registar pagamento' })).toBeVisible();
    await expectAccessible(page);
  });
});
