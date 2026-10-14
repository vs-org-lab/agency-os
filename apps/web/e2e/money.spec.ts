import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { magicLinkPath } from './support/admin';
import { signInWithPassword } from './support/auth';
import { seedSignedContract } from './support/billing';
import { readCredentials } from './support/credentials';

const credentials = readCredentials();

const RECEIPT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

async function expectAccessible(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations.map((violation) => violation.id)).toEqual([]);
}

const lisbonToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date());

test.describe('Money', () => {
  test('a receipt is read, the expense is linked to a request and the client sees the receipt', async ({
    page,
    browser,
  }) => {
    test.setTimeout(300_000);
    const suffix = randomUUID().slice(0, 8);
    const vendor = `Gráfica E2E ${suffix}`;
    const subscription = `Ferramenta E2E ${suffix}`;
    const receiptName = `recibo-${suffix}.png`;
    const seeded = await seedSignedContract(credentials.organizationId);

    await signInWithPassword(page, credentials.founder);
    await page.goto(`/pipeline/${seeded.dealId}`);
    await page.getByRole('tab', { name: 'Faturação' }).click();
    await page.getByRole('button', { name: 'Criar plano de pagamentos' }).click();
    const requestNumber = (
      await page.getByText(/^PP-\d{4}-\d{4,} · vence a/).textContent({ timeout: 30_000 })
    )?.split(' ')[0];
    expect(requestNumber).toMatch(/^PP-/);

    await page.getByRole('link', { name: 'Dinheiro' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Dinheiro' })).toBeVisible();
    await expectAccessible(page);

    await page.getByRole('button', { name: 'Nova despesa' }).click();
    await page.getByLabel('Recibo (JPEG, PNG, WebP ou PDF, até 10 MB)').setInputFiles({
      name: receiptName,
      mimeType: 'image/png',
      buffer: RECEIPT_PNG,
    });
    await expect(page.getByText('Proposta lida do recibo. Confirme antes de guardar.')).toBeVisible(
      { timeout: 30_000 },
    );
    await expect(page.getByLabel('Fornecedor')).toHaveValue('Gráfica Exemplo');
    await page.getByLabel('Fornecedor').fill(vendor);
    await page.getByLabel('Data').fill(lisbonToday());
    await page.getByLabel('Valor').fill('50,00');
    await page.getByLabel('Cliente (despesa faturável)').selectOption({ label: seeded.company });
    await page.getByRole('button', { name: 'Guardar despesa' }).click();

    const expense = page.getByRole('listitem').filter({ hasText: vendor });
    await expect(expense).toBeVisible({ timeout: 30_000 });
    await expense
      .getByRole('combobox', { name: 'Ligar a um pedido' })
      .selectOption({ label: requestNumber ?? '' });
    await expect(expense.getByText('Ligação guardada.')).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: 'Nova subscrição' }).click();
    await page.getByLabel('Nome').fill(subscription);
    await page.getByLabel('Valor').last().fill('12,00');
    await page.getByLabel('Próxima renovação').fill(lisbonToday());
    await page.getByRole('button', { name: 'Guardar subscrição' }).click();
    const item = page.getByRole('listitem').filter({ hasText: subscription }).first();
    await expect(item.getByText('Em breve')).toBeVisible({ timeout: 30_000 });
    await item.getByRole('button', { name: 'Registar renovação' }).click();
    await expect(
      page.getByRole('listitem').filter({ hasText: subscription }).filter({ hasText: 'Software' }),
    ).toHaveCount(2, { timeout: 30_000 });

    const clientContext = await browser.newContext();
    const client = await clientContext.newPage();
    await client.goto(await magicLinkPath(seeded.signerEmail));
    await client.goto('/portal/invoices');
    const receipts = client.getByRole('list', { name: 'Comprovativos' });
    await expect(receipts.getByRole('link', { name: receiptName })).toBeVisible({
      timeout: 30_000,
    });
    await expectAccessible(client);
    await clientContext.close();
  });
});
