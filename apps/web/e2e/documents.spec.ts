import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { magicLinkPath } from './support/admin';
import { signInWithPassword } from './support/auth';
import { readCredentials } from './support/credentials';
import { seedRoomProject } from './support/rooms';

const credentials = readCredentials();

async function expectAccessible(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations.map((violation) => violation.id)).toEqual([]);
}

async function pdf(): Promise<Buffer> {
  const document = await PDFDocument.create();
  document.addPage([420, 595]).drawText('Estratégia de marca', { x: 40, y: 540, size: 24 });
  return Buffer.from(await document.save());
}

test.describe('Room documents', () => {
  test('the team shares a PDF for approval and the client approves it in the portal', async ({
    page,
    browser,
  }) => {
    test.setTimeout(240_000);
    const title = `Estratégia ${randomUUID().slice(0, 6)}`;
    const seeded = await seedRoomProject(credentials.organizationId);

    await signInWithPassword(page, credentials.founder);
    await page.goto(`/c/${seeded.clientId}/docs`);
    await page.getByRole('button', { name: 'Novo documento' }).click();
    await page.getByLabel('Título').fill(title);
    await page.getByLabel('PDF', { exact: true }).check();
    await page.locator('form input[type="file"]').setInputFiles({
      name: 'estrategia.pdf',
      mimeType: 'application/pdf',
      buffer: await pdf(),
    });
    await page.getByRole('button', { name: 'Criar documento' }).click();
    await expect(page.getByRole('heading', { name: title })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Partilhar com o cliente' }).click();
    await expect(page.getByText('Documento partilhado com o cliente.')).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole('button', { name: 'Pedir aprovação' }).click();
    await expect(page.getByText('Pedido de aprovação enviado ao cliente.')).toBeVisible({
      timeout: 30_000,
    });
    await expectAccessible(page);

    const clientContext = await browser.newContext();
    const client = await clientContext.newPage();
    await client.goto(await magicLinkPath(seeded.decisionMakerEmail));
    await client.goto('/portal/docs');
    await client.getByRole('link', { name: new RegExp(title) }).click();
    await expect(client.getByRole('heading', { name: title })).toBeVisible();
    await client.getByLabel('Comentário', { exact: true }).fill('Gostamos muito da direção.');
    await client.getByRole('button', { name: 'Comentar' }).click();
    await expect(client.getByText('Comentário enviado.')).toBeVisible({ timeout: 30_000 });
    await expectAccessible(client);
    await client.getByRole('button', { name: 'Aprovar' }).click();
    await expect(client.getByText('Decisão registada. Obrigado.')).toBeVisible({
      timeout: 30_000,
    });
    await clientContext.close();

    await page.reload();
    await expect(page.getByText('Aprovado', { exact: true })).toBeVisible();
    await expect(page.getByText('Gostamos muito da direção.')).toBeVisible();
  });
});
