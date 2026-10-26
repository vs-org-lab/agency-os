import { expect, test } from '@playwright/test';
import { magicLinkPath } from './support/admin';
import { signInWithPassword } from './support/auth';
import { readCredentials } from './support/credentials';
import { seedRetainerClient } from './support/retainers';

const credentials = readCredentials();

test.describe('Portal dashboard', () => {
  test('the client sees the welcome once, asks for work and follows it until the team takes it', async ({
    page,
    browser,
  }) => {
    test.setTimeout(300_000);
    const seeded = await seedRetainerClient(credentials.organizationId);
    const description = `Cartaz do evento ${Date.now()}`;

    const clientContext = await browser.newContext();
    const client = await clientContext.newPage();
    await client.goto(await magicLinkPath(seeded.decisionMakerEmail));
    await client.goto('/portal');

    const welcome = client.getByRole('dialog');
    await expect(welcome.getByText('Onde vê o seu trabalho')).toBeVisible();
    await welcome.getByRole('button', { name: 'Seguinte' }).click();
    await welcome.getByRole('button', { name: 'Seguinte' }).click();
    await welcome.getByRole('button', { name: 'Começar' }).click();
    await expect(welcome).toBeHidden();
    await client.reload();
    await expect(client.getByRole('heading', { name: /^Olá/ })).toBeVisible();
    await expect(client.getByRole('dialog')).toHaveCount(0);

    await expect(client.getByRole('group', { name: 'Peças de conteúdo' })).toBeVisible();
    await client.getByRole('button', { name: /Pedir trabalho/ }).click();
    await client.getByLabel('O que precisa').fill(description);
    await client.getByRole('button', { name: 'Enviar pedido' }).click();
    await expect(client.getByRole('dialog')).toBeHidden({ timeout: 30_000 });

    const received = client.getByRole('region', { name: /^Recebido/ });
    await expect(received.getByText(description)).toBeVisible({ timeout: 30_000 });

    await signInWithPassword(page, credentials.founder);
    await page.goto(`/c/${seeded.clientId}/tasks`);
    await page.getByRole('button', { name: `Pedido do cliente: ${description}` }).click();
    const panel = page.getByRole('dialog');
    await panel.getByRole('combobox', { name: 'Responsável' }).click();
    await page
      .getByRole('option')
      .filter({ hasNotText: 'Sem responsável' })
      .first()
      .click();
    await expect(panel.getByRole('combobox', { name: 'Responsável' })).not.toContainText(
      'Sem responsável',
    );

    await client.reload();
    const inProgress = client.getByRole('region', { name: /^Em curso/ });
    await expect(inProgress.getByText(description)).toBeVisible({ timeout: 30_000 });
    await clientContext.close();
  });
});
