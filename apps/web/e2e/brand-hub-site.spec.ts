import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { magicLinkPath } from './support/admin';
import { signInWithPassword } from './support/auth';
import { readCredentials } from './support/credentials';
import { seedRoomProject } from './support/rooms';

const credentials = readCredentials();
const SITE = 'http://localhost:3001';

const LOGO_SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>',
);

async function expectAccessible(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations.map((violation) => violation.id)).toEqual([]);
}

async function saveSharing(page: Page, mode: RegExp, password?: string): Promise<void> {
  await page.getByRole('button', { name: 'Partilha', exact: true }).click();
  await page.getByRole('radio', { name: mode }).check();
  if (password) await page.getByLabel('Palavra-passe do site').fill(password);
  await page.getByRole('button', { name: 'Guardar partilha' }).click();
  await expect(page.getByText('Partilha guardada.')).toBeVisible({ timeout: 30_000 });
}

test.describe('Brand Hub site', () => {
  test('a published hub opens with its password and, restricted, through the OS', async ({
    page,
    browser,
  }) => {
    test.setTimeout(300_000);
    const seeded = await seedRoomProject(credentials.organizationId);
    const slug = `e2e-${randomUUID().slice(0, 8)}`;
    const mission = `Missão ${randomUUID().slice(0, 6)}`;

    await signInWithPassword(page, credentials.founder);
    await page.goto(`/c/${seeded.clientId}/hub`);
    await page.getByRole('button', { name: 'Criar Brand Hub' }).click();
    await page.getByLabel('Missão').fill(mission);
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
    await page.getByRole('button', { name: 'Publicar' }).click();
    await expect(page.getByText('Publicado. O cliente já vê esta versão.')).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole('button', { name: 'Partilha', exact: true }).click();
    await page.getByLabel('Endereço do hub').fill(slug);
    await saveSharing(page, /Com palavra-passe/, 'marca segura 2026');

    const visitorContext = await browser.newContext();
    const visitor = await visitorContext.newPage();
    await visitor.goto(`${SITE}/${slug}/`);
    await visitor.getByLabel('Palavra-passe').fill('errada');
    await visitor.getByRole('button', { name: 'Abrir' }).click();
    await expect(visitor.getByText('Palavra-passe incorreta.')).toBeVisible();
    await visitor.getByLabel('Palavra-passe').fill('marca segura 2026');
    await visitor.getByRole('button', { name: 'Abrir' }).click();
    await expect(visitor.getByText(mission)).toBeVisible({ timeout: 30_000 });
    await expectAccessible(visitor);
    const download = visitor.waitForEvent('download');
    await visitor.getByRole('button', { name: 'Descarregar Logótipo' }).click();
    expect((await download).suggestedFilename()).toContain('Logótipo.zip');
    await visitorContext.close();

    await saveSharing(page, /Restrito/);
    const clientContext = await browser.newContext();
    const client = await clientContext.newPage();
    await client.goto(await magicLinkPath(seeded.decisionMakerEmail));
    await client.goto(`${SITE}/${slug}/`);
    await client.getByRole('link', { name: 'Entrar com a conta da empresa' }).click();
    await expect(client.getByText(mission)).toBeVisible({ timeout: 30_000 });
    expect(new URL(client.url()).hash).toBe('');
    await clientContext.close();
  });
});
