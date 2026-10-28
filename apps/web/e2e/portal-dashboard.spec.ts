import { expect, test } from '@playwright/test';
import { magicLinkPath } from './support/admin';
import { signInWithPassword } from './support/auth';
import { readCredentials } from './support/credentials';
import { seedRetainerClient } from './support/retainers';

const credentials = readCredentials();

test.describe('Portal dashboard', () => {
  test('the client takes the guided tour once, asks for work and follows it until the team takes it', async ({
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

    const tour = client.getByRole('dialog');
    await expect(tour.getByRole('heading', { name: 'Bem-vindo ao seu portal' })).toBeVisible();
    const finish = tour.getByRole('button', { name: 'Concluir' });
    while (!(await finish.isVisible())) {
      await tour.getByRole('button', { name: 'Seguinte' }).click();
    }
    await finish.click();
    await expect(tour).toBeHidden();
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
    await page
      .getByRole('button', { name: `Pedido do cliente: ${description}`, exact: true })
      .click();
    const panel = page.getByRole('dialog');
    await panel.getByRole('combobox', { name: 'Responsável' }).click();
    await page.getByRole('option').filter({ hasNotText: 'Sem responsável' }).first().click();
    await expect(panel.getByRole('combobox', { name: 'Responsável' })).not.toContainText(
      'Sem responsável',
    );

    const inProgress = client.getByRole('region', { name: /^Em curso/ });
    await expect(async () => {
      await client.reload();
      await expect(inProgress.getByText(description)).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 60_000 });
    await clientContext.close();
  });
});
