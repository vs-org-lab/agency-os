import { expect, test } from '@playwright/test';
import { signInWithPassword } from './support/auth';
import { seedDeal, uniqueCompany } from './support/commercial';
import { readCredentials } from './support/credentials';

const credentials = readCredentials();

test.describe('pipeline', () => {
  test.beforeEach(async ({ page }) => {
    await signInWithPassword(page, credentials.founder);
  });

  test('refused move returns the card with the rule', async ({ page }) => {
    const { company } = uniqueCompany('Pipeline Recusa');
    await seedDeal(credentials.organizationId, { company, code: '0.2' });

    await page.goto('/pipeline');
    await page.getByRole('button', { name: `Mover ${company} para…` }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Mover para').selectOption('0.3');
    await dialog.getByRole('button', { name: 'Mover' }).click();

    await expect(
      page.getByText('Marque a chamada no separador Chamadas antes de passar a 0.3.'),
    ).toBeVisible();
    await expect(page.getByRole('region', { name: /^0\.2 / }).getByText(company)).toBeVisible();
  });

  test('move to X.4 asks for a reason', async ({ page }) => {
    const { company } = uniqueCompany('Pipeline Perdido');
    await seedDeal(credentials.organizationId, { company, code: '0.2' });

    await page.goto('/pipeline');
    await page.getByRole('button', { name: `Mover ${company} para…` }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Mover para').selectOption('X.4');
    await dialog.getByRole('button', { name: 'Mover' }).click();
    await expect(dialog.getByText('Indique o motivo desta mudança.')).toBeVisible();

    await dialog.getByLabel('Motivo').fill('Escolheu outra agência');
    await dialog.getByRole('button', { name: 'Mover' }).click();
    await expect(page.getByRole('region', { name: /^X\.4 / }).getByText(company)).toBeVisible();
  });

  test('deal detail records a call outcome', async ({ page }) => {
    const { company } = uniqueCompany('Pipeline Chamada');
    const { dealId } = await seedDeal(credentials.organizationId, {
      company,
      code: '0.3',
      withCall: true,
    });

    await page.goto(`/pipeline/${dealId}`);
    await page.getByRole('tab', { name: 'Chamadas' }).click();
    await page.getByLabel('Resultado').selectOption('advance');
    await page.getByRole('button', { name: 'Guardar resultado' }).click();

    await expect(page.getByText('1.1', { exact: true })).toBeVisible();
  });

  test('prospect clients have no room', async ({ page }) => {
    const { company } = uniqueCompany('Prospeto Sem Sala');
    const { clientId } = await seedDeal(credentials.organizationId, { company, code: '0.2' });

    const response = await page.goto(`/c/${clientId}`);
    expect(response?.status()).toBe(404);
  });
});
