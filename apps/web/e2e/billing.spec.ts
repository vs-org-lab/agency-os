import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { magicLinkPath } from './support/admin';
import { signInWithPassword } from './support/auth';
import { LEGAL_INVOICE_PDF, seedSignedContract } from './support/billing';
import { readCredentials } from './support/credentials';
import { dismissPortalWelcome } from './support/ui';

const credentials = readCredentials();

async function expectAccessible(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations.map((violation) => violation.id)).toEqual([]);
}

test.describe('Billing', () => {
  test('from the signed contract to the paid request, the legal invoice and 2.2', async ({
    page,
    browser,
  }) => {
    test.setTimeout(240_000);
    const seeded = await seedSignedContract(credentials.organizationId);

    await signInWithPassword(page, credentials.founder);
    await page.goto(`/pipeline/${seeded.dealId}`);
    await page.getByRole('tab', { name: 'Faturação' }).click();
    const billing = page.locator('section', {
      has: page.getByRole('heading', { name: 'Faturação' }),
    });
    await billing.getByRole('button', { name: 'Criar plano de pagamentos' }).click();
    await expect(billing.getByText('Plano criado e primeiro pedido enviado.')).toBeVisible({
      timeout: 30_000,
    });
    await expect(billing.getByText(/^PP-\d{4}-\d{4,} · vence a/)).toBeVisible();
    await expect(billing.getByText('Por pedir')).toBeVisible();
    await expectAccessible(page);

    const clientContext = await browser.newContext();
    const client = await clientContext.newPage();
    await client.goto(await magicLinkPath(seeded.signerEmail));
    await client.goto('/portal');
    await dismissPortalWelcome(client);
    await expect(client.getByRole('heading', { name: 'A sua ação' })).toBeVisible();
    await client.getByRole('link', { name: 'Pagar' }).click();
    await expect(client.getByRole('heading', { name: 'Faturas e pagamentos' })).toBeVisible();
    await expect(client.getByText('Por pagar')).toBeVisible();
    await expect(client.getByText('IBAN', { exact: true })).toBeVisible();
    await expectAccessible(client);
    const requestPdf = await client.request.get(
      (await client
        .getByRole('link', { name: /^Descarregar o pedido PP-/ })
        .getAttribute('href')) ?? '',
    );
    expect(requestPdf.status()).toBe(200);
    expect(requestPdf.headers()['content-type']).toContain('application/pdf');

    await billing.getByRole('button', { name: 'Registar pagamento' }).click();
    await billing.getByLabel('Referência').fill('TRF E2E');
    await billing.getByRole('button', { name: 'Guardar pagamento' }).click();
    await expect(billing.getByText('Pagamento registado.')).toBeVisible({ timeout: 30_000 });
    await page.reload();
    await expect(page.getByText('2.2', { exact: true }).first()).toBeVisible();

    await page.getByRole('tab', { name: 'Faturação' }).click();
    await expect(billing.getByText('Falta registar a fatura legal.')).toBeVisible();
    await billing.getByRole('button', { name: 'Registar fatura legal' }).click();
    await billing.getByLabel('Número da fatura').fill('FR E2E/1');
    await billing.getByLabel('PDF da fatura (até 10 MB)').setInputFiles({
      name: 'fatura.pdf',
      mimeType: 'application/pdf',
      buffer: LEGAL_INVOICE_PDF,
    });
    await billing.getByRole('button', { name: 'Guardar fatura' }).click();
    await expect(billing.getByText('Fatura legal registada.')).toBeVisible({ timeout: 30_000 });

    await client.goto('/portal/invoices');
    await expect(client.getByText('Pago', { exact: true })).toBeVisible();
    const invoicePdf = await client.request.get(
      (await client
        .getByRole('link', { name: 'Descarregar a fatura FR E2E/1 (PDF)' })
        .getAttribute('href')) ?? '',
    );
    expect(invoicePdf.status()).toBe(200);
    await clientContext.close();
  });
});
