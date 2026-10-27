import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { magicLinkPath } from './support/admin';
import { signInWithPassword } from './support/auth';
import { readCredentials } from './support/credentials';
import { png } from './support/images';
import { seedRoomProject } from './support/rooms';

const credentials = readCredentials();

async function expectAccessible(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations.map((violation) => violation.id)).toEqual([]);
}

test.describe('Voice notes', () => {
  test('the client records a voice note on a proof and the team reads its transcript', async ({
    page,
    browser,
  }) => {
    test.setTimeout(300_000);
    const title = `Cartaz ${randomUUID().slice(0, 6)}`;
    const seeded = await seedRoomProject(credentials.organizationId);

    await signInWithPassword(page, credentials.founder);
    await page.goto(`/c/${seeded.clientId}`);
    await page.getByRole('tab', { name: 'Para aprovação' }).click();
    await page.getByRole('button', { name: 'Novo ficheiro' }).click();
    await page.getByLabel('Título').fill(title);
    await page.getByLabel('Ficheiro', { exact: true }).setInputFiles({
      name: 'cartaz.png',
      mimeType: 'image/png',
      buffer: png(320, 200, [30, 90, 200]),
    });
    await page.getByRole('button', { name: 'Carregar' }).click();
    await expect(page.getByText('Ficheiro carregado.')).toBeVisible({ timeout: 30_000 });
    await page.reload();
    await page.getByRole('tab', { name: 'Para aprovação' }).click();
    await page.getByRole('button', { name: 'Pedir aprovação' }).click();
    await expect(page.getByText('Pedido de aprovação enviado ao cliente.')).toBeVisible({
      timeout: 30_000,
    });

    const clientContext = await browser.newContext({ permissions: ['microphone'] });
    const client = await clientContext.newPage();
    await client.goto(await magicLinkPath(seeded.decisionMakerEmail));
    await client.goto('/portal/approvals');
    await client.getByRole('link', { name: `Abrir ${title}` }).click();
    await client.getByRole('button', { name: 'Gravar nota de voz' }).last().click();
    await expect(
      client.getByRole('status').filter({ hasText: 'A gravar nota de voz' }),
    ).toBeVisible();
    await client.waitForTimeout(2_000);
    await client.getByRole('button', { name: 'Parar' }).click();
    await expect(client.getByRole('slider', { name: 'Posição da nota de voz' })).toBeVisible();
    await expectAccessible(client);
    await client.getByRole('button', { name: 'Enviar nota de voz' }).click();
    await expect(client.getByText('Transcrição automática de teste.')).toBeVisible({
      timeout: 60_000,
    });

    await page.goto(`/c/${seeded.clientId}`);
    await page.getByRole('tab', { name: 'Para aprovação' }).click();
    await page
      .getByRole('listitem')
      .filter({ hasText: title })
      .getByRole('link', { name: 'Abrir' })
      .click();
    await expect(page.getByText('Transcrição automática de teste.')).toBeVisible({
      timeout: 30_000,
    });
    await clientContext.close();
  });
});
