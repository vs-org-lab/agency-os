import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { magicLinkPath } from './support/admin';
import { signInWithPassword } from './support/auth';
import { readCredentials } from './support/credentials';
import { seedRoomProject } from './support/rooms';

const credentials = readCredentials();

const LOGO_SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>',
);

async function expectAccessible(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations.map((violation) => violation.id)).toEqual([]);
}

test.describe('Brand Hub', () => {
  test('the team builds and publishes the hub and the client downloads and approves it', async ({
    page,
    browser,
  }) => {
    test.setTimeout(300_000);
    const seeded = await seedRoomProject(credentials.organizationId);

    await signInWithPassword(page, credentials.founder);
    await page.goto(`/c/${seeded.clientId}/hub`);
    await page.getByRole('button', { name: 'Criar Brand Hub' }).click();
    await expect(page.getByLabel('Missão')).toBeVisible({ timeout: 30_000 });

    await page.getByLabel('Missão').fill('Dar forma a marcas honestas.');
    await page.getByRole('button', { name: 'Guardar bloco' }).click();
    await expect(page.getByText('Bloco guardado.')).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: 'Ficheiros', exact: true }).click();
    await page.locator('input[type="file"]').setInputFiles({
      name: 'logo.svg',
      mimeType: 'image/svg+xml',
      buffer: LOGO_SVG,
    });
    await expect(page.getByText('1 ficheiro carregado')).toBeVisible({ timeout: 60_000 });

    await page.getByRole('button', { name: 'Logótipo', exact: true }).click();
    await page.getByLabel('Ficheiro', { exact: true }).selectOption({ label: 'logo.svg' });
    await page.getByRole('button', { name: 'Guardar bloco' }).click();
    await expect(page.getByText('Bloco guardado.')).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: 'Design', exact: true }).click();
    await page.getByRole('button', { name: /^Acento #/ }).click();
    await page.getByLabel('Acento (hex)').fill('#E11D48');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Guardar design' }).click();
    await expect(page.getByText('Design guardado.')).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: 'Publicar' }).click();
    await expect(page.getByText('Publicado. O cliente já vê esta versão.')).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole('button', { name: 'Pedir aprovação' }).click();
    await expect(page.getByText('Pedido enviado ao decisor.')).toBeVisible({ timeout: 30_000 });
    await expectAccessible(page);

    const clientContext = await browser.newContext();
    const client = await clientContext.newPage();
    await client.goto(await magicLinkPath(seeded.decisionMakerEmail));
    await client.goto('/portal/hub');
    await expect(client.getByText('Dar forma a marcas honestas.')).toBeVisible();
    await expect(client.getByRole('img', { name: 'logo.svg' })).toBeVisible();
    const download = client.waitForEvent('download');
    await client.getByRole('button', { name: 'Descarregar Logótipo' }).click();
    expect((await download).suggestedFilename()).toContain('Logótipo.zip');
    await expectAccessible(client);
    await client.getByRole('button', { name: 'Aprovar' }).click();
    await expect(client.getByText('Decisão registada. Obrigado.')).toBeVisible({
      timeout: 30_000,
    });
    await clientContext.close();

    await page.reload();
    await expect(page.getByText('Aprovado pelo cliente')).toBeVisible();
  });
});
